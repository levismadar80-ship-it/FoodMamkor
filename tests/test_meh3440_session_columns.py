"""MEH-3440 (stage 1 of MEH-3264): the columns a recurring workshop's dates
live in. Nothing reads them yet; this pins that they hold what stage 2 writes
and that a row with no dates stays NULL — the "one pool of places" case every
existing workshop is in."""

from datetime import date, time

from sqlalchemy import inspect

from app.models import Registration

from tests.conftest import make_user
from tests.test_meh3227_delist_cascade import _experience, _signup


def test_a_workshop_keeps_its_dates_and_a_sign_up_its_date(db):
    host = make_user(db, role="producer", email="host@example.com")
    ex = _experience(db, host, is_recurring=True)
    ex.sessions = [
        {"date": "2026-12-04", "time": "10:00", "participants_count": 2},
        {"date": "2026-12-11", "time": "10:00", "participants_count": 0},
    ]
    reg = _signup(db, ex, "guest@example.com")
    reg.session_date = date(2026, 12, 4)
    reg.session_time = time(10, 0)
    db.commit()
    db.expire_all()
    assert db.get(type(ex), ex.id).sessions[0] == {
        "date": "2026-12-04",
        "time": "10:00",
        "participants_count": 2,
    }
    # Read the columns, not the object: an unmapped attribute set on ``reg``
    # would survive expire_all() and pass with no column behind it.
    row = (
        db.query(Registration.session_date, Registration.session_time)
        .filter(Registration.id == reg.id)
        .one()
    )
    assert tuple(row) == (date(2026, 12, 4), time(10, 0))


def test_rows_with_no_dates_stay_null(db):
    host = make_user(db, role="producer", email="host@example.com")
    ex = _experience(db, host)
    reg = _signup(db, ex, "guest@example.com")
    db.expire_all()
    assert db.get(type(ex), ex.id).sessions is None
    got = db.get(Registration, reg.id)
    assert (got.session_date, got.session_time) == (None, None)


def test_per_date_counts_have_an_index(db):
    names = {
        ix["name"]: ix["column_names"]
        for ix in inspect(db.bind).get_indexes("registrations")
    }
    assert names["ix_registrations_experience_session"] == [
        "experience_id",
        "session_date",
        "session_time",
    ]


def test_a_date_needs_a_workshop_and_a_time_needs_a_date(db):
    import pytest
    from sqlalchemy.exc import IntegrityError

    from tests.test_meh3227_delist_cascade import _business, _event

    producer, _owner = _business(db)
    on_event = _signup(db, _event(db, producer), "event@example.com")
    on_event.session_date = date(2026, 12, 4)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    host = make_user(db, role="producer", email="host@example.com")
    reg = _signup(db, _experience(db, host), "guest@example.com")
    reg.session_time = time(10, 0)
    with pytest.raises(IntegrityError):
        db.commit()
