"""MEH-2897 — the golden-path personas (anchor plan §C.1).

`seed_demo_business.py --golden` must:
  - create the seven logins the Playwright `golden` project walks, each with
    the content its spec reads (products / events + experience / markets /
    a rescue-ready pickup point / several locations + kashrut);
  - be idempotent: a second run creates nothing, it only resets passwords;
  - refuse to run against production (the script's `_assert_not_production`,
    reached through `main()`, before any session is opened);
  - refuse without the three existing QA password secrets, before any write;
  - stay out of the default run, which CI's seed step uses.

The persona table also lives in frontend/e2e/golden/personas.ts (the specs
log in from it). `test_golden_personas_match_the_playwright_table` reads that
file, so the two lists cannot drift apart silently.

DB-backed: runs under the repo conftest in CI (the local Postgres is not
usable from the CC sandbox).
"""

import re
import sys
from pathlib import Path

import pytest

from app.auth import verify_password
from app.models.models import (
    Event,
    Experience,
    GroupBuy,
    KashrutBadgeRequest,
    Producer,
    ProducerLocation,
    Product,
    User,
)
from scripts import seed_demo_business as seed
from tests.conftest import make_category

OWNER_PW = "GoldenOwnerPw2026xyz"
CONSUMER_PW = "GoldenConsumerPw2026xyz"
ADMIN_PW = "GoldenAdminPw2026xyz"

PERSONAS_TS = (
    Path(__file__).resolve().parents[1] / "frontend" / "e2e" / "golden" / "personas.ts"
)


@pytest.fixture()
def passwords(monkeypatch):
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW)
    monkeypatch.setenv("DEMO_CONSUMER_PASSWORD", CONSUMER_PW)
    monkeypatch.setenv("DEMO_ADMIN_PASSWORD", ADMIN_PW)


@pytest.fixture()
def bakery_category(db):
    return make_category(db, name=seed.DEMO_CATEGORY_NAME, emoji="🍞")


def _golden_users(db):
    return db.query(User).filter(User.email.like("golden-%@example.com")).all()


def _producer(db, slug):
    return db.query(Producer).filter(Producer.slug == slug).one()


def _counts(db):
    """Every row kind the golden seed writes, so idempotency is checked on all."""
    slugs = [b["slug"] for b in seed.GOLDEN_BUSINESSES]
    ids = [p.id for p in db.query(Producer).filter(Producer.slug.in_(slugs)).all()]
    users = _golden_users(db)
    return {
        "users": len(users),
        "producers": len(ids),
        "products": db.query(Product).filter(Product.producer_id.in_(ids)).count(),
        "events": db.query(Event).filter(Event.producer_id.in_(ids)).count(),
        "experiences": db.query(Experience)
        .filter(Experience.host_user_id.in_([u.id for u in users]))
        .count(),
        "locations": db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id.in_(ids))
        .count(),
        "kashrut_requests": db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.producer_id.in_(ids))
        .count(),
    }


def test_golden_seed_creates_all_seven_personas(db, passwords, bakery_category):
    result = seed.seed_golden_personas(db)

    expected = {
        "golden-products@example.com",
        "golden-events@example.com",
        "golden-organizer@example.com",
        "golden-rescue@example.com",
        "golden-locations@example.com",
        "golden-customer@example.com",
        "golden-admin@example.com",
    }
    assert set(result["created"]) == expected
    assert result["existing"] == []
    users = {u.email: u for u in _golden_users(db)}
    assert set(users) == expected

    # Every login works with the EXISTING secret for its kind, and is verified
    # (auth.py refuses an unverified login at token issue).
    for spec in seed.GOLDEN_BUSINESSES:
        owner = users[spec["email"]]
        assert owner.role == "producer", spec["key"]
        assert owner.email_verified is True, spec["key"]
        assert verify_password(OWNER_PW, owner.password_hash), spec["key"]
        producer = _producer(db, spec["slug"])
        assert owner.producer_id == producer.id, spec["key"]
        assert producer.status == "approved", spec["key"]
        assert producer.kind == spec["kind"], spec["key"]
        assert "DEMO" in producer.admin_notes, spec["key"]  # check_no_demo_data
    customer = users["golden-customer@example.com"]
    assert customer.role == "consumer" and customer.producer_id is None
    assert verify_password(CONSUMER_PW, customer.password_hash)
    admin = users["golden-admin@example.com"]
    assert admin.role == "admin" and admin.producer_id is None
    assert verify_password(ADMIN_PW, admin.password_hash)


def test_each_golden_business_carries_what_its_spec_reads(
    db, passwords, bakery_category
):
    seed.seed_golden_personas(db)

    g1 = _producer(db, "golden-products")
    assert db.query(Product).filter(Product.producer_id == g1.id).count() == len(
        seed.GOLDEN_PRODUCTS
    )
    assert db.query(Event).filter(Event.producer_id == g1.id).count() == 0

    g2 = _producer(db, "golden-events")
    g2_owner = db.query(User).filter(User.email == "golden-events@example.com").one()
    assert db.query(Event).filter(Event.producer_id == g2.id).count() == 1
    experience = (
        db.query(Experience).filter(Experience.host_user_id == g2_owner.id).one()
    )
    assert (experience.status, experience.moderation_status) == ("approved", "APPROVED")

    g3 = _producer(db, "golden-organizer")
    assert g3.kind == "organizer"
    assert db.query(Event).filter(Event.producer_id == g3.id).count() == len(
        seed.GOLDEN_MARKETS
    )
    # The organizer sells nothing: no group buy, no products, no pin.
    assert db.query(GroupBuy).filter(GroupBuy.producer_id == g3.id).count() == 0
    assert db.query(Product).filter(Product.producer_id == g3.id).count() == 0
    assert (
        db.query(ProducerLocation).filter(ProducerLocation.producer_id == g3.id).count()
        == 0
    )

    # G4's bag is published by the run, so the seed's job is a pickup point the
    # rescue API accepts: primary, exact precision (rescue.py refuses otherwise).
    g4 = _producer(db, "golden-rescue")
    g4_point = (
        db.query(ProducerLocation).filter(ProducerLocation.producer_id == g4.id).one()
    )
    assert g4_point.is_primary is True
    assert g4_point.location_precision == "exact"

    g5 = _producer(db, "golden-locations")
    g5_rows = (
        db.query(ProducerLocation).filter(ProducerLocation.producer_id == g5.id).all()
    )
    assert len(g5_rows) == 1 + len(seed.GOLDEN_PICKUPS)
    assert sum(1 for row in g5_rows if row.is_primary) == 1
    assert g5.kashrut_badges == ["badatz"]
    request = (
        db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.producer_id == g5.id)
        .one()
    )
    assert request.status == "approved" and request.cert_url


def test_golden_seed_is_idempotent(db, passwords, bakery_category, monkeypatch):
    seed.seed_golden_personas(db)
    first = _counts(db)
    assert first["users"] == 7 and first["producers"] == 5

    # A second run with a ROTATED secret: nothing new, every password reset.
    monkeypatch.setenv("DEMO_OWNER_PASSWORD", OWNER_PW + "-rotated")
    second_result = seed.seed_golden_personas(db)

    assert second_result["created"] == []
    assert len(second_result["existing"]) == 7
    assert _counts(db) == first
    owner = db.query(User).filter(User.email == "golden-products@example.com").one()
    db.refresh(owner)
    assert verify_password(OWNER_PW + "-rotated", owner.password_hash)


@pytest.mark.parametrize(
    "missing",
    ["DEMO_OWNER_PASSWORD", "DEMO_CONSUMER_PASSWORD", "DEMO_ADMIN_PASSWORD"],
)
def test_golden_seed_refuses_without_each_password(
    db, passwords, bakery_category, monkeypatch, missing
):
    monkeypatch.delenv(missing, raising=False)
    with pytest.raises(SystemExit) as exc:
        seed.seed_golden_personas(db)
    assert missing in str(exc.value)
    assert _golden_users(db) == []


class _StubEngine:
    def __init__(self, url):
        self.url = url


def test_golden_main_refuses_production_before_opening_a_session(
    db, passwords, bakery_category, monkeypatch
):
    monkeypatch.setattr(
        seed, "engine", _StubEngine("postgresql://u:p@db.railway.internal:5432/x")
    )
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.setattr(sys, "argv", ["seed_demo_business.py", "--golden"])

    def _no_session():
        raise AssertionError("main() opened a DB session against production")

    monkeypatch.setattr(seed, "SessionLocal", _no_session)
    with pytest.raises(SystemExit) as exc:
        seed.main()
    assert "REFUSING" in str(exc.value)
    assert _golden_users(db) == []


def test_golden_main_on_staging_seeds_only_the_personas(
    db, passwords, bakery_category, monkeypatch
):
    """`--golden` runs the golden seed and NOTHING else (no demo business)."""
    monkeypatch.setattr(
        seed, "engine", _StubEngine("postgresql://u:p@db.railway.internal:5432/x")
    )
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "staging")
    monkeypatch.setattr(sys, "argv", ["seed_demo_business.py", "--golden"])

    # main() opens and closes its OWN session (the real SessionLocal, i.e. the
    # test database); only the guard's view of the host is stubbed above.
    # Do NOT hand it the fixture's session with `close` patched out: the
    # conftest tears `db` down before it undoes monkeypatches, so that session
    # never closes, keeps its lock on `users`, and the next test's TRUNCATE
    # waits on it forever (the first CI run of this file hung a shard).
    seed.main()

    db.expire_all()
    assert len(_golden_users(db)) == 7
    assert db.query(Producer).filter(Producer.slug == seed.DEMO_SLUG).count() == 0


def test_default_run_does_not_seed_golden_personas(monkeypatch):
    """CI's seed step runs `seed_demo_business --refresh`; the personas must
    not ride along, or every E2E and seed-coverage count would move."""
    called = []
    for name in (
        "seed_demo_business",
        "seed_dietary_scope_demos",
        "seed_availability_demos",
        "seed_marketing_fixtures",
    ):
        monkeypatch.setattr(seed, name, lambda *a, _n=name, **k: called.append(_n))
    monkeypatch.setattr(
        seed, "seed_golden_personas", lambda *a, **k: called.append("golden")
    )
    # main() opens (and closes) a real session; every seeder it could call is
    # stubbed above, so nothing is written.
    monkeypatch.setattr(sys, "argv", ["seed_demo_business.py", "--refresh"])

    seed.main()

    assert "golden" not in called
    assert "seed_demo_business" in called


def test_golden_is_exclusive_with_the_other_modes(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["seed_demo_business.py", "--golden", "--refresh"])
    with pytest.raises(SystemExit) as exc:
        seed.main()
    assert "mutually exclusive" in str(exc.value)


def test_golden_personas_match_the_playwright_table():
    """frontend/e2e/golden/personas.ts is what the specs log in with. Same
    emails, same password env per email, or the run logs in as nobody."""
    source = PERSONAS_TS.read_text(encoding="utf-8")
    pairs = re.findall(
        r'email:\s*"(golden-[a-z0-9-]+@example\.com)",\s*passwordEnv:\s*"(DEMO_[A-Z]+_PASSWORD)"',
        source,
    )
    ts_table = dict(pairs)
    assert len(pairs) == len(ts_table), "an email is listed twice in personas.ts"

    py_table = {
        b["email"]: seed.GOLDEN_OWNER_PASSWORD_ENV for b in seed.GOLDEN_BUSINESSES
    }
    py_table[seed.GOLDEN_CUSTOMER["email"]] = seed.GOLDEN_CONSUMER_PASSWORD_ENV
    py_table[seed.GOLDEN_ADMIN["email"]] = seed.GOLDEN_ADMIN_PASSWORD_ENV

    assert len(py_table) == 7
    assert ts_table == py_table
    # The order the run walks them is the seed's order too.
    assert [email for email, _ in pairs] == seed.golden_persona_emails()
