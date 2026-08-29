"""MEH-2092 — demo producers must never be seeded on production.

THE BUG
-------
``seed()`` runs on every boot (``startup.py:_run_db_init_sync``) and inserted the
five ``PRODUCERS`` fixtures with ``status="approved"``. Its existence check is
presence-by-slug, which cannot distinguish "never seeded" from "an admin removed
this on purpose" — so a production boot silently re-created rows an admin had
deleted and re-approved ones she had suspended. Measured on production
16/08/2026: five fixtures suspended via the admin panel at ~08:15 UTC were back
in the public catalogue after the 08:45 boot, with «טבע פור» carrying a
brand-new UUID.

WHY THE GATE IS THE FIX AND A SMARTER CHECK IS NOT
--------------------------------------------------
No refinement of the slug check can work: "row absent" is exactly the state a
deliberate deletion produces, so any insert-only seed keyed on presence will
resurrect it. The only thing that distinguishes the two worlds is *which
environment we are in*, which is why the gate reads ``settings.env`` rather than
inspecting the table harder. Categories and the admin user are reference data
and stay environment-agnostic — the tests below pin that boundary in both
directions, because a gate that also skipped categories would break boot.

DISCRIMINATION
--------------
``test_production_seed_creates_zero_producers`` is the discriminating case: it
asserts a COUNT of 0, so it fails by construction against any implementation
without the gate (pre-fix ``seed()`` creates five rows in every environment).
Demonstrated red against the pre-fix code and green after — both runs are in the
PR body, per ``.claude/rules/testing.md``.

The count is read from the database, never derived from a literal this file also
writes: ``test_non_production_seed_creates_the_demo_producers`` compares against
``len(PRODUCERS)``, the same list the implementation consumes, so adding or
removing a fixture moves both sides together instead of stranding the assertion.
"""

import pytest
import structlog

from app.config import settings
from app.models import Producer, ProducerRecipe
from app.models.models import User
from seed_data import PRODUCERS, seed

# A row that is emphatically NOT a fixture: its slug appears nowhere in
# PRODUCERS, so it stands in for the real businesses of MEH-409. seed() must
# leave it alone in every environment.
REAL_SLUG = "meh2092-real-business"

FIXTURE_SLUGS = {p["slug"] for p in PRODUCERS}


@pytest.fixture
def env(monkeypatch):
    """Set settings.env for the duration of one test.

    seed() reads ``settings.env`` at call time from the module-level singleton
    that seed_data imported, so patching the attribute on that object is what
    the gate actually sees — no reimport needed.
    """

    def _set(value: str):
        monkeypatch.setattr(settings, "env", value)

    return _set


def _make_real_producer(db) -> Producer:
    """A pre-existing non-fixture producer, as an admin would have created."""
    producer = Producer(
        name="עסק אמיתי של ספיר",
        description="לא fixture — נוצר בפאנל האדמין",
        city="חיפה",
        lat=32.7940,
        lng=34.9896,
        slug=REAL_SLUG,
        status="approved",
    )
    db.add(producer)
    db.commit()
    db.refresh(producer)
    return producer


# --------------------------------------------------------------- production


def test_production_seed_creates_zero_producers(db, env):
    """THE DISCRIMINATION CASE — remove the gate and this goes red.

    Asserts the count in the table, not that some named slug is missing: a
    per-slug assertion would still pass if the gate leaked a sixth row in.
    """
    env("production")

    seed()

    assert db.query(Producer).count() == 0


@pytest.mark.parametrize("value", ["production", "PRODUCTION", "Production"])
def test_production_gate_is_case_insensitive(db, env, value):
    """``ENV=Production`` must gate too — the gate lowercases before comparing.

    Not decoration: config.py:147 already lowercases ``settings.env`` to pick the
    database URL, so a capitalised value selects the production DATABASE and
    would, without ``.lower()`` here, also seed demo rows into it.
    """
    env(value)

    seed()

    assert db.query(Producer).count() == 0


def test_production_seed_still_creates_reference_data(db, env, monkeypatch):
    """Categories and the admin user are reference data — the gate must not
    touch them. If it did, a production boot would come up with an empty
    category list and no admin, which is a worse outage than the one being
    fixed."""
    env("production")
    monkeypatch.setattr(settings, "admin_email", "admin-meh2092@mehamakor.online")
    monkeypatch.setattr(settings, "admin_password", "Correct-Horse-Battery-92!")

    seed()

    from app.models import Category

    assert db.query(Category).count() > 0
    assert (
        db.query(User).filter(User.email == "admin-meh2092@mehamakor.online").count()
        == 1
    )


def test_production_skip_logs_one_info_line(db, env):
    """The line Sapir greps for in the Railway boot log (DoD §5).

    ``capture_logs`` intercepts at the bound-logger level, so this asserts the
    event regardless of how structlog is configured/rendered in the run.
    """
    env("production")

    with structlog.testing.capture_logs() as logs:
        seed()

    skips = [
        e
        for e in logs
        if e.get("event") == "seed: demo producers skipped (ENV=production)"
    ]
    assert len(skips) == 1
    assert skips[0]["log_level"] == "info"


def test_production_seed_does_not_raise(db, env):
    """db_init equivalence: a production boot with zero demo producers is a
    SUCCESS, not a degraded state.

    startup.py:167 catches any exception out of seed() and latches
    db_init_status="failed" for the life of the process (startup.py:193), so
    "the gate raised nothing" is the same claim as "db_init stays ready". The
    category-name validation that used to run unconditionally now lives inside
    the gated helper with the PRODUCERS list it validates — this test is what
    catches it being left behind on the production path.
    """
    env("production")

    seed()  # must not raise
    seed()  # idempotent on a second boot, same as before


# ----------------------------------------------------------- non-production


@pytest.mark.parametrize("value", ["staging", "development", "test"])
def test_non_production_seed_creates_the_demo_producers(db, env, value):
    """Every non-production environment keeps today's behaviour exactly."""
    env(value)

    seed()

    seeded = db.query(Producer).all()
    assert len(seeded) == len(PRODUCERS)
    assert {p.slug for p in seeded} == FIXTURE_SLUGS
    assert {p.status for p in seeded} == {"approved"}


def test_non_production_seed_still_creates_the_golan_recipe(db, env):
    """The MEH-906 demo recipe depends on the golan-cheese fixture, so it is
    gated with it — and must still be seeded when the fixtures are."""
    env("staging")

    seed()

    assert db.query(ProducerRecipe).count() == 1


def test_non_production_seed_is_idempotent(db, env):
    """Two boots on staging leave five rows, not ten — the pre-existing
    slug-keyed guard is unchanged by this ticket."""
    env("staging")

    seed()
    first_ids = {p.id for p in db.query(Producer).all()}
    seed()

    assert {p.id for p in db.query(Producer).all()} == first_ids


# ------------------------------------------- a real row survives either way


@pytest.mark.parametrize("value", ["production", "staging"])
def test_real_producer_survives_seed_untouched(db, env, value):
    """A non-fixture row is never read, rewritten, or removed by seed().

    Identity is compared by id: a seed that deleted and re-inserted the row
    would keep the slug and fail here, which is the exact shape of the
    production incident («טבע פור» came back with a new UUID).
    """
    real = _make_real_producer(db)
    original = (real.id, real.name, real.status)
    env(value)

    seed()

    survivor = db.query(Producer).filter(Producer.slug == REAL_SLUG).one()
    db.refresh(survivor)
    assert (survivor.id, survivor.name, survivor.status) == original
