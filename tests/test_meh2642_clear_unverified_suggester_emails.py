"""
Module:   test_meh2642_clear_unverified_suggester_emails
Purpose:  The MEH-2642 data revision clears every community suggester
          address that lacks a proved owner (a verified account) or a
          purpose (the update tick). Everything else is left alone.
Touches:  The test DB (outreach_leads, users). Runs the revision's own
          CLEANUP_SQL, loaded from the file, against seeded rows.
History:  MEH-2642 (creation, 14/11).
"""

import importlib.util
from pathlib import Path

from tests.conftest import make_user

from app.models.models import OutreachLead

REVISION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261114_1530_e4b8d2f6a913_meh2642_clear_unverified_suggester_emails.py"
)


def _cleanup_sql():
    spec = importlib.util.spec_from_file_location("meh2642_rev", REVISION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.CLEANUP_SQL


def _lead(db, name, email, *, source="community", wants=True):
    lead = OutreachLead(
        name=name,
        city="חיפה",
        source=source,
        suggested_by_name="ממליצה",
        suggested_by_email=email,
        suggester_wants_update=wants,
    )
    db.add(lead)
    db.commit()
    return lead


def test_clears_only_unproved_community_addresses(db):
    make_user(db, email="verified@example.com", email_verified=True)
    make_user(db, email="unverified@example.com", email_verified=False)
    typed = _lead(db, "הוקלד", "stranger@example.com")
    unverified = _lead(db, "לא מאומת", "unverified@example.com")
    verified = _lead(db, "מאומת", " Verified@Example.com ")
    manual = _lead(db, "ידני", "owner-typed@example.com", source="manual")
    empty = _lead(db, "בלי כתובת", None, wants=False)
    no_tick = _lead(db, "בלי בקשה", "verified@example.com", wants=False)

    result = db.execute(_cleanup_sql())
    db.commit()
    assert result.rowcount == 3

    for lead in (typed, unverified, verified, manual, empty, no_tick):
        db.refresh(lead)
    assert (typed.suggested_by_email, typed.suggester_wants_update) == (None, False)
    assert (unverified.suggested_by_email, unverified.suggester_wants_update) == (
        None,
        False,
    )
    # The name is kept: it is the credit the admin sees, not a contact address.
    assert typed.suggested_by_name == "ממליצה"
    assert verified.suggested_by_email == " Verified@Example.com "
    assert verified.suggester_wants_update is True
    assert manual.suggested_by_email == "owner-typed@example.com"
    assert empty.suggested_by_email is None
    # A verified address with no update asked for has no purpose: cleared.
    assert (no_tick.suggested_by_email, no_tick.suggester_wants_update) == (
        None,
        False,
    )


def test_running_twice_changes_nothing_more(db):
    _lead(db, "הוקלד", "stranger@example.com")
    sql = _cleanup_sql()
    assert db.execute(sql).rowcount == 1
    db.commit()
    assert db.execute(sql).rowcount == 0
