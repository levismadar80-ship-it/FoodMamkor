"""
Module:   test_meh997_e2e_journeys
Purpose:  Functional end-to-end journey suite (MEH-997). Each test executes a
          full critical user journey at the API+DB layer and asserts the DATA
          at every hop — row exists with expected status/owner, list API
          returns it, moderation transitions propagate — not just 2xx codes.
Touches:  Postgres test DB (mehamakor_test) via TestClient; Claude moderation
          is monkey-patched (deterministic, no ANTHROPIC_API_KEY needed);
          email/WhatsApp service layer is mock-captured, never sent.
Does NOT: exercise browser rendering — UI hops live in frontend/e2e/flows/
          (Playwright). Single-endpoint unit coverage lives in the per-feature
          test files (test_producer_recipes.py, test_experiences.py, ...).
Related:  frontend/e2e/flows/19-publish-approve-visible.spec.ts (MEH-216 UI
          twin of journey 2); tests/test_producer_recipes.py (recipe CRUD).
History:  MEH-997 (creation — functional E2E audit; seed: /admin/recipes
          frontend page missing while backend router existed).
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid4

from app.models.models import (
    Producer,
    ProducerRecipe,
    ProducerWhatsAppClick,
    User,
)
from conftest import (
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
)

# ---------- shared helpers ----------


def _make_producer_user(db, *, email=None, **producer_kwargs):
    """Producer + owning User, wired like the register flow.
    REUSES: tests/test_producer_recipes.py:53-63."""
    producer = make_producer(
        db, name=producer_kwargs.pop("name", f"עסק בדיקה {uuid4().hex[:6]}"),
        **producer_kwargs,
    )
    user = make_user(
        db, role="producer", email=email or f"p{uuid4().hex[:8]}@test.com"
    )
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _recipe_payload(**overrides) -> dict:
    """REUSES: tests/test_producer_recipes.py:29-52 — valid minimal recipe."""
    base = {
        "title": "חלת מחמצת קלאסית",
        "description": "מתכון פשוט לחלה ביתית",
        "ingredients": "500 גרם קמח\n10 גרם מלח\n350 מל מים\n100 גרם מחמצת",
        "instructions": (
            "ערבבי את הקמח עם המלח, הוסיפי מים ומחמצת, לושי 10 דקות, "
            "תני לתפיחה 4 שעות ואפי ב-220 מעלות 35 דקות."
        ),
        "prep_time_min": 30,
        "cook_time_min": 35,
        "servings": 8,
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "product_ids": [],
    }
    base.update(overrides)
    return base


def _experience_payload(**overrides) -> dict:
    """REUSES: tests/test_experiences.py — valid minimal submission."""
    from datetime import date

    base = {
        "title": "סדנת אפיית לחם מחמצת לכל המשפחה",
        "description": (
            "סדנה מעשית של 3 שעות ללימוד אפיית לחם מחמצת ביתי מהתחלה "
            "ועד הסוף. מתאים למתחילות ומתקדמות."
        ),
        "image_url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "category": "בישול",
        "event_date": (date.today() + timedelta(days=14)).isoformat(),
        "event_time": "10:00",
        "location_type": "home",
        "city": "תל אביב",
        "address": "רחוב הרצל 1",
        "price_per_person": 150,
        "max_participants": 10,
        "requirements": "סינר ונעליים סגורות",
        "is_recurring": False,
    }
    base.update(overrides)
    return base


def _group_buy_payload(**overrides) -> dict:
    """REUSES: tests/test_group_buys_api.py:56-68."""
    base = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (datetime.utcnow() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
    }
    base.update(overrides)
    return base


def _event_payload(**overrides) -> dict:
    from datetime import date

    base = {
        "title": "יריד טעימות בחווה",
        "description": "בואו לטעום מהתוצרת החדשה",
        "event_date": (date.today() + timedelta(days=7)).isoformat(),
        "event_time": "16:00",
        "city": "תל אביב",
        "category": "שוק",
        "price": 0,
        "image_url": "https://res.cloudinary.com/demo/image/upload/event.jpg",
    }
    base.update(overrides)
    return base


def _mock_recipe_moderation(monkeypatch, status="APPROVED", reason=None):
    """REUSES: tests/test_producer_recipes.py:73-86 — patch service module
    AND the router's imported alias."""
    result = {"status": status, "reason": reason, "suggestion": None}

    import app.routers.producer_recipes as router_mod
    import app.services.producer_recipe_moderation as svc_mod

    monkeypatch.setattr(svc_mod, "validate_producer_recipe", lambda _: result)
    monkeypatch.setattr(router_mod, "validate_producer_recipe", lambda _: result)


def _mock_experience_moderation(monkeypatch, status="APPROVED"):
    result = {"status": status, "reason": None, "suggestion": None}

    import app.routers.experiences as router_mod
    import app.services.experience_moderation as svc_mod

    monkeypatch.setattr(svc_mod, "validate_experience", lambda _: result)
    monkeypatch.setattr(router_mod, "validate_experience", lambda _: result)


# ============================================================
# Journey 1 — producer creates RECIPE → dashboard list → admin
# queue → approve → visible on public producer page
# ============================================================


class TestJourney1RecipePipeline:
    def test_recipe_create_to_public_visibility(self, client, db, monkeypatch):
        _mock_recipe_moderation(monkeypatch)
        producer, owner = _make_producer_user(db)
        producer.slug = f"recipes-{uuid4().hex[:6]}"
        db.commit()
        admin = make_user(db, role="admin", email="adm@test.com")

        # Hop 1 — producer submits; lands pending + unpublished
        resp = client.post(
            "/producers/me/recipes",
            json=_recipe_payload(),
            headers=auth_header(owner),
        )
        assert resp.status_code == 201
        recipe_id = resp.json()["id"]
        row = db.query(ProducerRecipe).filter_by(id=recipe_id).one()
        assert row.moderation_status == "pending"
        assert row.published is False
        assert row.producer_id == producer.id

        # Hop 2 — producer dashboard list shows it (all states)
        mine = client.get("/producers/me/recipes", headers=auth_header(owner))
        assert recipe_id in [r["id"] for r in mine.json()]

        # Hop 3 — admin pending queue shows it
        queue = client.get("/admin/recipes/pending", headers=auth_header(admin))
        assert queue.status_code == 200
        assert recipe_id in [r["id"] for r in queue.json()]
        # and the filterable admin list agrees
        listed = client.get(
            "/admin/recipes",
            params={"moderation_status": "pending"},
            headers=auth_header(admin),
        )
        assert recipe_id in [r["id"] for r in listed.json()]

        # Hop 4 — NOT public before approval
        public = client.get(f"/producers/{producer.slug}/recipes")
        assert public.status_code == 200
        assert recipe_id not in [r["id"] for r in public.json()]

        # Hop 5 — admin approves → published
        ok = client.post(
            f"/admin/recipes/{recipe_id}/approve", headers=auth_header(admin)
        )
        assert ok.status_code == 200
        db.expire_all()
        row = db.query(ProducerRecipe).filter_by(id=recipe_id).one()
        assert row.moderation_status == "approved"
        assert row.published is True

        # Hop 6 — now visible on the public producer page API
        public = client.get(f"/producers/{producer.slug}/recipes")
        assert recipe_id in [r["id"] for r in public.json()]

    def test_recipe_submit_fires_no_admin_notification(
        self, client, db, monkeypatch
    ):
        """MEH-997 journey-1 notification hop — EXECUTED PROBE.

        Documents current behavior: recipe submission fires NO admin
        notification (email or WhatsApp); admins learn about new recipes
        only by opening the pending queue. Contrast with producer
        registration (auth.py:534-535) which notifies fire-and-forget.
        If this test starts failing because a notification was added,
        the MEH-997 report-only gap is closed — update/remove this probe.
        """
        _mock_recipe_moderation(monkeypatch)
        _, owner = _make_producer_user(db)

        import app.services.email as email_svc
        import app.services.whatsapp as wa_svc

        email_mock = MagicMock()
        wa_text_mock = MagicMock()
        wa_template_mock = MagicMock()
        monkeypatch.setattr(email_svc, "send_email", email_mock)
        monkeypatch.setattr(wa_svc, "send_text", wa_text_mock)
        monkeypatch.setattr(wa_svc, "send_template", wa_template_mock)

        resp = client.post(
            "/producers/me/recipes",
            json=_recipe_payload(),
            headers=auth_header(owner),
        )
        assert resp.status_code == 201
        email_mock.assert_not_called()
        wa_text_mock.assert_not_called()
        wa_template_mock.assert_not_called()


# ============================================================
# Journey 2 — producer registration → admin approval → publicly
# visible, with the notification hop mock-captured
# ============================================================


class TestJourney2ProducerRegistration:
    def test_registration_fires_admin_and_producer_notifications(
        self, client, monkeypatch
    ):
        """MEH-977 class — fire-and-forget must be observable. Captures
        that BOTH notifications are scheduled with expected recipients."""
        import app.routers.auth as auth_mod

        admin_notify = MagicMock()
        producer_notify = MagicMock()
        monkeypatch.setattr(auth_mod, "notify_admin_new_producer", admin_notify)
        monkeypatch.setattr(auth_mod, "notify_producer_registered", producer_notify)

        payload = valid_producer_register_payload() | {
            "email": f"reg{uuid4().hex[:8]}@example.com",
            "phone": "0501234567",
        }
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code in (200, 201)

        # TestClient runs BackgroundTasks synchronously after the response.
        admin_notify.assert_called_once()
        producer_notify.assert_called_once()
        # notify_admin_new_producer(name, city)
        assert admin_notify.call_args.args[0] == payload["producer_name"]
        # notify_producer_registered(name, phone)
        assert producer_notify.call_args.args[0] == payload["producer_name"]

    def test_registered_producer_hidden_until_admin_approves(self, client, db):
        payload = valid_producer_register_payload() | {
            "email": f"reg{uuid4().hex[:8]}@example.com",
            # primary_contact_method="whatsapp" requires a phone for a
            # real (non-guard-test) registration to succeed.
            "phone": "0501234567",
        }
        resp = client.post("/auth/register/producer", json=payload)
        assert resp.status_code in (200, 201), resp.text

        producer = (
            db.query(Producer).filter_by(name=payload["producer_name"]).one()
        )
        assert producer.status in ("pending", "pending_whatsapp")

        # Hop — pending producer NOT in public list
        names = [p["name"] for p in client.get("/producers").json()]
        assert payload["producer_name"] not in names

        # Admin approves (MEH-799 gate: needs >=1 image first)
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")
        producer.images = ["https://res.cloudinary.com/demo/image/upload/p.jpg"]
        db.commit()
        ok = client.post(
            f"/admin/producers/{producer.id}/approve", headers=auth_header(admin)
        )
        assert ok.status_code == 200, ok.text

        # Hop — now publicly visible
        names = [p["name"] for p in client.get("/producers").json()]
        assert payload["producer_name"] in names


# ============================================================
# Journey 3 — producer creates GROUP BUY → public → user joins →
# participant count updates
# ============================================================


class TestJourney3GroupBuy:
    def test_group_buy_create_join_count(self, client, db):
        _, owner = _make_producer_user(db)
        consumer = make_user(db, email=f"c{uuid4().hex[:6]}@t.com")

        created = client.post(
            "/group-buys", json=_group_buy_payload(), headers=auth_header(owner)
        )
        assert created.status_code == 201
        gb_id = created.json()["id"]

        # Hop — public list (default status=open) shows it, count 0
        pub = [g for g in client.get("/group-buys").json() if g["id"] == gb_id]
        assert pub and pub[0]["commits_count"] == 0

        # Hop — consumer joins
        joined = client.post(
            f"/group-buys/{gb_id}/commit",
            json={"quantity": 2},
            headers=auth_header(consumer),
        )
        assert joined.status_code == 201

        # Hop — participant count updated on the public detail
        detail = client.get(
            f"/group-buys/{gb_id}", headers=auth_header(consumer)
        ).json()
        assert detail["commits_count"] == 1
        assert detail["user_committed"] is True

        # Anonymous still sees the count, without the personal flag
        anon = client.get(f"/group-buys/{gb_id}").json()
        assert anon["commits_count"] == 1
        assert anon["user_committed"] is False


# ============================================================
# Journey 4 — producer creates EVENT with image → public page
# ============================================================


class TestJourney4Event:
    def test_event_create_to_public_detail(self, client, db):
        _, owner = _make_producer_user(db)

        created = client.post(
            "/events", json=_event_payload(), headers=auth_header(owner)
        )
        assert created.status_code == 201, created.text
        event_id = created.json()["id"]
        assert created.json()["image_url"] == _event_payload()["image_url"]

        # Hop — public list + detail carry the event with its image
        assert event_id in [e["id"] for e in client.get("/events").json()]
        detail = client.get(f"/events/{event_id}")
        assert detail.status_code == 200
        assert detail.json()["image_url"] == _event_payload()["image_url"]


# ============================================================
# Journey 5 — user favorites a producer → /favorites shows it →
# unfavorite removes it
# ============================================================


class TestJourney5Favorites:
    def test_favorite_list_unfavorite(self, client, db):
        producer = make_producer(db, name=f"מועדפת {uuid4().hex[:6]}")
        user = make_user(db, email=f"f{uuid4().hex[:6]}@t.com")

        added = client.post(
            f"/users/me/favorites/{producer.id}", headers=auth_header(user)
        )
        assert added.status_code == 201

        favs = client.get("/users/me/favorites", headers=auth_header(user)).json()
        assert producer.name in [f["producer"]["name"] for f in favs]

        removed = client.delete(
            f"/users/me/favorites/{producer.id}", headers=auth_header(user)
        )
        assert removed.status_code == 200

        favs = client.get("/users/me/favorites", headers=auth_header(user)).json()
        assert favs == []


# ============================================================
# Journey 6 — user submits REVIEW → producer page shows it
# (WhatsApp-click gate + fail-open moderation are part of the hop)
# ============================================================


class TestJourney6Review:
    def test_review_submit_to_public_list(self, client, db):
        producer = make_producer(db, name=f"ביקורות {uuid4().hex[:6]}")
        user = make_user(db, email=f"r{uuid4().hex[:6]}@t.com")

        body = {"stars": 5, "body": "מוצר נהדר, ממליצה בחום לכולן!"}

        # Gate — first-time reviewer without a WhatsApp click is 403
        blocked = client.post(
            f"/producers/{producer.id}/reviews", json=body,
            headers=auth_header(user),
        )
        assert blocked.status_code == 403

        # Satisfy the gate the way the product does (WA button click row)
        db.add(ProducerWhatsAppClick(producer_id=producer.id, user_id=user.id))
        db.commit()

        # Moderation is fail-open with no ANTHROPIC_API_KEY → auto-publish
        posted = client.post(
            f"/producers/{producer.id}/reviews", json=body,
            headers=auth_header(user),
        )
        assert posted.status_code in (200, 201), posted.text

        # Hop — public reviews page (ReviewsPage shape) shows it
        page = client.get(f"/producers/{producer.id}/reviews").json()
        assert page["total"] == 1
        assert body["body"] in [r["body"] for r in page["reviews"]]


# ============================================================
# Journey 7 — signup/login → session survives (refresh token) →
# logout invalidates
# ============================================================


class TestJourney7AuthSession:
    @staticmethod
    def _cookie_value(response, name: str) -> str | None:
        """Both auth cookies are `Secure`, so TestClient's http://testserver
        jar drops them — extract from Set-Cookie explicitly.
        REUSES: tests/test_api.py TestFingerprintCookie._fp_value."""
        for header in response.headers.get_list("set-cookie"):
            if header.startswith(f"{name}="):
                return header.split("=", 1)[1].split(";")[0].strip()
        return None

    def test_login_me_refresh_logout(self, client, db):
        password = "Zx7Yp9Mq2Lr4"
        user = make_user(db, email=f"s{uuid4().hex[:6]}@t.com", password=password)

        login = client.post(
            "/auth/login", json={"email": user.email, "password": password}
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        fp = self._cookie_value(login, "__Secure-Fgp")
        refresh_cookie = self._cookie_value(login, "refresh_token")
        assert fp and refresh_cookie

        me = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            cookies={"__Secure-Fgp": fp},
        )
        assert me.status_code == 200
        assert me.json()["email"] == user.email

        # Refresh-token cookie set at login → silent refresh works
        # (this is the "session survives page reload" backend hop; the
        # browser twin lives in the Playwright suite).
        refreshed = client.post(
            "/auth/refresh",
            cookies={"refresh_token": refresh_cookie, "__Secure-Fgp": fp},
        )
        assert refreshed.status_code == 200
        new_token = refreshed.json()["access_token"]
        new_fp = self._cookie_value(refreshed, "__Secure-Fgp") or fp
        assert new_token

        me2 = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {new_token}"},
            cookies={"__Secure-Fgp": new_fp},
        )
        assert me2.status_code == 200

        # Logout clears the refresh cookie → a browser without the cookie
        # can no longer silently refresh (401).
        out = client.post(
            "/auth/logout",
            headers={"Authorization": f"Bearer {new_token}"},
            cookies={"__Secure-Fgp": new_fp},
        )
        assert out.status_code in (200, 204)
        assert client.post("/auth/refresh").status_code == 401

    def test_consumer_register_returns_anti_enumeration_ack(self, client, db):
        payload = {
            "email": f"n{uuid4().hex[:8]}@example.com",
            "name": "משתמשת חדשה",
            "password": "Zx7Yp9Mq2Lr4",
        }
        resp = client.post("/auth/register", json=payload)
        assert resp.status_code in (200, 201)
        # Anti-enumeration ack: no token in the response body
        assert "access_token" not in resp.json()
        assert db.query(User).filter_by(email=payload["email"]).count() == 1


# ============================================================
# Journey 8 — user creates EXPERIENCE → (mocked fail-open Claude
# pre-check) → admin queue → approve → public /experiences
# ============================================================


class TestJourney8Experience:
    def test_experience_create_to_public(self, client, db, monkeypatch):
        _mock_experience_moderation(monkeypatch)
        host = make_user(db, email=f"h{uuid4().hex[:6]}@t.com")
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")

        created = client.post(
            "/experiences", json=_experience_payload(), headers=auth_header(host)
        )
        assert created.status_code in (200, 201), created.text
        ex_id = created.json()["id"]

        # Hop — pending, hidden from the public list
        assert ex_id not in [e["id"] for e in client.get("/experiences").json()]

        # Hop — admin queue shows it
        queue = client.get(
            "/admin/experiences", params={"status": "pending"},
            headers=auth_header(admin),
        )
        assert ex_id in [e["id"] for e in queue.json()]

        # Hop — approve → public
        ok = client.post(
            f"/admin/experiences/{ex_id}/approve", headers=auth_header(admin)
        )
        assert ok.status_code == 200
        assert ex_id in [e["id"] for e in client.get("/experiences").json()]


# ============================================================
# Journey 9 — /map data hop: approved producers with coordinates
# ============================================================


class TestJourney9MapData:
    def test_producers_list_serves_map_coordinates(self, client, db):
        approved = make_producer(db, name=f"מפה {uuid4().hex[:6]}")
        pending = make_producer(
            db, name=f"נסתרת {uuid4().hex[:6]}", status="pending"
        )

        rows = client.get("/producers").json()
        by_name = {p["name"]: p for p in rows}
        assert approved.name in by_name
        assert pending.name not in by_name
        assert by_name[approved.name]["lat"] == approved.lat
        assert by_name[approved.name]["lng"] == approved.lng


# ============================================================
# Journey 10 — AUTHORIZATION MATRIX (OWASP negative tests).
# Asserts CURRENT enforced behavior per role×action. Any BREAK
# found here is HIGH-RISK → report-only, never "fixed" silently.
# ============================================================


class TestJourney10AuthorizationMatrix:
    # ---- anonymous ----

    def test_anonymous_blocked_admin_and_producer_apis(self, client):
        assert client.get("/admin/dashboard").status_code == 401
        assert client.get("/admin/recipes").status_code == 401
        assert client.get("/admin/recipes/pending").status_code == 401
        assert client.post(
            "/producers/me/recipes", json=_recipe_payload()
        ).status_code == 401
        assert client.get("/producers/me/recipes").status_code == 401
        assert client.get("/users/me/favorites").status_code == 401
        assert client.post(
            "/group-buys", json=_group_buy_payload()
        ).status_code in (401, 403)
        assert client.post("/events", json=_event_payload()).status_code == 401

    # ---- consumer ----

    def test_consumer_blocked_from_producer_writes(self, client, db, monkeypatch):
        _mock_recipe_moderation(monkeypatch)
        consumer = make_user(db, email=f"c{uuid4().hex[:6]}@t.com")
        h = auth_header(consumer)
        assert client.post(
            "/producers/me/recipes", json=_recipe_payload(), headers=h
        ).status_code == 403
        assert client.post(
            "/group-buys", json=_group_buy_payload(), headers=h
        ).status_code == 403
        assert client.post(
            "/events", json=_event_payload(), headers=h
        ).status_code == 403

    def test_consumer_blocked_from_admin_apis(self, client, db):
        consumer = make_user(db, email=f"c{uuid4().hex[:6]}@t.com")
        h = auth_header(consumer)
        assert client.get("/admin/dashboard", headers=h).status_code == 403
        assert client.get("/admin/recipes", headers=h).status_code == 403
        assert client.post(
            f"/admin/recipes/{uuid4()}/approve", headers=h
        ).status_code == 403

    # ---- producer (non-admin) ----

    def test_producer_blocked_from_admin_apis(self, client, db):
        _, owner = _make_producer_user(db)
        h = auth_header(owner)
        assert client.get("/admin/dashboard", headers=h).status_code == 403
        assert client.get("/admin/recipes", headers=h).status_code == 403
        assert client.post(
            f"/admin/recipes/{uuid4()}/approve", headers=h
        ).status_code == 403
        assert client.post(
            f"/admin/experiences/{uuid4()}/approve", headers=h
        ).status_code == 403

    # ---- producer A vs producer B (existence-leak convention) ----

    def test_cross_producer_recipe_access_is_404(self, client, db, monkeypatch):
        """producer_recipes.py convention: 404, not 403 — a foreign
        producer must not learn the recipe exists."""
        _mock_recipe_moderation(monkeypatch)
        _, owner_a = _make_producer_user(db)
        _, owner_b = _make_producer_user(db)

        created = client.post(
            "/producers/me/recipes",
            json=_recipe_payload(),
            headers=auth_header(owner_a),
        )
        recipe_id = created.json()["id"]
        h_b = auth_header(owner_b)

        assert client.get(
            f"/producers/me/recipes/{recipe_id}", headers=h_b
        ).status_code == 404
        assert client.patch(
            f"/producers/me/recipes/{recipe_id}",
            json={"servings": 2},
            headers=h_b,
        ).status_code == 404
        assert client.delete(
            f"/producers/me/recipes/{recipe_id}", headers=h_b
        ).status_code == 404
        # And the recipe is untouched
        assert db.query(ProducerRecipe).filter_by(id=recipe_id).count() == 1

    def test_cross_producer_event_update_returns_404(self, client, db):
        """MEH-1001 — cross-producer update/delete returns 404, aligned to the
        recipes anti-existence-leak convention (producer_recipes.py:206): a
        foreign producer must not be able to confirm an event id exists."""
        _, owner_a = _make_producer_user(db)
        _, owner_b = _make_producer_user(db)

        created = client.post(
            "/events", json=_event_payload(), headers=auth_header(owner_a)
        )
        event_id = created.json()["id"]
        h_b = auth_header(owner_b)

        assert client.put(
            f"/events/{event_id}", json={"title": "פריצה"}, headers=h_b
        ).status_code == 404
        assert client.delete(f"/events/{event_id}", headers=h_b).status_code == 404

    # ---- admin override ----

    def test_admin_can_moderate_foreign_recipe(self, client, db, monkeypatch):
        _mock_recipe_moderation(monkeypatch)
        _, owner = _make_producer_user(db)
        admin = make_user(db, role="admin", email=f"a{uuid4().hex[:6]}@t.com")

        created = client.post(
            "/producers/me/recipes",
            json=_recipe_payload(),
            headers=auth_header(owner),
        )
        recipe_id = created.json()["id"]

        # request-changes requires feedback (400 without)
        assert client.post(
            f"/admin/recipes/{recipe_id}/request-changes",
            json={},
            headers=auth_header(admin),
        ).status_code == 400
        ok = client.post(
            f"/admin/recipes/{recipe_id}/request-changes",
            json={"feedback": "נא להוסיף כמויות מדויקות"},
            headers=auth_header(admin),
        )
        assert ok.status_code == 200
        db.expire_all()
        row = db.query(ProducerRecipe).filter_by(id=recipe_id).one()
        assert row.moderation_status == "needs_revision"
        assert row.published is False
