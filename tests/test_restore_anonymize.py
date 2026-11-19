"""
Module:   test_restore_anonymize
Purpose:  Guard scripts/anonymize_restored_db.sql (MEH-3406): it covers every
          PII-shaped column in the models, every value it writes fits its
          column, and after it runs no real email, phone or push endpoint is
          left. Also the restore script's wiring: anonymize by default,
          `--keep-pii` only when typed, fail closed.
Touches:  The test database only (the SQL runs inside the test's transaction).
Related:  scripts/restore_from_backup.py:run_anonymize / verify_anonymized
History:  MEH-3406 (creation).
"""

from __future__ import annotations

import importlib.util
import re
import uuid
from pathlib import Path

import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy import JSON, LargeBinary, String, Text, text

from app.database import Base, engine
from app.models import ContactMessage, FavoriteAlert, NewsletterSubscriber, PhoneOtpToken
from tests.conftest import make_producer, make_user

REPO = Path(__file__).resolve().parent.parent
SQL_PATH = REPO / "scripts" / "anonymize_restored_db.sql"
SQL = SQL_PATH.read_text(encoding="utf-8")

FAKE_PHONE_PREFIX = "+97250000"

# A column whose NAME looks like it can hold a person's details.
PII_NAME = re.compile(
    r"(email|phone|whatsapp|address|street|zip|(^|_)ip($|_)|ip_hash|"
    r"(^|_)name($|_)|token|(^|_)code($|_)|code_hash|password|google_id|apple_id|"
    r"avatar|message|(^|_)body$|note|comment|push|business_id|endpoint|"
    r"instagram|facebook|payment_info)"
)

# Matched the pattern, deliberately left as is. Every entry says why.
EXEMPT: dict[str, str] = {
    # Public directory content: shown on public pages on purpose.
    "producers.name": "business name, public",
    "producers.instagram": "business profile, public",
    "producers.facebook": "business profile, public",
    "producers.top_product_name": "public product name",
    "producers.owner_photo_url": "photo the business published",
    "producers.rejection_reason_code": "admin enum, no personal data",
    "producers.primary_contact_method": "enum (whatsapp/phone/…), no value",
    "producers.recommended_note": "editorial note, public",
    "producers.whatsapp_clicks": "a counter",
    "producer_locations.label": "public pickup point label",
    "producer_locations.address": "public pickup point the business published",
    "products.name": "public product name",
    "product_order_items.name": "product name snapshot",
    "categories.name": "category",
    "cities.name_he": "city",
    "events.address": "public event venue",
    "experiences.address": "public experience venue",
    "group_buys.product_name": "public listing",
    "group_buys.fulfillment_note": "public listing text",
    "group_buys.pickup_note": "public listing text",
    "group_buys.delivery_note": "public listing text",
    "home_products.location_notes": "public listing text",
    "producer_reviews.body": "published review text",
    "home_product_ratings.comment": "published rating text",
    "rescue_reviews.comment": "published review text",
    "static_pages.body": "site content",
    "outreach_leads.name": "a business's public name",
    "category_requests.requested_name": "a category name",
    "category_requests.admin_notes": "admin note about a category",
    "producer_name_change_requests.current_name": "business name",
    "producer_name_change_requests.requested_name": "business name",
    "producer_name_change_requests.admin_notes": "admin note about a business name",
    "kashrut_badge_requests.badge_code": "kashrut body code",
    "kashrut_badge_requests.notes": "about a certificate",
    "admin_passkeys.name": "table is deleted",
    "admin_checklist_items.label": "admin UI text",
    "producer_recipes.moderation_notes": "moderation note about a recipe",
    "inbound_messages.meta_message_id": "table is deleted",
    "outbound_messages.meta_message_id": "table is deleted",
    "outbound_messages.error_message": "table is deleted",
    "rescue_orders.pickup_code": "4-digit code for a finished pickup, not personal",
    "product_orders.pickup_code": "pickup code for a past order, not personal",
    "product_orders.proposal_note": "the business's own text",
    "product_orders.idempotency_key": "random key, no personal data",
    "outreach_leads.instagram": "a business's public profile",
}


def _parse_sql(sql: str) -> tuple[dict[str, dict[str, str]], set[str]]:
    """{table: {column: expr}} for UPDATEs, and the set of DELETEd tables."""
    updates: dict[str, dict[str, str]] = {}
    deletes: set[str] = set()
    current: str | None = None
    for line in sql.splitlines():
        if m := re.match(r"^UPDATE (\w+) SET\s*$", line):
            current = m.group(1)
            updates.setdefault(current, {})
        elif m := re.match(r"^DELETE FROM (\w+);", line):
            deletes.add(m.group(1))
            current = None
        elif current and (m := re.match(r"^    (\w+) = (.+?)[,;]?$", line)):
            updates[current][m.group(1)] = m.group(2)
        elif line.startswith("WHERE") or line.strip() == "":
            continue
    return updates, deletes


UPDATES, DELETES = _parse_sql(SQL)


def test_parser_reads_the_real_file():
    """Self-test against the real file: if the format contract broke, the
    inventory test below would pass on an empty parse."""
    assert UPDATES["users"]["email"].startswith("'user-'")
    assert "password_hash" in UPDATES["users"]
    assert "outbound_messages" in DELETES
    assert sum(len(c) for c in UPDATES.values()) >= 40


def _holds_text(col) -> bool:
    """Timestamps, flags and counters named like PII (email_verified,
    whatsapp_clicks) hold nothing personal; only text-like columns can."""
    return isinstance(col.type, (String, Text, JSON, LargeBinary)) or "INET" in str(col.type)


def _pii_columns():
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if PII_NAME.search(col.name) and _holds_text(col):
                yield table, col


def test_every_pii_column_is_covered_or_exempt():
    missing = [
        f"{t.name}.{c.name}"
        for t, c in _pii_columns()
        if t.name not in DELETES
        and c.name not in UPDATES.get(t.name, {})
        and f"{t.name}.{c.name}" not in EXEMPT
    ]
    assert not missing, (
        "PII-shaped columns that scripts/anonymize_restored_db.sql neither "
        f"rewrites nor deletes, and EXEMPT does not explain: {missing}"
    )


def test_inventory_guard_catches_a_new_column():
    """Shown failing: a new users.backup_email would be reported."""
    from sqlalchemy import Column

    users = Base.metadata.tables["users"]
    col = Column("backup_email", String(200))
    users.append_column(col)
    try:
        with pytest.raises(AssertionError, match="users.backup_email"):
            test_every_pii_column_is_covered_or_exempt()
    finally:
        users._columns.remove(col)


def test_sql_names_only_real_tables_and_columns():
    tables = Base.metadata.tables
    for t, cols in UPDATES.items():
        assert t in tables, t
        for c in cols:
            assert c in tables[t].c, f"{t}.{c}"
    for t in DELETES:
        assert t in tables, t


def test_null_only_on_nullable_and_values_fit_the_column(db):
    sample = str(uuid.uuid4())
    for t, cols in UPDATES.items():
        table = Base.metadata.tables[t]
        for c, expr in cols.items():
            col = table.c[c]
            if expr == "NULL":
                assert col.nullable, f"{t}.{c} is NOT NULL"
                continue
            # Evaluate the real expression against a stand-in row.
            refs = set(re.findall(r"\b(\w+) IS NULL", expr)) | {"id"}
            select_cols = ", ".join(
                f"'{sample}'::uuid AS id" if r == "id" else f"'x' AS {r}" for r in refs
            )
            value = db.execute(text(f"SELECT {expr} FROM (SELECT {select_cols}) AS r")).scalar()
            length = getattr(col.type, "length", None)
            if isinstance(col.type, (String, Text)) and length:
                assert len(value) <= length, f"{t}.{c}: {len(value)} > {length}"


def _run_sql():
    # Raw DB-API cursor, no parameters: the file is run as psql runs it, so
    # its `%` in ILIKE patterns is not read as a placeholder.
    raw = engine.raw_connection()
    try:
        with raw.cursor() as cur:
            cur.execute(SQL)
        raw.commit()
    finally:
        raw.close()


def test_after_running_no_real_email_phone_or_push_survives(db):
    real = make_user(db, email="real.person@gmail.com", name="רותי כהן")
    real.phone = "0521234567"
    demo = make_user(db, email="demo-owner@example.com", name="Demo Owner")
    demo_hash = demo.password_hash
    prod = make_producer(db)
    prod.contact_email = "biz@gmail.com"
    prod.phone = "0549876543"
    db.add_all([
        ContactMessage(name="דנה", email="dana@walla.co.il", message="טלפון שלי 0501112222"),
        NewsletterSubscriber(email="sub@gmail.com"),
        FavoriteAlert(user_id=real.id, producer_id=prod.id,
                      push_subscription={"endpoint": "https://fcm.googleapis.com/x"}),
        PhoneOtpToken(producer_id=prod.id, phone="0549876543", code="123456",
                      expires_at=datetime.now(timezone.utc) + timedelta(minutes=5)),
    ])
    db.commit()

    _run_sql()
    db.expire_all()

    with engine.connect() as conn:
        for table in Base.metadata.tables.values():
            for col in table.columns:
                if not isinstance(col.type, (String, Text)):
                    continue
                if "email" in col.name:
                    bad = conn.execute(text(
                        f"SELECT count(*) FROM {table.name} WHERE {col.name} IS NOT NULL "
                        f"AND {col.name} NOT ILIKE '%@example.com'"
                    )).scalar()
                    assert bad == 0, f"{table.name}.{col.name}"
                if "phone" in col.name and "label" not in col.name:
                    bad = conn.execute(text(
                        f"SELECT count(*) FROM {table.name} WHERE {col.name} IS NOT NULL "
                        f"AND {col.name} NOT LIKE '{FAKE_PHONE_PREFIX}%'"
                    )).scalar()
                    assert bad == 0, f"{table.name}.{col.name}"
        assert conn.execute(text(
            "SELECT count(*) FROM favorite_alerts WHERE push_subscription IS NOT NULL"
        )).scalar() == 0
        assert conn.execute(text("SELECT count(*) FROM phone_otp_tokens")).scalar() == 0
        msg = conn.execute(text("SELECT message FROM contact_messages")).scalar()
        assert "0501112222" not in msg

    db.refresh(real)
    db.refresh(demo)
    assert real.email == f"user-{real.id}@example.com"
    assert "רותי" not in real.name
    assert real.password_hash is None
    # The seeded demo account keeps working after a restore.
    assert demo.email == "demo-owner@example.com"
    assert demo.password_hash == demo_hash

    _run_sql()  # idempotent: a second run is harmless
    db.refresh(real)
    assert real.email == f"user-{real.id}@example.com"


# ── restore_from_backup.py wiring ──────────────────────────────────────────

def _load_restore_module():
    spec = importlib.util.spec_from_file_location(
        "restore_from_backup", REPO / "scripts" / "restore_from_backup.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def restore(monkeypatch, tmp_path):
    mod = _load_restore_module()
    calls: list[str] = []
    monkeypatch.setattr(mod, "load_config", lambda: {})
    monkeypatch.setattr(mod, "download_from_r2", lambda *a: True)
    monkeypatch.setattr(mod, "verify_dump_integrity", lambda *a: True)
    monkeypatch.setattr(mod, "run_pg_restore", lambda *a: calls.append("restore") or True)
    monkeypatch.setattr(mod, "print_row_counts", lambda *a: None)
    monkeypatch.setattr(mod, "run_anonymize", lambda *a: calls.append("anonymize") or True)
    monkeypatch.setattr(mod, "verify_anonymized", lambda *a: calls.append("verify") or True)
    mod.calls = calls
    return mod


def test_restore_anonymizes_by_default(restore):
    assert restore.main(["x.dump", "postgresql://localhost/dr"]) == restore.EXIT_OK
    assert restore.calls == ["restore", "anonymize", "verify"]


def test_keep_pii_only_when_typed(restore):
    assert restore.main(["x.dump", "postgresql://localhost/dr", "--keep-pii"]) == restore.EXIT_OK
    assert restore.calls == ["restore"]


def test_survivors_fail_the_restore(restore, monkeypatch):
    monkeypatch.setattr(restore, "verify_anonymized", lambda *a: False)
    assert restore.main(["x.dump", "postgresql://localhost/dr"]) == restore.EXIT_ANONYMIZE_FAILED


def test_production_target_still_refused(restore):
    assert restore.main(["x.dump", "postgresql://host/mehamakor_production"]) == restore.EXIT_CONFIG_ERROR
    assert restore.calls == []


def test_verify_fails_closed_when_psql_is_missing(monkeypatch):
    mod = _load_restore_module()

    def boom(*a, **k):
        raise FileNotFoundError("psql")

    monkeypatch.setattr(mod.subprocess, "run", boom)
    assert mod.verify_anonymized("postgresql://localhost/dr") is False
