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


# --------------------------------------------- real routes (red until chunk 2)

# MEH-2886 chunk 2: the strict xfail that held these red in chunk 1 is gone —
# with get_db releasing first they pass (the marker turned that into 4
# XPASS(strict) failures, which is how it was shown to be removable).


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


# ------------------------------------------------------------- chunk 2 guards


def test_task_handed_request_db_still_works_and_pool_is_idle_after(
    client, db, monkeypatch
):
    """§2.4: fire_alerts is handed the request's ``db`` and queries with it
    AFTER get_db's early close. The session re-opens a connection, the task
    completes, and get_db's ``finally`` returns it — the pool reads 0 after.

    This assertion is 0 on the pre-fix code too (the late close covered it),
    so it is shown red against a BROKEN variant instead: a get_db that closes
    early but has no ``finally`` close leaves the task's connection checked
    out, and this reads 1 (PR body)."""
    producer = make_producer(db)
    user = User(
        email="meh2886-alerts@test.com",
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

    from app.routers import alerts as alerts_module

    real_fire_alerts = alerts_module.fire_alerts
    ran = []

    def spying_fire_alerts(task_db, *args, **kwargs):
        # The task really uses the request's session after the early close.
        real_fire_alerts(task_db, *args, **kwargs)
        ran.append(True)

    monkeypatch.setattr(alerts_module, "fire_alerts", spying_fire_alerts)
    _assert_pool_idle_before_request()

    resp = client.post(
        "/producers/me/products",
        json={"name": "חלה", "price_min": 18},
        headers=headers,
    )

    assert resp.status_code == 201, resp.text
    assert ran == [True], (
        "fire_alerts did not run (it queries with the db it is handed)"
    )
    assert _checkedout() == 0, (
        f"pool reads {_checkedout()} after the request — a task re-opened the "
        "request's session and nothing returned the connection"
    )


def test_release_never_raises_so_later_tasks_still_run():
    """Starlette runs a request's tasks in one loop: if the early close raised,
    every task after it (the request's emails) would be cancelled."""
    import anyio

    from app.database import _release_session

    class _BrokenSession:
        def close(self):
            raise RuntimeError("pool reset failed")

    anyio.run(_release_session, _BrokenSession())  # must not raise


def _calls_with_background_kwarg(source: str, filename: str) -> list[str]:
    import ast

    hits = []
    for node in ast.walk(ast.parse(source, filename)):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", "")
            if any(k.arg == "background" for k in node.keywords) or (
                # Response(content, status_code, headers, media_type, background)
                name.endswith("Response") and len(node.args) >= 5
            ):
                hits.append(f"{filename}:{node.lineno}")
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Attribute) and t.attr == "background"
            for t in node.targets
        ):
            hits.append(f"{filename}:{node.lineno}")
    return hits


def test_background_kwarg_classifier_self_test():
    """The scan below must be able to see a hit before its 'none' means
    anything (testing.md: a probe whose null output is also its reassuring
    output is not evidence)."""
    bad = "from starlette.responses import JSONResponse\n" + (
        "def f():\n    return JSONResponse({}, background=None)\n"
    )
    assert _calls_with_background_kwarg(bad, "x.py") == ["x.py:3"]
    assert _calls_with_background_kwarg("r.background = t\n", "a.py") == ["a.py:1"]
    assert _calls_with_background_kwarg(
        "Response(b'', 200, None, None, t)\n", "p.py"
    ) == ["p.py:1"]
    assert _calls_with_background_kwarg("JSONResponse({})\n", "y.py") == []
    # Anchored to a real file (testing.md, MEH-1909): producers.py returns a
    # JSONResponse with no background — the scan must not flag it.
    from pathlib import Path

    real = Path(__file__).resolve().parents[1] / "backend/app/routers/producers.py"
    src = real.read_text(encoding="utf-8")
    assert "JSONResponse(" in src, "anchor file changed — pick another"
    assert _calls_with_background_kwarg(src, str(real)) == []


def test_no_route_returns_a_response_with_its_own_background():
    """FastAPI drops every solved BackgroundTask when a route returns a
    Response that carries ``background=`` (fastapi/routing.py:751-752) — the
    early release included, so the connection would again be held until
    get_db's ``finally``. None exist today; keep it that way."""
    from pathlib import Path

    app_dir = Path(__file__).resolve().parents[1] / "backend" / "app"
    files = sorted(app_dir.rglob("*.py"))
    assert len(files) > 100, f"scanned only {len(files)} files — wrong root?"
    hits = []
    for f in files:
        hits += _calls_with_background_kwarg(f.read_text(encoding="utf-8"), str(f))
    assert hits == [], (
        "a call passes background= — FastAPI then skips the request's "
        f"BackgroundTasks, including get_db's early release: {hits}"
    )


def test_release_does_not_deadlock_on_the_shared_threadpool(monkeypatch):
    """MEH-2886 chunk-2 review: the early release must not need a token from
    the default thread limiter that the sync endpoints also hold.

    Pool 1 + 0, checkout timeout 5 s, thread limiter 2 tokens, 4 concurrent
    GETs on a route that uses the REAL get_db. With a plain sync release task
    two requests time out at ~5 s (the release waits for a token held by
    handlers that wait for its connection). With the release on its own
    limiter — as FastAPI's own yield-dependency exit is — all four answer
    immediately."""
    import asyncio
    import time

    import anyio.to_thread
    import httpx
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    import app.database as database

    url = database.engine.url.render_as_string(hide_password=False)
    tiny = create_engine(url, pool_size=1, max_overflow=0, pool_timeout=5)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=tiny))
    probe_app = FastAPI()

    @probe_app.get("/q")
    def q(db: Session = Depends(database.get_db)):
        db.execute(text("SELECT 1")).scalar()
        return {"ok": True}

    async def run():
        anyio.to_thread.current_default_thread_limiter().total_tokens = 2
        transport = httpx.ASGITransport(app=probe_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
            t0 = time.monotonic()
            codes = await asyncio.gather(
                *(c.get("/q") for _ in range(4)), return_exceptions=True
            )
            return [getattr(r, "status_code", type(r).__name__) for r in codes], (
                time.monotonic() - t0
            )

    try:
        codes, elapsed = asyncio.run(run())
    finally:
        tiny.dispose()
    assert codes == [200, 200, 200, 200], f"{codes} after {elapsed:.2f}s"
    assert elapsed < 3, f"4 requests took {elapsed:.2f}s — the release waited"
