"""MEH-1074 Wave 3 — demo-business seed script locks.

Covers backend/scripts/seed_demo_business.py:
  - a single run produces the complete "sample perfect listing": approved +
    document-verified producer, products, delivery areas, approved+published
    recipe linked to a product, future active event, reviews with one owner
    reply, correct denormalized aggregates, open-for-orders;
  - skip-if-exists idempotency (second run is a no-op);
  - --refresh recreates without duplicating seed users;
  - the production guard refuses a remote DB host unless
    RAILWAY_ENVIRONMENT == "staging", and always allows localhost.
"""
import importlib.util
import os
from datetime import date

import pytest

from app.models.models import (
    DeliveryArea,
    Event,
    Producer,
    ProducerRecipe,
    ProducerReview,
    Product,
    User,
)

from tests.conftest import make_category

_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "seed_demo_business.py"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("seed_demo_business", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def seed_mod():
    return _load_module()


@pytest.fixture()
def bakery_category(db, seed_mod):
    return make_category(db, name=seed_mod.DEMO_CATEGORY_NAME, emoji="🍞")


def test_seed_creates_complete_listing(db, seed_mod, bakery_category):
    producer = seed_mod.seed_demo_business(db)
    assert producer is not None

    row = db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()
    # Trust + availability signals of a "perfect" profile.
    assert row.status == "approved"
    assert row.verified_at is not None
    assert row.verification_doc_type == "license"
    assert row.phone_verified is True
    assert row.availability_state == "accepting_orders"
    assert len(row.images) == 3
    assert row.categories[0].name == seed_mod.DEMO_CATEGORY_NAME

    # Content completeness.
    assert db.query(Product).filter(Product.producer_id == row.id).count() == len(
        seed_mod.DEMO_PRODUCTS
    )
    assert db.query(DeliveryArea).filter(
        DeliveryArea.producer_id == row.id
    ).count() == len(seed_mod.DEMO_DELIVERY_AREAS)

    recipe = (
        db.query(ProducerRecipe).filter(ProducerRecipe.producer_id == row.id).one()
    )
    assert recipe.moderation_status == "approved"
    assert recipe.published is True
    assert len(recipe.products) == 1  # promotes the flagship product

    event = db.query(Event).filter(Event.producer_id == row.id).one()
    assert event.is_active is True
    assert event.event_date > date.today()

    # Social proof: reviews + one owner reply + denormalized aggregates.
    reviews = (
        db.query(ProducerReview).filter(ProducerReview.producer_id == row.id).all()
    )
    assert len(reviews) == len(seed_mod.DEMO_REVIEWS)
    replied = [r for r in reviews if r.reply]
    assert len(replied) == 1
    assert replied[0].reply_at is not None
    assert row.reviews_count == len(seed_mod.DEMO_REVIEWS)
    expected_avg = round(
        sum(r["stars"] for r in seed_mod.DEMO_REVIEWS) / len(seed_mod.DEMO_REVIEWS), 1
    )
    assert row.avg_rating == expected_avg

    # Owner login exists and is bound to the demo producer.
    owner = db.query(User).filter(User.email == seed_mod.DEMO_OWNER_EMAIL).one()
    assert owner.role == "producer"
    assert owner.producer_id == row.id
    # Login gates on email_verified (auth.py) — seed accounts get no email.
    assert owner.email_verified is True


def test_seed_skips_when_exists(db, seed_mod, bakery_category):
    assert seed_mod.seed_demo_business(db) is not None
    assert seed_mod.seed_demo_business(db) is None
    assert (
        db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).count() == 1
    )


def test_refresh_recreates_without_duplicates(db, seed_mod, bakery_category):
    first = seed_mod.seed_demo_business(db)
    second = seed_mod.seed_demo_business(db, refresh=True)
    assert second is not None
    assert second.id != first.id
    assert (
        db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).count() == 1
    )
    reviewer_emails = [r["email"] for r in seed_mod.DEMO_REVIEWS]
    assert (
        db.query(User).filter(User.email.in_(reviewer_emails)).count()
        == len(reviewer_emails)
    )


class _StubEngine:
    def __init__(self, url):
        self.url = url


@pytest.mark.parametrize(
    ("db_url", "railway_env", "allowed"),
    [
        ("postgresql://u:p@localhost:5432/x", "", True),
        ("postgresql://u:p@127.0.0.1:5432/x", "production", True),  # local always ok
        ("postgresql://u:p@db.railway.internal:5432/x", "", False),
        ("postgresql://u:p@db.railway.internal:5432/x", "production", False),
        ("postgresql://u:p@db.railway.internal:5432/x", "staging", True),
    ],
)
def test_production_guard(seed_mod, monkeypatch, db_url, railway_env, allowed):
    monkeypatch.setattr(seed_mod, "engine", _StubEngine(db_url))
    if railway_env:
        monkeypatch.setenv("RAILWAY_ENVIRONMENT", railway_env)
    else:
        monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    if allowed:
        seed_mod._assert_not_production()
    else:
        with pytest.raises(SystemExit):
            seed_mod._assert_not_production()
