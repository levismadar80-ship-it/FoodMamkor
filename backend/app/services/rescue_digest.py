"""
Module:   rescue_digest
Purpose:  At pickup_start, send one WhatsApp message per rescue offer to the
          BUSINESS, listing the day's pickup codes and how many bags each one
          is for, so the counter has the list without opening the dashboard.
Touches:  Reads rescue_offers / rescue_orders / producer_locations / producers /
          users; writes rescue_offers.codes_sent_at and one alert_log row per
          send; sends through the Meta WhatsApp Cloud API
          (services/whatsapp.py::send_template).
Does NOT: message the BUYER. The buyer already has the code from the
          reservation response and the confirmation email
          (services/rescue_emails.py) — this module only tells the business.
          It also does NOT move any order status, and it does NOT run inside a
          request: it is a scheduler tick (startup.py), because pickup_start is
          a clock event and `fire_alerts` fans out to consumers from inside a
          request (routers/rescue.py:17-21 records that decision).
Related:  app/services/pending_nudge.py:421 (the send-and-stamp shape this
          mirrors), app/services/whatsapp_templates.py (RescueCodesDigestV1),
          app/services/rescue_emails.py:27 (israel_hhmm — the one owner of
          naive-UTC → Israel HH:MM), app/routers/rescue.py:145 (the one owner
          of the pilot-town list).
History:  MEH-2756 (creation; the digest MEH-2646 deliberately left out).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import (
    AlertLog,
    Producer,
    ProducerLocation,
    RescueOffer,
    RescueOrder,
    User,
)
from app.services.rescue_emails import israel_hhmm
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import RescueCodesDigestV1
from app.config import settings
from app.utils.clock import utc_now
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)

# The AlertLog cap key is (user_id, producer_id, channel, sent_at) and
# `alert_type` is deliberately NOT part of it (models.py:1590-1606). A business
# digest sent on channel "whatsapp" would therefore collapse with a consumer
# favorite-alert about the same business within 24h — two unrelated messages,
# one budget. Its own channel keeps the two budgets disjoint with no schema
# change: `channel` is a free String(16) (models.py:1627) and this value is 15.
CHANNEL_DIGEST = "whatsapp_digest"
ALERT_TYPE = "rescue_codes_digest"

_CAP_WINDOW = timedelta(hours=24)

# Meta rejects a template parameter containing a newline, a tab or 5+
# consecutive spaces, and `send_template` returns False without raising — so a
# stray one would make the digest fail silently. Stripped here, in the only
# place that builds the parameter.
_FORBIDDEN_IN_PARAM = str.maketrans({"\n": " ", "\r": " ", "\t": " "})


def _clean_param(value: str) -> str:
    """One line, no tabs, no run of 5+ spaces — safe as a template parameter."""
    out = " ".join(value.translate(_FORBIDDEN_IN_PARAM).split())
    return out


def build_codes_param(orders: list[RescueOrder]) -> str:
    """The {{3}} parameter: "0431 (2), 0887 (1)", in code order.

    Sorted by code, not by reservation time: the person at the counter is
    matching four digits a customer just said against a list, so the list has
    to be scannable, and arrival order is noise for that job.
    """
    parts = [
        f"{o.pickup_code} ({o.qty})"
        for o in sorted(orders, key=lambda o: o.pickup_code)
    ]
    return _clean_param(", ".join(parts))


def build_window_param(offer: RescueOffer) -> str:
    """The {{2}} parameter: "18:00–20:00" on the Israel clock.

    `pickup_start`/`pickup_end` are naive-UTC columns; `israel_hhmm` is the
    repo's one owner of that conversion. An en dash, matching the buyer-facing
    copy.
    """
    return _clean_param(
        f"{israel_hhmm(offer.pickup_start)}–{israel_hhmm(offer.pickup_end)}"
    )


def digest_enabled() -> bool:
    """The send gate, separate from the pilot flag on purpose.

    `RESCUE_BAGS_ENABLED` opens the feature to buyers; this one opens the
    outbound WhatsApp. They are different decisions because this one cannot be
    turned on until Meta has APPROVED `rescue_codes_digest_v1` — before that,
    every send answers 132001 and fails silently. Default False, so merging
    this PR sends nothing.

    Read through `getattr`, for the same reason `rescue_bags_enabled` is
    (`routers/rescue.py:145`): `config.py` is denied to Claude Code, so Sapir
    adds the field from the patch in the PR body, and until she does this
    reads False rather than raising.
    """
    return bool(getattr(settings, "rescue_digest_enabled", False))


def _recently_sent(db: Session, user_id, producer_id) -> bool:
    """True if a digest already went to (owner, business) on this channel in 24h."""
    cutoff = utc_now() - _CAP_WINDOW
    return db.query(
        db.query(AlertLog)
        .filter(
            AlertLog.user_id == user_id,
            AlertLog.producer_id == producer_id,
            AlertLog.channel == CHANNEL_DIGEST,
            AlertLog.sent_at >= cutoff,
        )
        .exists()
    ).scalar()


@dataclass(frozen=True)
class _Target:
    """Who the digest goes to and what it says — resolved while the Session is
    open, so nothing below re-queries a detached row."""

    producer: Producer
    owner: User
    phone: str
    reserved: list[RescueOrder]


def _resolve_target(db: Session, offer: RescueOffer, city_in_pilot) -> _Target | str:
    """The recipient and the payload, or the counter key saying why not.

    Split from `_digest_one` so that one owns "can this be sent" and the other
    owns "send it and record it" — which also keeps both inside Ruff's
    PLR0911/C901 budgets. Two shapes share one key on purpose: a missing
    location and a missing producer are both `skipped_no_location`, and a blank
    phone and a missing owner row are both `skipped_no_phone`, because the
    operator's question in each pair is the same one.
    """
    # One join rather than two queries: the offer hangs off a location, and the
    # location's producer is what the message is addressed to.
    row = (
        db.query(ProducerLocation, Producer)
        .join(Producer, Producer.id == ProducerLocation.producer_id)
        .filter(ProducerLocation.id == offer.producer_location_id)
        .first()
    )
    if row is None:
        return "skipped_no_location"
    location, producer = row

    if not city_in_pilot(location.city):
        return "skipped_not_in_pilot"

    reserved = (
        db.query(RescueOrder)
        .filter(
            RescueOrder.offer_id == offer.id,
            RescueOrder.status == "reserved",
        )
        .all()
    )
    if not reserved:
        # Left UNSTAMPED by the caller, same reasoning as pending_nudge's
        # no-addressable-owner branch: nothing was sent, so the column must not
        # claim otherwise. A reservation made later in the window is then still
        # digested on a later tick.
        return "skipped_no_reserved"

    phone = (producer.phone or "").strip()
    # The owner row is needed for the AlertLog cap, which is keyed on a user.
    # No phone or no owner ⇒ nothing is sent and nothing is stamped.
    owner = db.query(User).filter(User.producer_id == producer.id).first()
    if not phone or owner is None:
        return "skipped_no_phone"

    return _Target(producer=producer, owner=owner, phone=phone, reserved=reserved)


def _digest_one(db: Session, offer: RescueOffer, now, city_in_pilot) -> str:
    """Send ONE offer's digest. Returns the counter key to increment.

    Raises nothing it can help; the caller is the fail-isolation boundary.
    """
    target = _resolve_target(db, offer, city_in_pilot)
    if isinstance(target, str):
        return target

    if _recently_sent(db, target.owner.id, target.producer.id):
        # Stamped, unlike every other skip: the cap is a decision about this
        # offer, not a "not yet". Leaving it NULL would make every later tick
        # re-evaluate and re-log it for the rest of the window. See the PR
        # description — for a business with two pickup points publishing on the
        # same day this suppresses the second one's codes, and the cap's key
        # cannot express "per offer".
        offer.codes_sent_at = now
        db.commit()
        logger.info(
            "[RESCUE-DIGEST] offer_id=%s capped (24h, channel=%s) — stamped",
            offer.id,
            CHANNEL_DIGEST,
        )
        return "skipped_capped"

    template = RescueCodesDigestV1(
        producer_name=_clean_param(target.producer.name or ""),
        window=build_window_param(offer),
        codes=build_codes_param(target.reserved),
    )
    if not send_template(target.phone, template):
        # Unstamped: a Meta rejection or an unconfigured client is a "not sent",
        # and the next tick retries inside the window.
        logger.warning(
            "[RESCUE-DIGEST] offer_id=%s send failed to %s",
            offer.id,
            mask_phone(target.phone),
        )
        return "failed"

    offer.codes_sent_at = now
    db.add(
        AlertLog(
            user_id=target.owner.id,
            producer_id=target.producer.id,
            channel=CHANNEL_DIGEST,
            alert_type=ALERT_TYPE,
        )
    )
    db.commit()
    logger.info(
        "[RESCUE-DIGEST] offer_id=%s sent codes=%d to %s",
        offer.id,
        len(target.reserved),
        mask_phone(target.phone),
    )
    return "sent"


def send_rescue_digests(db: Session) -> dict[str, int]:
    """Scheduler entry point. One digest per due offer; never raises.

    Due means ALL of: status active · `codes_sent_at` IS NULL · `pickup_start`
    has passed · `pickup_end` has NOT · the pickup town is in the pilot list ·
    at least one order still `reserved`.

    **An offer whose window closes before a digest goes out stays NULL
    forever**, and that is deliberate, not a leak: `pickup_end > now` drops it
    from the candidate set, so it costs no repeated work, and codes for a
    window that already ended are worse than no message. NULL therefore reads
    as "not digested", which covers both "not yet" and "never" — the filter is
    what distinguishes them, not the column.

    Which outcomes stamp and which do not is `_digest_one`'s decision, branch
    by branch; read it for the reasoning.

    Fail-isolated per offer, like `run_watchdog`: one business's bad phone
    number or Meta rejection must not cost the others their codes. The
    aggregate counters are the return value and the only thing the caller logs.
    """
    counts = {
        "scanned": 0,
        "sent": 0,
        "skipped_no_reserved": 0,
        "skipped_not_in_pilot": 0,
        "skipped_no_phone": 0,
        "skipped_no_location": 0,
        "skipped_capped": 0,
        "failed": 0,
        "skipped_gate_off": 0,
    }

    # Imported here, not at module scope: these are owned by the router module,
    # and a service that imports a router at import time drags the whole route
    # tree into the scheduler worker's first tick. One owner for the pilot
    # gates (MEH-271) without the import-order cost.
    from app.routers.rescue import city_in_pilot, rescue_bags_enabled

    if not rescue_bags_enabled():
        return counts

    # Checked here as well as at registration (startup.py). The registration
    # gate is read once at boot; this one is read every tick, so flipping the
    # env var off stops sends at the next tick instead of at the next deploy.
    # It also lets a test exercise the gate without a scheduler.
    if not digest_enabled():
        counts["skipped_gate_off"] = 1
        return counts

    now = utc_now()
    now_naive = now.replace(tzinfo=None)

    offers = (
        db.query(RescueOffer)
        .filter(
            RescueOffer.status == "active",
            RescueOffer.codes_sent_at.is_(None),
            RescueOffer.pickup_start <= now_naive,
            RescueOffer.pickup_end > now_naive,
        )
        .all()
    )

    for offer in offers:
        counts["scanned"] += 1
        try:
            counts[_digest_one(db, offer, now, city_in_pilot)] += 1
        except Exception:
            db.rollback()
            counts["failed"] += 1
            logger.exception("[RESCUE-DIGEST] offer_id=%s crashed", offer.id)

    return counts
