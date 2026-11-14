"""MEH-3137 — the grower declaration on the paths after registration.

MEH-2923 enforced and recorded it at POST /auth/register/producer only. Two
more owner-side writers can put a business into «ירקות» / «פירות»:

  * PUT /producers/me — an existing business switches categories;
  * POST /producers  — the draft-creation route.

(The claim and owner-invite paths are covered in their own test files.)

Rule on PUT: a business that never recorded the grower declaration and now
selects a grower category must send `farmer_declaration_accepted: true`; that
stamps it once. A business that already recorded it is not asked again.
"""

from app.constants import FARMER_DECLARATION_VERSION
from app.models import Producer
from conftest import auth_header, make_category, make_producer, make_user

GROWER_422 = "יש לאשר את הצהרת המגדל כדי להמשיך"


def _owner(db):
    other = make_category(db, name="שמנים", emoji="🫒")
    producer = make_producer(db, status="approved", category=other)
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


def _row(db, producer):
    db.expire_all()
    return db.get(Producer, producer.id)


class TestCategoryChange:
    def test_adding_veg_without_the_flag_is_rejected_and_nothing_changes(self, client, db):
        user, p = _owner(db)
        veg = make_category(db, name="ירקות", emoji="🥬")
        before = sorted(c.id for c in p.categories)
        r = _put(client, user, {"category_ids": [veg.id]})
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == GROWER_422
        row = _row(db, p)
        assert sorted(c.id for c in row.categories) == before
        assert row.farmer_declared_at is None

    def test_adding_fruit_with_the_flag_stamps_it(self, client, db):
        user, p = _owner(db)
        fruit = make_category(db, name="פירות", emoji="🍎")
        r = _put(client, user, {"category_ids": [fruit.id], "farmer_declaration_accepted": True})
        assert r.status_code == 200, r.text
        row = _row(db, p)
        assert row.farmer_declared_at is not None
        assert row.farmer_declaration_version == FARMER_DECLARATION_VERSION

    def test_already_declared_business_is_not_asked_again(self, client, db):
        user, p = _owner(db)
        veg = make_category(db, name="ירקות", emoji="🥬")
        assert _put(client, user, {"category_ids": [veg.id], "farmer_declaration_accepted": True}).status_code == 200
        first = _row(db, p).farmer_declared_at
        fruit = make_category(db, name="פירות", emoji="🍎")
        r = _put(client, user, {"category_ids": [veg.id, fruit.id]})
        assert r.status_code == 200, r.text
        assert _row(db, p).farmer_declared_at == first  # not re-stamped

    def test_non_grower_change_needs_no_flag_and_stamps_nothing(self, client, db):
        user, p = _owner(db)
        bread = make_category(db, name="קטגוריה אחרת", emoji="🧺")
        r = _put(client, user, {"category_ids": [bread.id]})
        assert r.status_code == 200, r.text
        assert _row(db, p).farmer_declared_at is None

    def test_an_edit_without_categories_is_untouched(self, client, db):
        """A grower business from before MEH-2923 (no stamp) can still save
        an unrelated field — the gate fires on a category write only."""
        user, p = _owner(db)
        veg = make_category(db, name="ירקות", emoji="🥬")
        p.categories = [veg]
        db.commit()
        r = _put(client, user, {"short_description": "ירקות טריים מהשדה"})
        assert r.status_code == 200, r.text


class TestCreateRoute:
    BASE = {"name": "חוות ההצהרה", "city": "תל אביב", "phone": "0501234567"}

    def test_veg_without_the_flag_is_rejected(self, client, db):
        user = make_user(db, email="create3137@example.com")
        veg = make_category(db, name="ירקות", emoji="🥬")
        r = client.post("/producers", json={**self.BASE, "category_ids": [veg.id]}, headers=auth_header(user))
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == GROWER_422
        assert db.query(Producer).count() == 0

    def test_veg_with_the_flag_is_stamped(self, client, db):
        user = make_user(db, email="create3137b@example.com")
        veg = make_category(db, name="ירקות", emoji="🥬")
        r = client.post(
            "/producers",
            json={**self.BASE, "category_ids": [veg.id], "farmer_declaration_accepted": True},
            headers=auth_header(user),
        )
        assert r.status_code == 201, r.text
        db.expire_all()
        row = db.query(Producer).one()
        assert row.farmer_declared_at is not None
        assert row.farmer_declaration_version == FARMER_DECLARATION_VERSION
