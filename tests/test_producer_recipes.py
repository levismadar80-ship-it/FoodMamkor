"""API tests for the producer recipes feature (MEH-589 chunk 2/4).

Producer recipes are owned by a single business and link many-to-many
to that business's products. Every recipe goes through Claude Haiku
pre-moderation, then admin approval before becoming public on the
producer's page.

Coverage:
  - Producer CRUD: auth, IDOR, M2M product linking, content-change re-moderation
  - Public read: only published+approved, slug + recipe_id lookup
  - Admin moderation: pending queue, approve / request-changes / reject
  - Cross-producer M2M blocked (FINDER#6 defense from MEH-588 review)

REUSES: tests/test_experiences.py:1-100 — _payload / _mock_moderation
pattern. Claude calls are monkey-patched so tests are deterministic
and don't need ANTHROPIC_API_KEY.
"""

from uuid import uuid4

from app.models.models import Producer, ProducerRecipe, Product, User
from conftest import auth_header, make_producer, make_user


# ---------- helpers ----------


def _payload(**overrides) -> dict:
    """Valid minimal recipe submission payload."""
    base = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה ביתית עם הקמח שלנו",
        "ingredients": (
            "500 גרם קמח חיטה מלאה\n"
            "10 גרם מלח\n"
            "350 מל מים פושרים\n"
            "100 גרם מחמצת פעילה"
        ),
        "instructions": (
            "ערבבי את הקמח עם המלח, הוסיפי את המים והמחמצת, "
            "לושי 10 דקות, תני לתפיחה 4-6 שעות, אפי ב-220 מעלות "
            "למשך 35 דקות עד שהקראסט זהוב."
        ),
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "product_ids": [],
    }
    base.update(overrides)
    return base


def _make_producer_user(db, *, email: str = "p@test.com") -> tuple[Producer, User]:
    """Create a Producer + a User that owns it. Mirrors how the
    register flow wires User.producer_id."""
    producer = make_producer(db, name=f"Test Producer {uuid4().hex[:6]}")
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_product(db, producer: Producer, *, name: str = "קמח חיטה מלאה") -> Product:
    p = Product(producer_id=producer.id, name=name, price_range="₪20")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _mock_moderation(monkeypatch, status="APPROVED", reason=None, suggestion=None):
    """REUSES: test_experiences.py:83-100 — patch both the service
    module AND the local router import so `from … import validate_X`
    aliases are also stubbed."""
    result = {"status": status, "reason": reason, "suggestion": suggestion}

    def _fake_validate(_):
        return result

    import app.routers.producer_recipes as router_mod
    import app.services.producer_recipe_moderation as svc_mod

    monkeypatch.setattr(svc_mod, "validate_producer_recipe", _fake_validate)
    monkeypatch.setattr(router_mod, "validate_producer_recipe", _fake_validate)


# ---------- Producer-self CRUD ----------


class TestProducerCreate:
    def test_requires_auth(self, client):
        assert (
            client.post("/producers/me/recipes", json=_payload()).status_code
            == 401
        )

    def test_consumer_blocked(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        user = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(),
            headers=auth_header(user),
        )
        # require_producer rejects with 403 before any business logic.
        assert resp.status_code == 403

    def test_producer_creates_recipe_approved_pre_check(
        self, client, db, monkeypatch
    ):
        _mock_moderation(monkeypatch, status="APPROVED")
        producer, user = _make_producer_user(db)
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # Recipe lands as 'pending' awaiting admin even if Claude says APPROVED.
        assert body["moderation_status"] == "pending"
        assert body["published"] is False
        assert body["producer_id"] == str(producer.id)
        assert body["product_ids"] == []

    def test_flagged_recipe_persists_with_notes(self, client, db, monkeypatch):
        _mock_moderation(
            monkeypatch, status="FLAGGED", reason="הוראות הכנה קצרות"
        )
        _, user = _make_producer_user(db)
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(),
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["moderation_status"] == "pending"
        assert body["moderation_notes"] == "הוראות הכנה קצרות"

    def test_rejected_recipe_blocked_400(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch, status="REJECTED", reason="ספאם")
        _, user = _make_producer_user(db)
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(),
            headers=auth_header(user),
        )
        assert resp.status_code == 400
        assert resp.json()["detail"]["error"] == "recipe_rejected"

    def test_links_to_own_products(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        producer, user = _make_producer_user(db)
        prod1 = _make_product(db, producer)
        prod2 = _make_product(db, producer, name="שמן זית")
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(product_ids=[str(prod1.id), str(prod2.id)]),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert set(body["product_ids"]) == {str(prod1.id), str(prod2.id)}

    def test_cross_producer_products_blocked_422(self, client, db, monkeypatch):
        """Defense for MEH-588 adversarial FINDER#6 — a recipe cannot
        link to another producer's products."""
        _mock_moderation(monkeypatch)
        producer_a, user_a = _make_producer_user(db, email="a@test.com")
        producer_b, _ = _make_producer_user(db, email="b@test.com")
        foreign_product = _make_product(db, producer_b, name="לחם של B")
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(product_ids=[str(foreign_product.id)]),
            headers=auth_header(user_a),
        )
        assert resp.status_code == 422

    def test_missing_product_id_422(self, client, db, monkeypatch):
        _mock_moderation(monkeypatch)
        _, user = _make_producer_user(db)
        resp = client.post(
            "/producers/me/recipes",
            json=_payload(product_ids=[str(uuid4())]),
            headers=auth_header(user),
        )
        assert resp.status_code == 422


class TestProducerListGet:
    def test_lists_only_my_recipes(self, client, db, monkeypatch):
        producer_a, user_a = _make_producer_user(db, email="a@test.com")
        producer_b, _ = _make_producer_user(db, email="b@test.com")
        # Insert one recipe per producer directly so we don't run the moderator.
        for name, prod_id in [("רק שלי", producer_a.id), ("של ב'", producer_b.id)]:
            db.add(
                ProducerRecipe(
                    producer_id=prod_id,
                    title=name,
                    ingredients="א" * 20,
                    instructions="ב" * 20,
                    moderation_status="pending",
                )
            )
        db.commit()
        resp = client.get(
            "/producers/me/recipes", headers=auth_header(user_a)
        )
        assert resp.status_code == 200
        titles = [r["title"] for r in resp.json()]
        assert titles == ["רק שלי"]

    def test_get_one_404_when_not_mine(self, client, db, monkeypatch):
        producer_a, _ = _make_producer_user(db, email="a@test.com")
        _, user_b = _make_producer_user(db, email="b@test.com")
        recipe = ProducerRecipe(
            producer_id=producer_a.id,
            title="של א'",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="pending",
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        resp = client.get(
            f"/producers/me/recipes/{recipe.id}",
            headers=auth_header(user_b),
        )
        # 404 not 403 — don't leak existence to a different producer.
        assert resp.status_code == 404


class TestProducerUpdate:
    def test_metadata_change_does_not_remoderate(self, client, db, monkeypatch):
        # Set up an approved + published recipe.
        producer, user = _make_producer_user(db)
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="כותרת",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="approved",
            published=True,
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)

        # If the moderator is called, the test fails: install a tripwire.
        def _tripwire(_):
            raise AssertionError("moderation should NOT run for metadata-only edit")

        import app.routers.producer_recipes as router_mod

        monkeypatch.setattr(router_mod, "validate_producer_recipe", _tripwire)

        resp = client.patch(
            f"/producers/me/recipes/{recipe.id}",
            json={"prep_time_min": 45, "servings": 12},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["moderation_status"] == "approved"
        assert body["published"] is True
        assert body["prep_time_min"] == 45

    def test_content_change_resets_moderation(self, client, db, monkeypatch):
        producer, user = _make_producer_user(db)
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="כותרת ישנה",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="approved",
            published=True,
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)

        _mock_moderation(monkeypatch, status="APPROVED")

        resp = client.patch(
            f"/producers/me/recipes/{recipe.id}",
            json={"title": "כותרת חדשה לגמרי"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["moderation_status"] == "pending"
        assert body["published"] is False
        assert body["title"] == "כותרת חדשה לגמרי"

    def test_content_change_rejected_400(self, client, db, monkeypatch):
        producer, user = _make_producer_user(db)
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="כותרת",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="approved",
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        _mock_moderation(monkeypatch, status="REJECTED", reason="ספאם")
        resp = client.patch(
            f"/producers/me/recipes/{recipe.id}",
            json={"ingredients": "מצרכים חדשים שהם לא בסדר"},
            headers=auth_header(user),
        )
        assert resp.status_code == 400


class TestProducerDelete:
    def test_owner_deletes(self, client, db):
        producer, user = _make_producer_user(db)
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="t",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="pending",
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        resp = client.delete(
            f"/producers/me/recipes/{recipe.id}",
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert (
            db.query(ProducerRecipe)
            .filter(ProducerRecipe.id == recipe.id)
            .first()
            is None
        )

    def test_non_owner_gets_404(self, client, db):
        producer_a, _ = _make_producer_user(db, email="a@test.com")
        _, user_b = _make_producer_user(db, email="b@test.com")
        recipe = ProducerRecipe(
            producer_id=producer_a.id,
            title="t",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="pending",
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        resp = client.delete(
            f"/producers/me/recipes/{recipe.id}",
            headers=auth_header(user_b),
        )
        assert resp.status_code == 404


# ---------- Public read ----------


class TestPublicRead:
    def _setup(self, db, *, published=True, moderation="approved"):
        producer = make_producer(db, name="חנות מתכונים", status="approved")
        producer.slug = "matkonim"
        db.commit()
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="חלת מחמצת",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status=moderation,
            published=published,
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        return producer, recipe

    def test_published_approved_recipe_visible(self, client, db):
        producer, recipe = self._setup(db)
        resp = client.get(f"/producers/{producer.slug}/recipes")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "חלת מחמצת"

    def test_unpublished_hidden(self, client, db):
        producer, _ = self._setup(db, published=False)
        resp = client.get(f"/producers/{producer.slug}/recipes")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_pending_hidden_even_if_published_true(self, client, db):
        # Defensive: even if `published` somehow gets set without admin
        # approval, the moderation_status filter still blocks the recipe.
        producer, _ = self._setup(db, published=True, moderation="pending")
        resp = client.get(f"/producers/{producer.slug}/recipes")
        assert resp.json() == []

    def test_unknown_slug_404(self, client, db):
        resp = client.get("/producers/does-not-exist/recipes")
        assert resp.status_code == 404

    def test_detail_published_visible(self, client, db):
        producer, recipe = self._setup(db)
        resp = client.get(f"/producers/{producer.slug}/recipes/{recipe.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(recipe.id)

    def test_detail_unpublished_404(self, client, db):
        producer, recipe = self._setup(db, published=False)
        resp = client.get(f"/producers/{producer.slug}/recipes/{recipe.id}")
        assert resp.status_code == 404


# ---------- Admin moderation ----------


class TestAdminModeration:
    def _make_pending_recipe(self, db):
        producer = make_producer(db, name="עסק", status="approved")
        recipe = ProducerRecipe(
            producer_id=producer.id,
            title="ממתינה",
            ingredients="א" * 20,
            instructions="ב" * 20,
            moderation_status="pending",
            published=False,
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)
        return recipe

    def test_non_admin_blocked(self, client, db):
        recipe = self._make_pending_recipe(db)
        user = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            f"/admin/recipes/{recipe.id}/approve",
            headers=auth_header(user),
        )
        assert resp.status_code == 403

    def test_pending_queue(self, client, db):
        self._make_pending_recipe(db)
        admin = make_user(db, role="admin", email="adm@test.com")
        resp = client.get(
            "/admin/recipes/pending", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["moderation_status"] == "pending"

    def test_approve_publishes(self, client, db):
        recipe = self._make_pending_recipe(db)
        admin = make_user(db, role="admin", email="adm@test.com")
        resp = client.post(
            f"/admin/recipes/{recipe.id}/approve",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["moderation_status"] == "approved"
        assert body["published"] is True
        assert body["moderation_notes"] is None

    def test_request_changes_requires_feedback(self, client, db):
        recipe = self._make_pending_recipe(db)
        admin = make_user(db, role="admin", email="adm@test.com")
        resp = client.post(
            f"/admin/recipes/{recipe.id}/request-changes",
            json={"feedback": None},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400

    def test_request_changes_with_feedback(self, client, db):
        recipe = self._make_pending_recipe(db)
        admin = make_user(db, role="admin", email="adm@test.com")
        resp = client.post(
            f"/admin/recipes/{recipe.id}/request-changes",
            json={"feedback": "צריך להוסיף זמני אפייה"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["moderation_status"] == "needs_revision"
        assert body["moderation_notes"] == "צריך להוסיף זמני אפייה"
        assert body["published"] is False

    def test_reject_terminal(self, client, db):
        recipe = self._make_pending_recipe(db)
        admin = make_user(db, role="admin", email="adm@test.com")
        resp = client.post(
            f"/admin/recipes/{recipe.id}/reject",
            json={"feedback": "ספאם"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["moderation_status"] == "rejected"
        assert body["moderation_notes"] == "ספאם"
        assert body["published"] is False
