"""
API tests for מהמקור backend.

Coverage:
- Auth: register, login (success/wrong password/blocked user), /auth/me
- Producers: list, filter by delivery_city, filter by category, get by id
- Admin: 401/403 for non-admins, approve flow, dashboard, users, categories,
  settings, analytics, page editing
"""
from app.models.models import AdminSetting, Producer, StaticPage
from conftest import auth_header, make_category, make_producer, make_user


# ---------- Auth ----------

class TestAuth:
    def test_register_creates_user_and_returns_token(self, client):
        resp = client.post(
            "/auth/register",
            json={"email": "alice@test.com", "name": "Alice", "password": "Pass1234!"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["access_token"]

    def test_register_duplicate_email_fails(self, client, db):
        make_user(db, email="dup@test.com")
        resp = client.post(
            "/auth/register",
            json={"email": "dup@test.com", "name": "x", "password": "Pass1234!"},
        )
        assert resp.status_code == 400

    def test_login_returns_jwt(self, client, db):
        make_user(db, email="bob@test.com", password="Pass1234!")
        resp = client.post(
            "/auth/login",
            json={"email": "bob@test.com", "password": "Pass1234!"},
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_wrong_password(self, client, db):
        make_user(db, email="bob2@test.com", password="Pass1234!")
        resp = client.post(
            "/auth/login",
            json={"email": "bob2@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    def test_login_blocked_user_returns_403(self, client, db):
        make_user(db, email="blocked@test.com", password="Pass1234!", is_blocked=True)
        resp = client.post(
            "/auth/login",
            json={"email": "blocked@test.com", "password": "Pass1234!"},
        )
        assert resp.status_code == 403

    def test_me_requires_token(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_me_returns_current_user(self, client, db):
        u = make_user(db, email="me@test.com")
        resp = client.get("/auth/me", headers=auth_header(u))
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@test.com"


# ---------- Producers ----------

class TestProducers:
    def test_list_producers_returns_only_approved(self, client, db):
        make_producer(db, name="Approved One", status="approved")
        make_producer(db, name="Pending One", status="pending")
        resp = client.get("/producers")
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert "Approved One" in names
        assert "Pending One" not in names

    def test_filter_by_delivery_city(self, client, db):
        make_producer(db, name="TLV Delivery", delivery_cities=["תל אביב"])
        make_producer(db, name="Haifa Delivery", delivery_cities=["חיפה"])
        resp = client.get("/producers", params={"delivery_city": "תל אביב"})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["TLV Delivery"]

    def test_filter_by_category(self, client, db):
        cat = make_category(db, name="ירקות")
        other = make_category(db, name="בשר")
        make_producer(db, name="Veg", category=cat)
        make_producer(db, name="Meat", category=other)
        resp = client.get("/producers", params={"category": cat.id})
        assert resp.status_code == 200
        names = [p["name"] for p in resp.json()]
        assert names == ["Veg"]

    def test_get_producer_by_id(self, client, db):
        p = make_producer(db, name="Detail")
        resp = client.get(f"/producers/{p.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Detail"

    def test_get_unknown_producer_404(self, client):
        resp = client.get("/producers/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404


# ---------- Admin guard ----------

class TestAdminGuard:
    def test_unauthenticated_admin_returns_401(self, client):
        # FastAPI returns 401 for missing token, not 403
        assert client.get("/admin/dashboard").status_code == 401

    def test_consumer_cannot_access_admin(self, client, db):
        u = make_user(db, role="consumer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403

    def test_producer_cannot_access_admin(self, client, db):
        u = make_user(db, role="producer")
        resp = client.get("/admin/dashboard", headers=auth_header(u))
        assert resp.status_code == 403


# ---------- Admin functionality ----------

class TestAdminFlows:
    def test_approve_pending_producer(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{p.id}/approve", headers=auth_header(admin)
        )
        assert resp.status_code == 200
        db.refresh(p)
        assert p.status == "approved"

    def test_dashboard_returns_stats(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db, status="approved")
        make_producer(db, status="pending")
        make_user(db, email="c1@t.com")
        resp = client.get("/admin/dashboard", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        assert "stats" in body
        assert body["stats"]["total_producers"] >= 2
        assert body["stats"]["pending_producers"] >= 1
        assert "monthly_producers" in body
        assert "map_points" in body

    def test_users_list_with_search(self, client, db):
        admin = make_user(db, role="admin", email="admin@t.com")
        make_user(db, email="findme@t.com", name="Findable")
        resp = client.get(
            "/admin/users",
            params={"search": "findme"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        emails = [u["email"] for u in resp.json()]
        assert "findme@t.com" in emails

    def test_change_user_role(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.put(
            f"/admin/users/{target.id}/role",
            json={"role": "admin"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.role == "admin"

    def test_block_user(self, client, db):
        admin = make_user(db, role="admin")
        target = make_user(db, role="consumer")
        resp = client.post(
            f"/admin/users/{target.id}/block",
            json={"is_blocked": True},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        db.refresh(target)
        assert target.is_blocked is True

    def test_categories_crud(self, client, db):
        admin = make_user(db, role="admin")
        # Create
        resp = client.post(
            "/admin/categories",
            json={"name": "חדש", "emoji": "✨"},
            headers=auth_header(admin),
        )
        assert resp.status_code in (200, 201)
        cat_id = resp.json()["id"]
        # List
        resp = client.get("/admin/categories", headers=auth_header(admin))
        assert any(c["id"] == cat_id for c in resp.json())
        # Update
        resp = client.put(
            f"/admin/categories/{cat_id}",
            json={"name": "ערוך", "emoji": "🔥"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Delete
        resp = client.delete(
            f"/admin/categories/{cat_id}", headers=auth_header(admin)
        )
        assert resp.status_code == 200

    def test_settings_get_and_update(self, client, db):
        admin = make_user(db, role="admin")
        resp = client.get("/admin/settings", headers=auth_header(admin))
        assert resp.status_code == 200
        defaults = resp.json()
        assert "admin_email" in defaults

        resp = client.put(
            "/admin/settings",
            json={"admin_email": "boss@mehamakor.co.il"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        # Persisted
        row = db.query(AdminSetting).filter(AdminSetting.key == "admin_email").first()
        assert row is not None
        assert row.value == "boss@mehamakor.co.il"

    def test_analytics_endpoint(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db)
        resp = client.get("/admin/analytics", headers=auth_header(admin))
        assert resp.status_code == 200
        body = resp.json()
        for key in ("monthly", "by_category", "by_city", "top_producers", "map_points"):
            assert key in body

    def test_static_page_editor(self, client, db):
        admin = make_user(db, role="admin")
        # First GET auto-creates blank page
        resp = client.get("/admin/pages/about", headers=auth_header(admin))
        assert resp.status_code == 200
        # Update body
        resp = client.put(
            "/admin/pages/about",
            json={"title": "החזון שלנו", "body": "אוכל אמיתי"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200
        page = db.query(StaticPage).filter(StaticPage.slug == "about").first()
        assert page.title == "החזון שלנו"
        assert page.body == "אוכל אמיתי"
