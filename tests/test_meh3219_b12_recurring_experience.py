"""MEH-3219 B12 — a recurring experience stays listed and open after its first date.

For a recurring experience `event_date` is the FIRST occasion
(ExperienceDetailClient.jsx: «A recurring experience's date is its first
occasion»), and the host cap already counts it as live forever
(experiences.py `enforce_cap`: `event_date >= today | is_recurring`). But the
public feed and the sign-up guard compared `event_date` alone, so «כל שישי»
vanished from /experiences and answered 409 to every sign-up from the day
after its first Friday.

Each test pairs a past recurring experience with a past one-off one, so a fix
that dropped the date filter altogether goes red on the one-off half.
"""

from datetime import timedelta

from app.utils.clock import israel_today
from test_meh2763_registrations import _experience, _owner, _signup, sent  # noqa: F401


def _pair(db):
    host = _owner(db)
    yesterday = israel_today() - timedelta(days=1)
    weekly = _experience(
        db, host, title="סדנת לחם כל שישי", event_date=yesterday, is_recurring=True
    )
    once = _experience(db, host, title="סדנת ריבות חד פעמית", event_date=yesterday)
    return weekly, once


def test_feed_keeps_recurring_experience_after_first_date(client, db):
    weekly, once = _pair(db)
    ids = {e["id"] for e in client.get("/experiences").json()}
    assert str(weekly.id) in ids
    assert str(once.id) not in ids


def test_signup_open_for_recurring_experience_after_first_date(client, db, sent):  # noqa: F811
    weekly, once = _pair(db)
    r = client.post(f"/experiences/{weekly.id}/registrations", json=_signup())
    assert r.status_code == 201, r.text
    r = client.post(f"/experiences/{once.id}/registrations", json=_signup())
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "registration_closed"


def test_cancelled_recurring_experience_still_closed(client, db, sent):  # noqa: F811
    weekly, _ = _pair(db)
    weekly.is_active = False
    db.commit()
    ids = {e["id"] for e in client.get("/experiences").json()}
    assert str(weekly.id) not in ids
    r = client.post(f"/experiences/{weekly.id}/registrations", json=_signup())
    assert r.status_code == 409


def test_purge_keeps_fresh_signup_of_old_recurring_experience(client, db, sent):  # noqa: F811
    """The 30-day purge keyed on event_date; for a recurring experience that
    is the first occasion, so a fresh sign-up would be deleted on the next
    run. A recurring row's sign-ups now age out by their own created_at."""
    from datetime import datetime

    from app.models.models import Registration
    from app.services.retention_purge import run_purge

    host = _owner(db)
    weekly = _experience(
        db,
        host,
        title="סדנת לחם כל שישי",
        event_date=israel_today() - timedelta(days=60),
        is_recurring=True,
    )
    once = _experience(
        db, host, title="סדנה ישנה", event_date=israel_today() - timedelta(days=1)
    )
    assert (
        client.post(
            f"/experiences/{weekly.id}/registrations", json=_signup()
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/experiences/{weekly.id}/registrations",
            json=_signup(email="old@example.com", phone="052-7654322"),
        ).status_code
        == 201
    )
    old = db.query(Registration).filter_by(email="old@example.com").one()
    old.created_at = datetime(2000, 1, 1)
    db.add(
        Registration(
            experience_id=once.id,
            name="נועה",
            phone="0527654323",
            email="once@example.com",
            cancel_token="tok-once",
        )
    )
    db.commit()
    once.event_date = israel_today() - timedelta(days=60)
    db.commit()

    run_purge(db)

    left = {r.email for r in db.query(Registration).all()}
    assert left == {"dana@example.com"}
