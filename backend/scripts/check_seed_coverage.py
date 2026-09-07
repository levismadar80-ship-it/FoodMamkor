"""
Module:   check_seed_coverage
Purpose:  Enforce the demo-seed coverage contract (MEH-1706): every feature
          surface the demo business is supposed to exercise must resolve to at
          least one row after a local seed run, and every mapped table must be
          consciously classified as either seeded or exempt. A feature that
          ships without a seed row reaches staging invisible — MEH-1672 shipped
          the kashrut certificate view with zero `cert_url` anywhere, and
          MEH-1691 could not be verified on the flagship because it had no
          `order_window`.
Touches:  Reads the DB named by DATABASE_URL — SELECT and COUNT only. NO
          WRITES: never INSERT, UPDATE or DELETE. Reads SQLAlchemy metadata to
          enumerate mapped tables.
Does NOT: seed anything (backend/scripts/seed_demo_business.py owns that) and
          does NOT run against staging or production. It is CI-LOCAL BY
          DESIGN — see "Scope limit" below, which is the single most important
          paragraph in this file. Does NOT check row *content*, only presence.
          Does NOT drop or create tables (Alembic is the sole schema authority,
          MEH-267).
Related:  backend/scripts/seed_demo_business.py (the seed this verifies) ·
          docs/SEED_COVERAGE.md (the human-readable contract, chunk A) ·
          the workflow schema-drift gate whose shape this mirrors ·
          backend/scripts/check_no_demo_data.py (the "Does NOT:" convention
          this docstring follows).
History:  MEH-1706 chunk C (creation).

Scope limit — READ THIS BEFORE TRUSTING A GREEN RUN
---------------------------------------------------
This gate runs against a LOCAL database inside CI, seeded from scratch by the
job that invokes it. It therefore protects against ONE thing: **code drift** —
a feature surface added to the models without a corresponding seed row.

It does NOT and CANNOT protect staging. A staging database that has been wiped,
or whose demo business was deleted, stays perfectly green here, because this
never connects to it. Staging is protected operationally instead, from two
places: MEH-1707 (`--reset` no longer deletes the flagship) and
`seed_demo_business.py --refresh` when a restore is needed.

Do NOT add a `--staging` mode or any remote-database path. That was considered
and explicitly ruled out in MEH-1706 §2.4 under the over-engineering guard.

Run:
    python backend/scripts/check_seed_coverage.py        # after a local seed
    python backend/scripts/check_seed_coverage.py --json

Exit 0 = every surface covered and every table classified.
Exit 1 = at least one surface empty, or a table nobody has classified.
"""

import argparse
import json
import os
import sys

# Make `backend/` importable as package root when run directly (script shim).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from sqlalchemy import text  # noqa: E402  # imports follow sys.path.insert
from app.database import SessionLocal  # noqa: E402
from app.models.models import Base  # noqa: E402

# ---------------------------------------------------------------------------
# The contract. Each entry is a surface from docs/SEED_COVERAGE.md that the
# demo seed is expected to populate, expressed as a COUNT that must be >= 1.
#
# `table` is what ties a surface to the classification pass below; `where`
# narrows it when several surfaces share one table (the experiences moderation
# states, the producer column-level surfaces).
#
# A surface is named after the INPUT it covers, not the class it belongs to —
# "experiences/pending" cannot pretend to cover "experiences/changes_requested".
# ---------------------------------------------------------------------------
SEEDED_SURFACES = [
    # --- core listing ---
    {"surface": "producers", "table": "producers", "where": None},
    {"surface": "products", "table": "products", "where": None},
    {"surface": "categories", "table": "categories", "where": None},
    {"surface": "producer_categories", "table": "producer_categories", "where": None},
    {"surface": "users", "table": "users", "where": None},
    {"surface": "delivery_areas", "table": "delivery_areas", "where": None},
    {"surface": "producer_locations", "table": "producer_locations", "where": None},
    {"surface": "reviews", "table": "producer_reviews", "where": None},
    {
        "surface": "reviews/with_reply",
        "table": "producer_reviews",
        "where": "reply IS NOT NULL",
    },
    {"surface": "recipes", "table": "producer_recipes", "where": None},
    {
        "surface": "recipes/product_link",
        "table": "producer_recipe_products",
        "where": None,
    },
    {"surface": "events", "table": "events", "where": None},
    # --- MEH-1706 §2 item 2: experiences + the moderation queue ---
    {
        "surface": "experiences/approved",
        "table": "experiences",
        "where": "status = 'approved'",
    },
    {
        "surface": "experiences/pending",
        "table": "experiences",
        "where": "status = 'pending'",
    },
    {
        "surface": "experiences/changes_requested",
        "table": "experiences",
        "where": "status = 'changes_requested'",
    },
    # --- MEH-1706 §2 item 1: group buys ---
    {"surface": "group_buys", "table": "group_buys", "where": None},
    {"surface": "group_buys/open", "table": "group_buys", "where": "status = 'open'"},
    {"surface": "group_buy_commits", "table": "group_buy_commits", "where": None},
    # --- MEH-1706 §2 item 4: kashrut certificate ---
    {
        "surface": "kashrut/badge_request_with_cert",
        "table": "kashrut_badge_requests",
        "where": "cert_url IS NOT NULL AND status = 'approved'",
    },
    {
        "surface": "kashrut/badges_on_producer",
        "table": "producers",
        "where": "cardinality(kashrut_badges) > 0",
    },
    # --- MEH-1706 §2 item 3: order window ---
    {
        "surface": "order_window",
        "table": "producers",
        "where": "order_window IS NOT NULL",
    },
    # --- MEH-1706 §2 item 5: contact channels (MEH-296) ---
    {
        "surface": "contact/website",
        "table": "producers",
        "where": "website IS NOT NULL",
    },
    {
        "surface": "contact/facebook",
        "table": "producers",
        "where": "facebook IS NOT NULL",
    },
    {
        "surface": "contact/instagram",
        "table": "producers",
        "where": "instagram IS NOT NULL",
    },
    {
        "surface": "contact/external_order_form",
        "table": "producers",
        "where": "external_order_form IS NOT NULL",
    },
    {
        "surface": "contact/whatsapp_group",
        "table": "producers",
        "where": "whatsapp_group IS NOT NULL",
    },
    {
        "surface": "contact/email",
        "table": "producers",
        "where": "contact_email IS NOT NULL",
    },
    # --- MEH-1706 §2 items 6-7: google rating row + OwnerCard ---
    {
        "surface": "google_place_id",
        "table": "producers",
        "where": "google_place_id IS NOT NULL",
    },
    {
        "surface": "owner_card/bio",
        "table": "producers",
        "where": "owner_bio IS NOT NULL",
    },
    {
        "surface": "owner_card/photo",
        "table": "producers",
        "where": "owner_photo_url IS NOT NULL",
    },
    # --- MEH-1706 §2 item 8: nationwide delivery with exclusions (MEH-1255) ---
    {
        "surface": "delivery/nationwide",
        "table": "producers",
        "where": "delivery_nationwide IS TRUE",
    },
    {
        "surface": "delivery/excluded_cities",
        "table": "producers",
        "where": "cardinality(delivery_excluded_cities) > 0",
    },
    # --- MEH-1706 §2 item 9: availability states ---
    {
        "surface": "availability/full_this_week",
        "table": "producers",
        "where": "availability_state = 'full_this_week'",
    },
    {
        "surface": "availability/on_vacation",
        "table": "producers",
        "where": "availability_state = 'on_vacation'",
    },
    {
        "surface": "availability/vacation_until",
        "table": "producers",
        "where": "vacation_until IS NOT NULL",
    },
    # --- MEH-1528: dietary scope demos ---
    {
        "surface": "dietary/gluten_free_facility",
        "table": "producers",
        "where": "gluten_free_facility = 'dedicated'",
    },
    # --- MEH-1399: the admin pre-approval review checklist ---
    # Seeded by the MIGRATION, not by either seed script: revision
    # d4a9c31e6f82 ends in a `bulk_insert` of seven reference rows
    # (20260821_1700_..._meh1399_admin_review_checklist.py:146), because a
    # config table shipped empty renders an empty admin surface. Every
    # environment runs `alembic upgrade head`, so the count holds here for the
    # same reason it holds on staging — and this gate runs immediately after
    # that upgrade, which is what makes the assertion checkable rather than
    # decorative. It is a surface and not an exemption precisely because it can
    # be asserted: drop the bulk_insert and this goes red.
    #
    # Not the `cities` case (exempt below). `cities` is exempt because it is
    # EMPTY after a local seed, so no count assertion is available at all;
    # here one is.
    {
        "surface": "admin_review_checklist",
        "table": "admin_checklist_items",
        "where": None,
    },
]

# ---------------------------------------------------------------------------
# Tables deliberately NOT seeded. Every mapped table must appear either here or
# in SEEDED_SURFACES — that is what makes a NEW model turn the PR red rather
# than silently joining an unchecked majority. Reasons are load-bearing: a bare
# set would let anyone quiet the gate by adding a name.
# ---------------------------------------------------------------------------
EXEMPT_TABLES = {
    # MEH-1706 §2 items 10-13 — the amber rows, explicitly out of chunk B scope.
    "producer_page_views": "analytics — runtime telemetry, item 10 (out of scope)",
    "producer_contact_clicks": "analytics — runtime telemetry, item 10 (out of scope)",
    "producer_whatsapp_clicks": "analytics — runtime telemetry, item 10 (out of scope)",
    # MEH-2079 chunk A — the daily roll-up of the two tables above. Exempt for
    # the same reason they are, and for one more: chunk A creates it with NO
    # writer, so the only way a row could exist is if the demo seed fabricated
    # one. That would assert traffic a demo business never received, on a
    # surface no reader consumes yet. Chunk B's scheduled roll-up is what fills
    # it, from rows the seed does not create either.
    "producer_analytics_daily": "MEH-2079 analytics roll-up — derived from the two exempt raw tables above; seeding it would fabricate traffic",
    "search_queries": "analytics — runtime telemetry, item 10 (out of scope)",
    "referral_clicks": "analytics — runtime telemetry, item 13 (out of scope)",
    "favorites": "consumer action — item 11 (out of scope)",
    "favorite_alerts": "consumer action — item 11 (out of scope)",
    "producer_followers": "consumer action (out of scope)",
    "reports": "admin queue — item 12 (out of scope)",
    "category_requests": "admin queue — item 12 (out of scope)",
    "outreach_leads": "admin queue — item 12 (out of scope)",
    "producer_name_change_requests": "admin queue (out of scope)",
    # MEH-1399 audit record — one row per checklist item an admin actually
    # ticked. Its own model says "an UNCHECKED item is the ABSENCE of a row,
    # not a row with a false flag" (models.py:2324), so a seed row here would
    # not demonstrate a surface — it would assert that an admin reviewed the
    # demo business when none did. Written at runtime by the approvals queue.
    "producer_review_checks": "MEH-1399 admin audit trail — written when an admin ticks an item; absence of a row IS the unchecked state, so seeding one would fabricate a review",
    "home_products": "neighbour-products surface — item 13 (out of scope)",
    "home_product_ratings": "neighbour-products surface — item 13 (out of scope)",
    "home_product_whatsapp_clicks": "neighbour-products surface — item 13 (out of scope)",
    "producer_offers": "MEH-1823 offers — no seed row yet (candidate for a follow-up)",
    # Infrastructure / runtime-only tables: nothing to seed by design.
    "admin_settings": "runtime config, written by the admin panel",
    "alert_log": "runtime log",
    "contact_messages": "inbound form submissions — runtime only",
    "inbound_messages": "messaging runtime",
    "outbound_messages": "messaging runtime",
    "newsletter_subscribers": "runtime opt-ins",
    "phone_otp_tokens": "short-lived auth tokens (MEH-51)",
    "static_pages": "CMS content, seeded separately when it exists",
    # `cities` is EMPTY after a full local seed — measured, not assumed. It is
    # owned by backend/scripts/seed_cities.py, not by seed_data.py, so it is
    # exempt HERE rather than covered. MEH-1349 was exactly this table being
    # empty in a real environment; that is an operational gap, not a code-drift
    # one, so it is out of this gate's reach (see the scope limit above).
    "cities": "owned by seed_cities.py, not the demo seed — see MEH-1349",
}


def _classification_drift() -> list[str]:
    """Every mapped table must be classified. Returns unclassified table names.

    This is the half that makes a NEW model red the PR: adding a table without
    deciding whether the demo seeds it lands here, exactly as a new table
    without an EXPECTED_TABLES bump reds the schema gate.
    """
    classified = {s["table"] for s in SEEDED_SURFACES} | set(EXEMPT_TABLES)
    return sorted(set(Base.metadata.tables) - classified)


def _empty_surfaces(db) -> list[dict]:
    """Return every surface whose count is 0."""
    missing = []
    for spec in SEEDED_SURFACES:
        sql = f"SELECT count(*) FROM {spec['table']}"
        if spec["where"]:
            sql += f" WHERE {spec['where']}"
        count = db.execute(text(sql)).scalar()
        if not count:
            missing.append({"surface": spec["surface"], "table": spec["table"]})
    return missing


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    unclassified = _classification_drift()

    db = SessionLocal()
    try:
        missing = _empty_surfaces(db)
    finally:
        db.close()

    # Counts are DERIVED, never stated — a literal goes stale the moment a
    # surface is added, and a summary line that misreports its own coverage is
    # worse than no summary at all.
    total = len(SEEDED_SURFACES)
    covered = total - len(missing)

    if args.json:
        print(
            json.dumps(
                {
                    "surfaces_total": total,
                    "surfaces_covered": covered,
                    "missing": missing,
                    "unclassified_tables": unclassified,
                    "ok": not missing and not unclassified,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"## seed coverage (MEH-1706) — {covered}/{total} surfaces covered")
        if missing:
            print("\n### MISSING — seeded surface with zero rows\n")
            for m in missing:
                print(f"  - {m['surface']}  (table: {m['table']})")
        if unclassified:
            print("\n### UNCLASSIFIED — mapped table in neither list\n")
            for t in unclassified:
                print(f"  - {t}")
            print(
                "\nAdd each to SEEDED_SURFACES (with a seed row in "
                "seed_demo_business.py) or to EXEMPT_TABLES with a reason."
            )
        if not missing and not unclassified:
            print(f"All {total} surfaces covered; all mapped tables classified. OK.")

    sys.exit(1 if (missing or unclassified) else 0)


if __name__ == "__main__":
    main()
