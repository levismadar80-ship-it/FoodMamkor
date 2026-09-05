"""
Module:   test_meh2264_special_hours_b
Purpose:  MEH-1889 chunk B (MEH-2264) — the owner WRITE path for
          producers.special_hours, the 30-day retention rule, the LIST/DETAIL
          read contract, and the open-now filter's per-date override.
Touches:  The test DB through the FastAPI client (PUT /producers/me,
          GET /producers, GET /producers/{id}). Clocks are frozen — see below.
Does NOT: re-test the shape validator (tests/test_meh1889_special_hours.py,
          chunk A, owns that) and does not touch opening_hours — the override
          is ORDER-AXIS ONLY (Sapir's ruling א on the card).
Related:  backend/app/routers/producer_me.py (_PRODUCER_WRITABLE_FIELDS),
          backend/app/schemas/schemas.py (_special_hours_validator, ProducerListOut),
          backend/app/services/producer_listing.py (_open_for_orders_now_condition).
History:  MEH-2264 (creation).

Two clocks, two freezes, deliberately separate:
  - the validator's retention boundary reads `schemas.israel_today`
    (a DATE) — frozen with monkeypatch, the test_availability_validation idiom;
  - the listing filter reads `producer_listing.israel_now` (a DATETIME) —
    frozen the way tests/test_meh1881_open_now_filter.py does.
Without either freeze the suite would be green or red depending on the day it
runs, which is the "green with two possible causes" shape testing.md bans.

REUSES: tests/test_order_window.py (owner PUT idiom) ·
        tests/test_meh1881_open_now_filter.py (_freeze + approved fixture).
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from tests.conftest import auth_header, make_producer, make_user

from app.schemas import schemas
from app.services import producer_listing

ISRAEL = ZoneInfo("Asia/Jerusalem")

# 2026-09-06 is a SUNDAY — asserted in the first filter test, not assumed.
SUNDAY = datetime(2026, 9, 6, 10, 0, tzinfo=ISRAEL)
TODAY = date(2026, 9, 5)

WEEKLY_SUNDAY_OPEN = {"sunday": [{"open": "09:00", "close": "13:00"}]}
WEEKLY_MONDAY_ONLY = {"monday": [{"open": "09:00", "close": "13:00"}]}

CLOSED_ON_SUNDAY = {"2026-09-06": {"ranges": [], "note": "יום כיפור"}}
OPEN_ON_SUNDAY = {"2026-09-06": {"ranges": [{"open": "09:00", "close": "13:00"}]}}
SOME_OTHER_DATE = {"2026-09-21": {"ranges": []}}


def _producer_user(db, name="חוות השעות המיוחדות"):
    producer = make_producer(db, name=name)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _freeze_today(monkeypatch, when: date):
    monkeypatch.setattr(schemas, "israel_today", lambda: when)


def _freeze_now(monkeypatch, when: datetime):
    monkeypatch.setattr(producer_listing, "israel_now", lambda: when)


def _approved(db, name, window, special):
    p = make_producer(db, name=name)
    p.status = "approved"
    p.order_window = window
    p.special_hours = special
    db.commit()
    return p


def _names(resp):
    assert resp.status_code == 200, resp.text
    return {p["name"] for p in resp.json()}


# ── Write path — fails on today's staging, where the body is silently ignored ─
def test_owner_put_writes_special_hours_and_detail_read_carries_it(
    client, db, monkeypatch
):
    _freeze_today(monkeypatch, TODAY)
    user, producer = _producer_user(db)
    producer.status = "approved"
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"special_hours": OPEN_ON_SUNDAY},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["special_hours"] == OPEN_ON_SUNDAY

    db.refresh(producer)
    assert producer.special_hours == OPEN_ON_SUNDAY

    # DETAIL contract (ProducerDetailOut inherits it).
    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["special_hours"] == OPEN_ON_SUNDAY


def test_list_row_carries_special_hours(client, db):
    # The LIST contract is where ProducerCard and the open-now chip evaluator
    # read the order axis from (MEH-1880 precedent) — a detail-only field
    # would leave a card saying "open" on Yom Kippur.
    _approved(db, "עם שעות מיוחדות", WEEKLY_SUNDAY_OPEN, OPEN_ON_SUNDAY)
    listing = client.get("/producers")
    assert listing.status_code == 200, listing.text
    row = next(p for p in listing.json() if p["name"] == "עם שעות מיוחדות")
    assert row["special_hours"] == OPEN_ON_SUNDAY


def test_explicit_null_clears_special_hours(client, db, monkeypatch):
    _freeze_today(monkeypatch, TODAY)
    user, producer = _producer_user(db)
    producer.special_hours = OPEN_ON_SUNDAY
    db.commit()

    resp = client.put(
        "/producers/me", json={"special_hours": None}, headers=auth_header(user)
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.special_hours is None


def test_list_row_without_overrides_serialises_null_not_missing(client, db):
    _approved(db, "בלי שעות מיוחדות", WEEKLY_SUNDAY_OPEN, None)
    listing = client.get("/producers")
    assert listing.status_code == 200, listing.text
    row = next(p for p in listing.json() if p["name"] == "בלי שעות מיוחדות")
    assert "special_hours" in row and row["special_hours"] is None


# ── Retention (ruling ג): today-30 inclusive, today-31 rejected ───────────────
def test_retention_boundary_is_inclusive_at_today_minus_30(client, db, monkeypatch):
    _freeze_today(monkeypatch, TODAY)  # 2026-09-05 → oldest allowed 2026-08-06
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"special_hours": {"2026-08-06": {"ranges": []}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_retention_rejects_today_minus_31_with_the_approved_copy(
    client, db, monkeypatch
):
    _freeze_today(monkeypatch, TODAY)
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"special_hours": {"2026-08-05": {"ranges": []}}},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "התאריך 2026-08-05 כבר עבר" in resp.text
    assert "30 הימים האחרונים" in resp.text
    db.refresh(producer)
    assert producer.special_hours is None, "a rejected body must write nothing"


def test_malformed_key_still_gets_the_format_message_not_retention(monkeypatch):
    # Ordering: shape first, policy second. A bad key must never be reported
    # as "too old" — that would send the owner fixing the wrong thing.
    _freeze_today(monkeypatch, TODAY)
    try:
        schemas._special_hours_validator({"2026-13-01": {"ranges": []}})
    except ValueError as exc:
        assert "הפורמט חייב להיות YYYY-MM-DD" in str(exc)
        assert "כבר עבר" not in str(exc)
    else:  # pragma: no cover
        raise AssertionError("a non-existent date must be rejected")


def test_retention_reads_the_israel_clock_not_the_server_clock(monkeypatch):
    # Frozen to a different day: what was rejected above is accepted here, so
    # the rule is a function of the injected clock and not of the wall clock.
    _freeze_today(monkeypatch, date(2026, 8, 20))
    assert schemas._special_hours_validator({"2026-08-05": {"ranges": []}}) == {
        "2026-08-05": {"ranges": []}
    }


# ── Open-now filter: today's override wins over the weekly day ───────────────
def test_fixture_date_is_a_sunday():
    assert SUNDAY.strftime("%A") == "Sunday"


def test_closed_override_hides_a_weekly_open_producer(client, db, monkeypatch):
    _freeze_now(monkeypatch, SUNDAY)
    _approved(db, "פתוח שבועי אבל סגור היום", WEEKLY_SUNDAY_OPEN, CLOSED_ON_SUNDAY)
    _approved(db, "פתוח שבועי בלי דריסה", WEEKLY_SUNDAY_OPEN, None)

    assert _names(client.get("/producers?open_for_orders_now=true")) == {
        "פתוח שבועי בלי דריסה"
    }
    assert "פתוח שבועי אבל סגור היום" in _names(
        client.get("/producers?open_for_orders_now=false")
    )


def test_open_override_shows_a_weekly_closed_producer(client, db, monkeypatch):
    _freeze_now(monkeypatch, SUNDAY)
    _approved(db, "סגור שבועי אבל פתוח היום", WEEKLY_MONDAY_ONLY, OPEN_ON_SUNDAY)
    _approved(db, "סגור שבועי בלי דריסה", WEEKLY_MONDAY_ONLY, None)

    assert _names(client.get("/producers?open_for_orders_now=true")) == {
        "סגור שבועי אבל פתוח היום"
    }


def test_override_for_another_date_leaves_the_weekly_answer_unchanged(
    client, db, monkeypatch
):
    _freeze_now(monkeypatch, SUNDAY)
    _approved(db, "דריסה לתאריך אחר", WEEKLY_SUNDAY_OPEN, SOME_OTHER_DATE)

    assert _names(client.get("/producers?open_for_orders_now=true")) == {
        "דריסה לתאריך אחר"
    }
    assert _names(client.get("/producers?open_for_orders_now=false")) == set()


def test_override_alone_is_a_declaration_even_without_a_weekly_window(
    client, db, monkeypatch
):
    # NULL order_window = "declared nothing": never on the open side, and on
    # the closed side because that branch is the exact complement
    # (test_meh1881 `null_window_appears_under_the_false_branch`). A closed
    # override for today keeps a producer with no weekly window on that same
    # side — and an OPEN override for today puts her on the open side even
    # though she never declared a weekly window at all.
    _freeze_now(monkeypatch, SUNDAY)
    _approved(db, "רק דריסה סגורה", None, CLOSED_ON_SUNDAY)
    _approved(db, "רק דריסה פתוחה", None, OPEN_ON_SUNDAY)
    _approved(db, "לא הצהיר דבר", None, None)

    assert _names(client.get("/producers?open_for_orders_now=true")) == {
        "רק דריסה פתוחה"
    }
    assert _names(client.get("/producers?open_for_orders_now=false")) == {
        "רק דריסה סגורה",
        "לא הצהיר דבר",
    }
