"""MEH-2889 — fire_alerts / notify_cities give the connection back when done.

Both run as BackgroundTasks with the REQUEST's session. They open a
transaction with their first query and, when there is nothing to send, used
to return with it still open — the connection stayed checked out through every
later task of the same request (Resend sends included). Same measurement as
tests/test_meh2886_db_release.py: `engine.pool.checkedout()` on the real
app engine.

Discrimination: on the code before MEH-2889 both "after" readings are 1 (the
query's transaction is still open on the session); after the fix they are 0.
The control proves the instrument reads 1 for a session left mid-transaction,
so a 0 is not just a dead probe.
"""

from uuid import uuid4

from sqlalchemy import text

from app.database import SessionLocal, engine
from app.routers.alerts import AlertContent, fire_alerts
from app.services.delivery_waitlist import notify_cities


def _checkedout() -> int:
    return engine.pool.checkedout()


def _idle_first() -> None:
    assert _checkedout() == 0, (
        f"pool reads {_checkedout()} before the call — the reading would not be "
        "attributable to the function under test"
    )


def test_control_a_session_left_mid_transaction_holds_one_connection():
    _idle_first()
    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
        assert _checkedout() == 1, "the instrument cannot see an open transaction"
    finally:
        session.close()
    assert _checkedout() == 0


def test_fire_alerts_with_nothing_to_send_releases_the_connection():
    _idle_first()
    session = SessionLocal()
    try:
        fire_alerts(
            session,
            uuid4(),  # no such business: the query runs, nothing matches
            "new_product",
            AlertContent(title="כותרת", body="גוף", url="/producer/x"),
        )
        assert _checkedout() == 0, (
            "fire_alerts returned with its query's transaction still open"
        )
    finally:
        session.close()


def test_fire_alerts_keeps_the_session_usable_afterwards():
    """It ends the transaction; it does not close the session, so a later
    task (or a caller) can keep using it."""
    session = SessionLocal()
    try:
        fire_alerts(
            session,
            uuid4(),
            "new_event",
            AlertContent(title="כותרת", body="גוף", url="/producer/x"),
        )
        assert session.execute(text("SELECT 1")).scalar() == 1
    finally:
        session.close()
    assert _checkedout() == 0


def test_notify_cities_with_no_live_business_releases_the_connection():
    _idle_first()
    session = SessionLocal()
    try:
        notify_cities(session, uuid4(), ["חיפה"])
        assert _checkedout() == 0, (
            "notify_cities returned with its query's transaction still open"
        )
    finally:
        session.close()
