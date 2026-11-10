"""MEH-2886 — the request's DB connection must be back in the pool before
the request's BackgroundTasks run.

Why this matters (docs/audits/2026-11-quota-inventory.md §2.2 item 3,
docs/audits/2026-11-db-release-phase0.md): ``get_db`` is a default-scope
(``"request"``) yield dependency. In FastAPI 0.162 its ``finally: db.close()``
runs only after ``await response(...)`` (``fastapi/routing.py:148-155``), and
Starlette runs BackgroundTasks inside ``Response.__call__``. So if the session
still holds a connection when the endpoint returns, that connection stays
checked out for as long as the email / WhatsApp / IndexNow task takes —
up to Resend's 30 s default timeout. 15 slow sends = the whole 10+5 pool.

How the measurement works, and why it is real here:

- ``tests/conftest.py`` does NOT override ``get_db``: ``client`` is
  ``TestClient(app)`` on the real app, and the app's ``engine`` is the real
  ``_ObservableQueuePool`` on Postgres (``TEST_DATABASE_URL``). So
  ``engine.pool.checkedout()`` counts exactly the connections the app holds.
- The probe is the background task itself: it replaces the email sender
  and records ``engine.pool.checkedout()`` at the moment the task runs.
- The test's own ``db`` fixture session can also hold a connection (any
  attribute read after ``make_user``'s refresh opens a transaction). Every
  test therefore closes its seed session and asserts the pool reads 0
  *before* the request, so the in-task reading is attributable to the
  request alone.
- ``TestClient`` is serial and lifespan is not entered (no ``with``), so
  APScheduler is not running and nothing else checks out connections.

Controls (both must stay green before AND after the fix). The control app
depends on ``_frozen_get_db`` — a verbatim copy of today's ``get_db`` — not
on the real one, so the fix cannot move the controls (MEH-2886 review: with
the real ``get_db`` the nonzero control would read 0 once the fix lands and
blame the instrument):

- ``test_control_probe_reads_zero_when_request_never_touched_db`` — a route
  on a throwaway FastAPI app that depends on the REAL ``get_db`` but never
  queries, then adds a background task. The probe must read 0: proves the
  instrument can read 0 at all, and that merely opening a ``SessionLocal``
  does not check out a connection.
- ``test_control_probe_reads_nonzero_when_task_runs_inside_open_txn`` — the
  same throwaway app, a route that runs ``SELECT 1`` and adds a task. The
  probe must read 1: proves the instrument is not stuck at 0, independent of
  any production route.

The three real-route tests are RED on the code at the time of writing
(MEH-2886 chunk 1) and each covers a different shape the fix must handle:

1. ``/auth/register`` new email — ``commit()`` then ``refresh(user)``
   (``routers/auth.py:326-331``).
2. ``/auth/register`` existing email — a read query, no commit at all
   (``routers/auth.py:297`` → ``:355``).
3. ``/auth/forgot-password`` — ``commit()`` then attribute reads on the
   expired instance (``expire_on_commit=True``) re-open a transaction
   (``routers/auth.py:1406-1412``).
"""

import pytest
from fastapi import BackgroundTasks, Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models import User
from conftest import auth_header, make_producer, make_user, valid_user_register_payload


class _HeldConnection(AssertionError):
    """Raised ONLY by the final 'pool reads 0 while the task runs' check, so
    the strict xfail below can name it: any other failure (a 422, a renamed
    sender, a task that never ran) fails the test outright instead of being
    swallowed as the expected red (MEH-2886 review)."""


def _assert_released(readings: list[int], what: str) -> None:
    if readings != [0]:
        raise _HeldConnection(
            f"{readings[0]} connection(s) still checked out while the {what} "
            "background task ran"
        )


def _frozen_get_db():
    """Verbatim copy of ``app.database.get_db`` as of MEH-2886 chunk 1.
    Controls only — it must not change when the real one does."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _checkedout() -> int:
    return engine.pool.checkedout()


class _PoolProbe:
    """A background-task stand-in that records the pool's checked-out count
    each time it runs. Accepts any signature so it can replace any sender."""

    def __init__(self):
        self.readings: list[int] = []

    def __call__(self, *args, **kwargs):
        self.readings.append(_checkedout())


def _assert_pool_idle_before_request():
    # Guard on the measurement itself: if the test's own session (or a
    # previous test) still holds a connection, the in-task reading would be
    # inflated by something that is not the request.
    assert _checkedout() == 0, (
        f"pool reads {_checkedout()} BEFORE the request — the measurement "
        "would not be attributable to the request; close the seed session"
    )


# ---------------------------------------------------------------- controls


def _control_app() -> FastAPI:
    """Throwaway app wired to the REAL get_db and the REAL engine."""
    control = FastAPI()

    @control.post("/no-db")
    def no_db(background_tasks: BackgroundTasks, db: Session = Depends(_frozen_get_db)):
        background_tasks.add_task(control.state.probe)
        return {"ok": True}

    @control.post("/select-one")
    def select_one(
        background_tasks: BackgroundTasks, db: Session = Depends(_frozen_get_db)
    ):
        db.execute(text("SELECT 1"))
        background_tasks.add_task(control.state.probe)
        return {"ok": True}

    return control


def test_control_probe_reads_zero_when_request_never_touched_db():
    control = _control_app()
    control.state.probe = probe = _PoolProbe()
    _assert_pool_idle_before_request()

    resp = TestClient(control).post("/no-db")

    assert resp.status_code == 200
    assert probe.readings == [0], (
        f"probe read {probe.readings} on a route that never queried — the "
        "instrument cannot read 0, so every reading in this file is void"
    )
    assert _checkedout() == 0


def test_control_probe_reads_nonzero_when_task_runs_inside_open_txn():
    control = _control_app()
    control.state.probe = probe = _PoolProbe()
    _assert_pool_idle_before_request()

    resp = TestClient(control).post("/select-one")

    assert resp.status_code == 200
    assert probe.readings == [1], (
        f"probe read {probe.readings} on a route that left a transaction "
        "open — the instrument cannot see a held connection"
    )
    # get_db's finally still runs after the task: nothing leaks past it.
    assert _checkedout() == 0


# ------------------------------------------------- real routes (RED today)

# Strict xfail: chunk 1 lands the measurement without turning CI red. The fix
# (chunk 2) makes these pass, and a strict xfail that passes FAILS the suite —
# so chunk 2 cannot land without deleting this marker.
_RED_UNTIL_FIX = pytest.mark.xfail(
    raises=_HeldConnection,
    strict=True,
    reason="MEH-2886: get_db closes only after BackgroundTasks run (chunk 2 fixes)",
)


@_RED_UNTIL_FIX
def test_register_new_email_releases_connection_before_background_tasks(
    client, monkeypatch
):
    """Shape 1: commit() → refresh(user) → add_task (auth.py:326-331)."""
    verify_probe = _PoolProbe()
    welcome_probe = _PoolProbe()
    monkeypatch.setattr("app.routers.auth._send_verify_email", verify_probe)
    monkeypatch.setattr("app.routers.auth._send_welcome_email", welcome_probe)
    _assert_pool_idle_before_request()

    resp = client.post(
        "/auth/register",
        json={**valid_user_register_payload(), "email": "meh2886-new@test.com"},
    )

    assert resp.status_code == 200
    assert len(verify_probe.readings) == 1, "verify-email task did not run"
    assert len(welcome_probe.readings) == 1, "welcome-email task did not run"
    _assert_released(verify_probe.readings, "verify-email")
    _assert_released(welcome_probe.readings, "welcome-email")


@_RED_UNTIL_FIX
def test_register_existing_email_releases_connection_before_background_tasks(
    client, db, monkeypatch
):
    """Shape 2: read query, no commit → add_task (auth.py:297 → :355)."""
    make_user(db, email="meh2886-dup@test.com")
    db.close()  # the seed session's post-refresh transaction holds a conn
    probe = _PoolProbe()
    monkeypatch.setattr("app.routers.auth._send_duplicate_attempt_email", probe)
    _assert_pool_idle_before_request()

    resp = client.post(
        "/auth/register",
        json={**valid_user_register_payload(), "email": "meh2886-dup@test.com"},
    )

    assert resp.status_code == 200
    assert len(probe.readings) == 1, "duplicate-attempt task did not run"
    _assert_released(probe.readings, "duplicate-attempt")


@_RED_UNTIL_FIX
def test_forgot_password_releases_connection_before_background_tasks(
    client, db, monkeypatch
):
    """Shape 3: commit() → reads on the expired instance → add_task
    (auth.py:1405-1412, expire_on_commit=True)."""
    make_user(db, email="meh2886-reset@test.com")
    db.close()
    probe = _PoolProbe()
    monkeypatch.setattr("app.routers.auth._send_reset_email", probe)
    _assert_pool_idle_before_request()

    resp = client.post(
        "/auth/forgot-password", json={"email": "meh2886-reset@test.com"}
    )

    assert resp.status_code == 200
    assert len(probe.readings) == 1, "reset-email task did not run"
    _assert_released(probe.readings, "reset-email")


@_RED_UNTIL_FIX
def test_authenticated_route_releases_connection_before_background_tasks(
    client, db, monkeypatch
):
    """Shape 4: an AUTHENTICATED route (``require_producer`` →
    ``get_current_user``, which opens its own ``Depends(get_db)``), whose task
    is handed the request's ``db`` (producer_me.py:2033-2065 → fire_alerts).

    Why it is here (MEH-2886 review): the three tests above are all
    unauthenticated, so a fix applied to the ROUTE's dependency alone — e.g.
    ``Depends(get_db, scope="function")`` on two routes — turns them green
    while the auth dependency's session still holds a connection (doc §1 F5,
    §4 (a)). This route reads 1 under such a partial fix.
    """
    producer = make_producer(db)
    user = User(
        email="meh2886-producer@test.com",
        name="Producer User",
        password_hash="hash",
        role="producer",
        is_producer=True,
        producer_id=producer.id,
    )
    db.add(user)
    db.commit()
    headers = auth_header(user)
    db.close()
    probe = _PoolProbe()
    # Imported inside the route (``from app.routers.alerts import fire_alerts``),
    # so patching the module attribute is what the route picks up.
    monkeypatch.setattr("app.routers.alerts.fire_alerts", probe)
    _assert_pool_idle_before_request()

    resp = client.post(
        "/producers/me/products",
        json={"name": "לחם שיפון", "price_min": 25},
        headers=headers,
    )

    assert resp.status_code == 201, resp.text
    assert len(probe.readings) == 1, "new-product alert task did not run"
    _assert_released(probe.readings, "new-product alert")
