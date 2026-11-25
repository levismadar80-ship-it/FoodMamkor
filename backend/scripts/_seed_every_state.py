"""
Module:   _seed_every_state
Purpose:  Put one demo row in every status the site can show, so staging has
          a business waiting for approval, a rejected recipe, a full workshop,
          a no-show surprise bag and the rest — not only the "everything is
          fine" state the main demo seed draws (MEH-3761).
Touches:  users, producers, experiences, registrations, rescue_offers,
          rescue_orders, group_buys, group_buy_commits, producer_recipes,
          producer_reviews (+ the paused business's rating aggregate), reports,
          category_requests, producer_name_change_requests,
          kashrut_badge_requests, outreach_leads, billable_events.
Does NOT: decide where it may run — seed_demo_business.py's
          `_assert_not_production` already refused before this is called.
          Does NOT seed what has no live screen: product orders, business
          billing, neighbour products, WhatsApp messages (STATE_MACHINES.md
          «Every status column»). Does NOT write any Hebrew that is not in the
          approved table below.
Related:  backend/scripts/seed_demo_business.py `main` (the caller) ·
          backend/scripts/check_seed_coverage.py (one surface per state here) ·
          docs/STATE_MACHINES.md · /mnt/project-files/staging-data/seed-every-state-plan.md.
History:  MEH-3761 (creation; plan card MEH-3630).
"""

from __future__ import annotations

import secrets
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any

from app.models.admin_ops import (
    CategoryRequest,
    KashrutBadgeRequest,
    OutreachLead,
    ProducerNameChangeRequest,
)
from app.models.billing import BillableEvent
from app.models.engagement import ProducerReview, Report
from app.models.events import Experience, GroupBuy, GroupBuyCommit, Registration
from app.models.models import Producer, ProducerLocation, User
from app.models.recipes import ProducerRecipe
from app.models.rescue import RescueOffer, RescueOrder
from app.pricing import current_price_list
from app.services.review_conflicts import recompute_producer_rating
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now

# MEH-3761: every Hebrew string below was approved word for word by Sapir in
# the project thread (plan table rows 1-23). DO NOT add Hebrew here without that approval
# (workflow rule 22). Where a column needs text the table has no row for
# (a description, ingredients), the row's own approved title is reused.
COPY = {
    "biz_draft": "מאפיית הגבעה (דמו)",
    "biz_pending": "משק הזיתים של נועה (דמו)",
    "biz_rejected": "גבינות העמק (דמו)",
    "biz_rejected_reason": "חסרות תמונות של המוצרים ורישיון עסק.",
    "biz_paused": "דבש מהכרם (דמו)",
    "exp_rejected": "סדנת לחם מחמצת למתחילים",
    "exp_cancelled": "ערב טעימות שמן זית",
    "exp_past": "סדנת ריבות עונתיות",
    "exp_full": "סדנת גבינות בית",
    "gb_funded": 'ארגז תפוזים מהפרדס, 10 ק"ג',
    "gb_fulfilled": "שמן זית כתית, פח 4 ליטר",
    "gb_cancelled": 'ארגז אבוקדו, 5 ק"ג',
    "gb_expired": "דבש פרחי בר, 3 צנצנות",
    "recipe_pending": "פוקאצ'ה עם זעתר",
    "recipe_rejected": "עוגת גבינה אפויה",
    "recipe_rejected_note": "המתכון לא מציין כמויות.",
    "recipe_revision": "שקשוקה ירוקה",
    "recipe_revision_note": "חסר שלב הבישול של התרד.",
    "review_hidden": "שירות איטי, לא אחזור.",
    "review_flagged": "מחירים מטורפים, גניבה לאור יום!!!",
    "reply_flagged": "אם לא מתאים לך, אל תבואי.",
    "report_reason": "הטלפון של העסק לא עונה.",
    "category_request": "חליטות ותה צמחים",
    "name_change": "מאפיית הגבעה והכפר",
    "lead_new": "מטבח של סבתא רחל",
    "lead_contacted": "חלבת הגליל",
    "lead_declined": "פירות יער מהצפון",
}

DEMO_SLUG = "ruach-hasadeh"
OWNER_EMAIL = "demo-owner@example.com"
MARKER_SLUG = "demo-state-draft"
PAUSED_SLUG = "demo-state-paused"
STATE_EMAIL = "state-{}@example.com"


def _user(db: Any, key: str, **extra: Any) -> User:
    """A demo account nobody signs in to: a random, unrecorded password."""
    from app.auth import hash_password  # heavy import, only when seeding

    existing = db.query(User).filter(User.email == STATE_EMAIL.format(key)).first()
    if existing is not None:
        return existing
    extra.setdefault("email_verified", True)
    user = User(
        email=STATE_EMAIL.format(key),
        name=f"Demo {key}",  # English: no Hebrew without approval
        password_hash=hash_password(secrets.token_urlsafe(24)),
        **extra,
    )
    db.add(user)
    db.flush()
    return user


def _business(db: Any, slug: str, name: str, status: str, **extra: Any) -> Producer:
    owner = _user(db, slug.removeprefix("demo-state-") + "-owner", role="producer")
    biz = Producer(
        name=name,
        slug=slug,
        status=status,
        kind="producer",
        city="תל אביב",
        has_physical_location=True,
        offers_delivery=False,
        **extra,
    )
    db.add(biz)
    db.flush()
    owner.producer_id = biz.id
    return biz


def _seed_businesses_and_users(db: Any) -> dict[str, Producer]:
    now = utc_now()
    businesses = {
        "draft": _business(db, MARKER_SLUG, COPY["biz_draft"], "draft"),
        "pending": _business(
            db,
            "demo-state-pending",
            COPY["biz_pending"],
            "pending",
            submitted_for_review_at=now - timedelta(days=2),
        ),
        "rejected": _business(
            db,
            "demo-state-rejected",
            COPY["biz_rejected"],
            "rejected",
            rejection_reason=COPY["biz_rejected_reason"],
            submitted_for_review_at=now - timedelta(days=6),
        ),
        "paused": _business(db, PAUSED_SLUG, COPY["biz_paused"], "inactive"),
    }
    _user(db, "blocked", role="consumer", is_blocked=True)
    _user(db, "unverified", role="consumer", email_verified=False)
    return businesses


def _seed_experiences(db: Any, host: User) -> Experience:
    today = israel_today()

    def exp(title: str, status: str, days: int, **extra: Any) -> Experience:
        row = Experience(
            title=title,
            description=title,
            host_user_id=host.id,
            event_date=today + timedelta(days=days),
            event_time=time(18, 0),
            city="תל אביב",
            status=status,
            moderation_status="APPROVED",
            max_participants=extra.pop("max_participants", 12),
            **extra,
        )
        db.add(row)
        db.flush()
        return row

    exp(COPY["exp_rejected"], "rejected", 14)
    exp(COPY["exp_cancelled"], "approved", 9, is_active=False)
    exp(COPY["exp_past"], "approved", -7)
    full = exp(
        COPY["exp_full"], "approved", 12, max_participants=2, participants_count=2
    )
    return full


def _seed_registrations(db: Any, full: Experience) -> list[Registration]:
    rows = []
    for i, (status, party) in enumerate(
        (("registered", 2), ("waitlisted", 1), ("cancelled", 1))
    ):
        row = Registration(
            experience_id=full.id,
            name=f"Demo guest {i + 1}",
            phone="0500000000",
            email=STATE_EMAIL.format(f"guest-{i + 1}"),
            cancel_token=secrets.token_urlsafe(32)[:64],
            status=status,
            party_size=party,
            cancelled_at=utc_now() if status == "cancelled" else None,
        )
        db.add(row)
        rows.append(row)
    db.flush()
    return rows


def _seed_rescue(db: Any, demo: Producer, buyers: list[User]) -> None:
    location = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == demo.id,
            ProducerLocation.is_primary.is_(True),
        )
        .first()
    )
    if location is None:
        return
    today = israel_today()

    def at(hour: int) -> datetime:
        return datetime.combine(today, time(hour, 0), ISRAEL_TZ)

    common = dict(
        producer_location_id=location.id,
        date=today,
        price_agorot=1500,
        pickup_start=at(18),
        pickup_end=at(20),
        cancel_until=at(16),
    )
    db.add(RescueOffer(qty_total=3, qty_left=3, status="cancelled", **common))
    offer = RescueOffer(qty_total=6, qty_left=3, status="active", **common)
    db.add(offer)
    db.flush()
    for i, status in enumerate(("reserved", "handed", "no_show", "cancelled")):
        db.add(
            RescueOrder(
                offer_id=offer.id,
                user_id=buyers[i].id,
                qty=1,
                pickup_code=f"{1000 + i}",
                status=status,
                handed_at=utc_now() if status == "handed" else None,
                cancelled_at=utc_now() if status == "cancelled" else None,
            )
        )


def _seed_group_buys(db: Any, demo: Producer, buyers: list[User]) -> None:
    now = utc_now()
    for key, status, days in (
        ("gb_funded", "funded", 5),
        ("gb_fulfilled", "fulfilled", -3),
        ("gb_cancelled", "cancelled", 2),
        ("gb_expired", "open", -1),
    ):
        gb = GroupBuy(
            producer_id=demo.id,
            title=COPY[key],
            product_name=COPY[key],
            price_per_unit_regular=Decimal("120.00"),
            price_per_unit_group=Decimal("95.00"),
            min_participants=2,
            deadline=now + timedelta(days=days),
            status=status,
        )
        db.add(gb)
        db.flush()
        if status in ("funded", "fulfilled"):
            # MEH-3735: a fixed code per seat, unique inside this group.
            for seat, buyer in enumerate(buyers[:2]):
                db.add(
                    GroupBuyCommit(
                        group_buy_id=gb.id,
                        user_id=buyer.id,
                        quantity=1,
                        pickup_code=f"{2001 + seat:04d}",
                    )
                )


def _seed_recipes(db: Any, demo: Producer) -> None:
    for title, status, note in (
        (COPY["recipe_pending"], "pending", None),
        (COPY["recipe_rejected"], "rejected", COPY["recipe_rejected_note"]),
        (COPY["recipe_revision"], "needs_revision", COPY["recipe_revision_note"]),
    ):
        db.add(
            ProducerRecipe(
                producer_id=demo.id,
                title=title,
                ingredients=title,
                instructions=title,
                moderation_status=status,
                moderation_notes=note,
                published=True,
            )
        )


def _seed_reviews(db: Any, paused: Producer, reviewers: list[User]) -> None:
    # MEH-3761: on the paused business, not the demo one. A FLAGGED review
    # still publishes and counts in the rating (reviews.py, MEH-2390), so on
    # /ruach-hasadeh it would put abusive demo text on the public page and
    # move the rating the VRT and seed tests read. /admin/reviews lists every
    # business's reviews, so the admin queue shows them all the same.
    owner_reply_at = utc_now()
    db.add(
        ProducerReview(
            producer_id=paused.id,
            user_id=reviewers[0].id,
            stars=1,
            body=COPY["review_hidden"],
            is_hidden=True,
        )
    )
    db.add(
        ProducerReview(
            producer_id=paused.id,
            user_id=reviewers[1].id,
            stars=1,
            body=COPY["review_flagged"],
            ai_moderation_status="FLAGGED",
        )
    )
    db.add(
        ProducerReview(
            producer_id=paused.id,
            user_id=reviewers[2].id,
            stars=3,
            body=None,
            ai_moderation_status="APPROVED",
            reply=COPY["reply_flagged"],
            reply_at=owner_reply_at,
            reply_ai_moderation_status="FLAGGED",
        )
    )


def _seed_reports_and_kashrut(db: Any, demo: Producer, reporters: list[User]) -> None:
    now = utc_now()
    for reporter, status in zip(reporters, ("open", "resolved", "dismissed")):
        db.add(
            Report(
                reporter_id=reporter.id,
                producer_id=demo.id,
                reason=COPY["report_reason"],
                status=status,
                resolved_at=None if status == "open" else now,
            )
        )
    for code, status in (
        ("rabanut", "pending"),
        ("mehadrin", "rejected"),
        ("shmitta", "revoked"),
    ):
        db.add(KashrutBadgeRequest(producer_id=demo.id, badge_code=code, status=status))


def _seed_billing(db: Any, demo: Producer, registrations: list[Registration]) -> None:
    version = current_price_list().version
    for reg, status in zip(registrations, ("counted", "voided")):
        db.add(
            BillableEvent(
                producer_id=demo.id,
                kind="experience_registration",
                source_id=reg.id,
                quantity=reg.party_size,
                price_list_version=version,
                status=status,
                voided_at=utc_now() if status == "voided" else None,
            )
        )


def _seed_standalone(db: Any) -> None:
    """Rows that hang off nothing in the main demo: the four businesses, the
    blocked and unverified accounts, and the queues that point at them."""
    businesses = _seed_businesses_and_users(db)
    now = utc_now()
    for status in ("pending", "approved", "rejected"):
        db.add(
            CategoryRequest(
                requested_name=COPY["category_request"],
                producer_id=businesses["draft"].id,
                status=status,
                reviewed_at=None if status == "pending" else now,
            )
        )
        db.add(
            ProducerNameChangeRequest(
                producer_id=businesses["draft"].id,
                current_name=COPY["biz_draft"],
                requested_name=COPY["name_change"],
                status=status,
                reviewed_at=None if status == "pending" else now,
            )
        )
    for name, status in (
        (COPY["lead_new"], "new"),
        (COPY["lead_contacted"], "contacted"),
        (COPY["biz_draft"], "replied"),
        (COPY["biz_pending"], "registered"),
        (COPY["lead_declined"], "declined"),
    ):
        db.add(OutreachLead(name=name, status=status, city="תל אביב"))
    reviewers = [_user(db, f"reviewer-{i}", role="consumer") for i in range(1, 4)]
    _seed_reviews(db, businesses["paused"], reviewers)


def _seed_on_demo(db: Any, demo: Producer, host: User) -> None:
    """Rows that hang off the demo business or its owner. `--refresh` deletes
    and recreates both, so these are re-added whenever they are missing."""
    people = [_user(db, f"buyer-{i}", role="consumer") for i in range(1, 5)]
    full = _seed_experiences(db, host)
    registrations = _seed_registrations(db, full)
    _seed_rescue(db, demo, people)
    _seed_group_buys(db, demo, people)
    _seed_recipes(db, demo)
    _seed_reports_and_kashrut(db, demo, people[:3])
    _seed_billing(db, demo, registrations)


def seed_every_state(db: Any) -> bool:
    """Add the every-state rows, each half only when it is missing, so the
    plain seed (run on every reset) adds nothing twice and a `--refresh` of
    the demo business gets its half back. Returns True when it seeded.
    """
    demo = db.query(Producer).filter(Producer.slug == DEMO_SLUG).first()
    host = db.query(User).filter(User.email == OWNER_EMAIL).first()
    if demo is None or host is None:
        print(
            f"Demo business /{DEMO_SLUG} or its owner missing — skipping every-state rows."
        )
        return False
    seeded = False
    if db.query(Producer).filter(Producer.slug == MARKER_SLUG).first() is None:
        _seed_standalone(db)
        seeded = True
    on_demo = (
        db.query(ProducerRecipe)
        .filter(
            ProducerRecipe.producer_id == demo.id,
            ProducerRecipe.title == COPY["recipe_pending"],
        )
        .first()
    )
    if on_demo is None:
        _seed_on_demo(db, demo, host)
        seeded = True
    db.commit()
    paused = db.query(Producer).filter(Producer.slug == PAUSED_SLUG).first()
    if seeded and paused is not None:
        # After the commit: it commits on its own, and a commit in the middle
        # would leave a half seeded behind the marker that skips it next time.
        recompute_producer_rating(paused.id, db)
    print(
        "Seeded every-state demo rows (MEH-3761)."
        if seeded
        else "Every-state demo rows already present — skipping."
    )
    return seeded
