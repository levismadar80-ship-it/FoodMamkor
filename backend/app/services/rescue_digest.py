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
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import AlertLog, Producer, ProducerLocation, RescueOffer, RescueOrder, User
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
    parts = [f"{o.pickup_code} ({o.qty})" for o in sorted(orders, key=lambda o: o.pickup_code)]
    return _clean_param(", ".join(parts))


def build_window_param(offer: RescueOffer) -> str:
    """The {{2}} parameter: "18:00–20:00" on the Israel clock.

    `pickup_start`/`pickup_end` are naive-UTC columns; `israel_hhmm` is the
    repo's one owner of that conversion. An en dash, matching the buyer-facing
    copy.
    """
    return _clean_param(f"{israel_hhmm(offer.pickup_start)}–{israel_hhmm(offer.pickup_end)}")


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
        "skipped_capped": 0,
        "failed": 0,
        "skipped_gate_off": 0,
    }

    # Imported here, not at module scope: these three are owned by the router
    # module, and a service that imports a router at import time drags the
    # whole route tree into the scheduler worker's first tick. One owner for
    # the pilot gates (MEH-271) without the import-order cost.
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
            location = (
                db.query(ProducerLocation)
                .filter(ProducerLocation.id == offer.producer_location_id)
                .first()
            )
            if location is None:
                continue

            if not city_in_pilot(location.city):
                counts["skipped_not_in_pilot"] += 1
                continue

            reserved = (
                db.query(RescueOrder)
                .filter(
                    RescueOrder.offer_id == offer.id,
                    RescueOrder.status == "reserved",
                )
                .all()
            )
            if not reserved:
                # Left UNSTAMPED on purpose, same reasoning as pending_nudge's
                # no-addressable-owner branch: nothing was sent, so the column
                # must not claim otherwise. A reservation made later in the
                # window is then still digested on a later tick.
                counts["skipped_no_reserved"] += 1
                continue

            producer = (
                db.query(Producer).filter(Producer.id == location.producer_id).first()
            )
            if producer is None:
                continue

            phone = (producer.phone or "").strip()
            if not phone:
                counts["skipped_no_phone"] += 1
                continue

            owner = db.query(User).filter(User.producer_id == producer.id).first()
            if owner is None:
                # No owner row to attribute the AlertLog entry to, and the cap
                # is keyed on one. Skipped rather than sent uncapped.
                counts["skipped_no_phone"] += 1
                continue

            if _recently_sent(db, owner.id, producer.id):
                # Stamped, unlike every other skip above: the cap is a decision
                # about this offer, not a "not yet". Leaving it NULL would make
                # every later tick re-evaluate and re-log it for the rest of the
                # window. See the PR description — for a business with two
                # pickup points publishing on the same day, this suppresses the
                # second one's codes, and the cap's key cannot express "per
                # offer".
                offer.codes_sent_at = now
                db.commit()
                counts["skipped_capped"] += 1
                logger.info(
                    "[RESCUE-DIGEST] offer_id=%s capped (24h, channel=%s) — stamped",
                    offer.id,
                    CHANNEL_DIGEST,
                )
                continue

            template = RescueCodesDigestV1(
                producer_name=_clean_param(producer.name or ""),
                window=build_window_param(offer),
                codes=build_codes_param(reserved),
            )
            ok = send_template(phone, template)
            if not ok:
                # Unstamped: a Meta rejection or an unconfigured client is a
                # "not sent", and the next tick retries inside the window.
                counts["failed"] += 1
                logger.warning(
                    "[RESCUE-DIGEST] offer_id=%s send failed to %s",
                    offer.id,
                    mask_phone(phone),
                )
                continue

            offer.codes_sent_at = now
            db.add(
                AlertLog(
                    user_id=owner.id,
                    producer_id=producer.id,
                    channel=CHANNEL_DIGEST,
                    alert_type=ALERT_TYPE,
                )
            )
            db.commit()
            counts["sent"] += 1
            logger.info(
                "[RESCUE-DIGEST] offer_id=%s sent codes=%d to %s",
                offer.id,
                len(reserved),
                mask_phone(phone),
            )
        except Exception:
            db.rollback()
            counts["failed"] += 1
            logger.exception("[RESCUE-DIGEST] offer_id=%s crashed", offer.id)

    return counts
