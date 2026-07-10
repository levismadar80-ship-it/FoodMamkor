"""
Tests for MEH-88: products.image_url + CRUD endpoints.

Coverage:
- GET /producers/me/products returns list
- POST /producers/me/products creates a product with/without image_url
- PUT /producers/me/products/:id updates image_url
- DELETE /producers/me/products/:id removes the product
- IDOR: cannot modify another producer's product
- ProductOut includes image_url field
"""
import uuid


from app.models.models import Product, User
from conftest import auth_header, make_producer


def _make_producer_user(db, *, email=None):
    producer = make_producer(db)
    user = User(
        email=email or f"p{uuid.uuid4().hex[:8]}@test.com",
        name="Producer User",
        password_hash="hash",
        role="producer",
        is_producer=True,
        producer_id=producer.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, producer


class TestProductCRUD:
    def test_list_products_empty(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.get("/producers/me/products", headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_product_without_image(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "לחם שיפון", "description": "מחמצת", "price_range": "₪25", "price_min": 25},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "לחם שיפון"
        assert body["image_url"] is None
        assert "id" in body

    def test_create_product_with_image_url(self, client, db):
        user, _ = _make_producer_user(db)
        img = "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg"
        resp = client.post(
            "/producers/me/products",
            json={"name": "חלה", "image_url": img, "price_min": 18},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        assert resp.json()["image_url"] == img

    def test_update_product_image_url(self, client, db):
        user, producer = _make_producer_user(db)
        product = Product(producer_id=producer.id, name="גבינה")
        db.add(product)
        db.commit()
        db.refresh(product)

        new_img = "https://res.cloudinary.com/demo/image/upload/v1/cheese.jpg"
        resp = client.put(
            f"/producers/me/products/{product.id}",
            json={"image_url": new_img},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["image_url"] == new_img

    def test_update_clears_image_url_to_null(self, client, db):
        user, producer = _make_producer_user(db)
        product = Product(
            producer_id=producer.id,
            name="יוגורט",
            image_url="https://res.cloudinary.com/demo/image/upload/v1/yogurt.jpg",
        )
        db.add(product)
        db.commit()
        db.refresh(product)

        resp = client.put(
            f"/producers/me/products/{product.id}",
            json={"image_url": None},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        assert resp.json()["image_url"] is None

    def test_delete_product(self, client, db):
        user, producer = _make_producer_user(db)
        product = Product(producer_id=producer.id, name="חמאה")
        db.add(product)
        db.commit()
        db.refresh(product)

        resp = client.delete(
            f"/producers/me/products/{product.id}",
            headers=auth_header(user),
        )
        assert resp.status_code == 204
        assert db.query(Product).filter(Product.id == product.id).first() is None

    def test_idor_cannot_update_other_producer_product(self, client, db):
        user1, _ = _make_producer_user(db)
        _, producer2 = _make_producer_user(db)
        product = Product(producer_id=producer2.id, name="בשר")
        db.add(product)
        db.commit()
        db.refresh(product)

        resp = client.put(
            f"/producers/me/products/{product.id}",
            json={"name": "גנוב"},
            headers=auth_header(user1),
        )
        assert resp.status_code == 404

    def test_idor_cannot_delete_other_producer_product(self, client, db):
        user1, _ = _make_producer_user(db)
        _, producer2 = _make_producer_user(db)
        product = Product(producer_id=producer2.id, name="דבש")
        db.add(product)
        db.commit()
        db.refresh(product)

        resp = client.delete(
            f"/producers/me/products/{product.id}",
            headers=auth_header(user1),
        )
        assert resp.status_code == 404

    def test_list_returns_only_own_products(self, client, db):
        user1, producer1 = _make_producer_user(db)
        _, producer2 = _make_producer_user(db)

        db.add(Product(producer_id=producer1.id, name="שלי"))
        db.add(Product(producer_id=producer2.id, name="שלהם"))
        db.commit()

        resp = client.get("/producers/me/products", headers=auth_header(user1))
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "שלי" in names
        assert "שלהם" not in names


class TestProductPriceValidation:
    """MEH-295: Pydantic validation for price_min / price_max."""

    def test_create_rejects_price_min_below_one(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "מוצר", "price_min": 0},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_create_rejects_price_min_above_cap(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "מוצר", "price_min": 10001},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_create_rejects_price_max_below_min(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "מוצר", "price_min": 50, "price_max": 30},
            headers=auth_header(user),
        )
        assert resp.status_code == 422

    def test_create_accepts_price_min_only(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "מוצר", "price_min": 50},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["price_min"] == "50.00"
        assert body["price_max"] is None

    def test_create_accepts_price_min_and_max(self, client, db):
        user, _ = _make_producer_user(db)
        resp = client.post(
            "/producers/me/products",
            json={"name": "מוצר", "price_min": 50, "price_max": 80},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["price_min"] == "50.00"
        assert body["price_max"] == "80.00"

    def test_put_preserves_price_range_when_not_in_payload(self, client, db):
        """Regression: PUT uses model_dump(exclude_unset=True) — fields the
        client did NOT send must remain untouched. Locks in partial-update
        semantics so legacy `price_range` survives an edit-just-the-name flow.
        """
        user, producer = _make_producer_user(db)
        product = Product(
            producer_id=producer.id,
            name="גבינה ישנה",
            price_range="₪45/ק״ג",
        )
        db.add(product)
        db.commit()
        db.refresh(product)

        resp = client.put(
            f"/producers/me/products/{product.id}",
            json={"name": "גבינה חדשה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "גבינה חדשה"
        assert body["price_range"] == "₪45/ק״ג"
