"""MEH-2852 — IndexNow: Bing hears about a public URL change within seconds.

Two layers:

  1. The service (`app.services.indexnow`): one POST in production with the
     exact IndexNow body; nothing anywhere else; a timeout / 500 never raises;
     dedupe + the 10,000-URL cap; URL shapes identical to sitemap.js.
  2. The wiring: each write point that makes a public page appear, change or
     disappear queues a ping AFTER its commit. Asserted end to end through the
     route — TestClient runs BackgroundTasks before it returns, so the recorded
     POST is the one production would send.

Monkeypatch boundary: `httpx.post` as the service sees it (module attribute),
and `settings.railway_environment` — the same Settings field the OTP test-mode
gate reads (config.py `railway_environment`). Nothing here touches the network.
"""

from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.config import settings
from app.models import Experience, ProducerRecipe
from app.models.models import Event, GroupBuy
from app.services import indexnow
from app.utils.clock import israel_today, utc_now
from conftest import auth_header, make_producer, make_user

REPO_ROOT = Path(__file__).resolve().parents[1]
SITEMAP_JS = REPO_ROOT / "frontend" / "app" / "sitemap.js"
SITE = "https://mehamakor.co.il"
TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/x.jpg"


class _Resp:
    def __init__(self, status_code=200):
        self.status_code = status_code


@pytest.fixture
def posts(monkeypatch):
    """Record every POST the service makes; production by default."""
    calls = []

    def fake_post(url, *, json=None, timeout=None, **kwargs):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return _Resp(200)

    monkeypatch.setattr(indexnow.httpx, "post", fake_post)
    monkeypatch.setattr(settings, "railway_environment", "production")
    return calls


def _urls(posts):
    return [u for call in posts for u in call["json"]["urlList"]]


def _both(path):
    return [f"{SITE}{path}", f"{SITE}/en{path}"]


def _admin(db):
    return auth_header(
        make_user(db, role="admin", email=f"adm-{uuid4().hex[:6]}@example.com")
    )


def _owner(db, *, status="approved", **producer_kwargs):
    producer = make_producer(db, status=status, **producer_kwargs)
    user = make_user(db, role="producer", email=f"own-{uuid4().hex[:6]}@example.com")
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


# ─────────────────────────── 1. the service ────────────────────────────────


class TestNotify:
    def test_production_sends_one_post_with_the_indexnow_body(self, posts):
        urls = _both("/events/abc")
        indexnow.notify(urls)

        assert len(posts) == 1
        call = posts[0]
        assert call["url"] == "https://api.indexnow.org/indexnow"
        assert call["timeout"] == 5
        assert call["json"] == {
            "host": "mehamakor.co.il",
            "key": indexnow.INDEXNOW_KEY,
            "keyLocation": f"https://mehamakor.co.il/{indexnow.INDEXNOW_KEY}.txt",
            "urlList": urls,
        }

    @pytest.mark.parametrize("env", ["staging", "", "development"])
    def test_anything_but_production_never_posts(self, posts, monkeypatch, env):
        monkeypatch.setattr(settings, "railway_environment", env)
        indexnow.notify(_both("/events/abc"))
        assert posts == []

    def test_empty_list_never_posts(self, posts):
        indexnow.notify([])
        assert posts == []

    def test_duplicates_are_sent_once_in_first_seen_order(self, posts):
        a, b = _both("/x")
        indexnow.notify([a, b, a, b, a])
        assert posts[0]["json"]["urlList"] == [a, b]

    def test_more_than_10000_urls_split_into_capped_calls(self, posts):
        urls = [f"{SITE}/events/{i}" for i in range(10_001)]
        indexnow.notify(urls)
        assert [len(c["json"]["urlList"]) for c in posts] == [10_000, 1]
        assert _urls(posts) == urls

    @pytest.mark.parametrize(
        "boom",
        [httpx.TimeoutException("slow"), httpx.ConnectError("down"), RuntimeError("x")],
    )
    def test_a_transport_failure_never_raises(self, posts, monkeypatch, boom):
        def failing_post(*a, **k):
            raise boom

        monkeypatch.setattr(indexnow.httpx, "post", failing_post)
        assert indexnow.notify(_both("/events/abc")) is None

    def test_a_500_never_raises(self, posts, monkeypatch):
        monkeypatch.setattr(indexnow.httpx, "post", lambda *a, **k: _Resp(500))
        assert indexnow.notify(_both("/events/abc")) is None

    def test_a_failing_ping_does_not_break_the_request(
        self, client, db, monkeypatch, posts
    ):
        attempts = []

        def failing_post(*a, **k):
            attempts.append(1)
            raise httpx.TimeoutException("slow")

        monkeypatch.setattr(indexnow.httpx, "post", failing_post)
        producer = make_producer(db, status="approved")
        resp = client.post(
            f"/admin/producers/{producer.id}/toggle-status", headers=_admin(db)
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "inactive"
        # The ping really ran (and failed) inside this request — otherwise a
        # 200 here would say nothing about failure handling.
        assert attempts == [1]


class TestUrlShapesMatchSitemap:
    """Each builder against the literal sitemap.js emits (he + /en)."""

    def test_producer_with_slug(self, db):
        p = make_producer(db)
        p.slug = "meshek-hadas"
        assert indexnow.producer_urls(p) == _both("/meshek-hadas")

    def test_producer_without_slug_falls_back_to_id(self, db):
        p = make_producer(db)
        assert indexnow.producer_urls(p) == _both(f"/producer/{p.id}")

    def test_organizer_lives_under_organizers(self, db):
        p = make_producer(db)
        p.kind, p.slug = "organizer", "shuk-hanamal"
        assert indexnow.producer_urls(p) == _both("/organizers/shuk-hanamal")

    def test_slugless_organizer_has_no_page(self, db):
        p = make_producer(db)
        p.kind = "organizer"
        assert indexnow.producer_urls(p) == []

    def test_event_experience_group_buy(self):
        i = uuid4()
        assert indexnow.event_urls(i) == _both(f"/events/{i}")
        assert indexnow.experience_urls(i) == _both(f"/experiences/{i}")
        assert indexnow.group_buy_urls(i) == _both(f"/group-buys/{i}")

    def test_recipe_is_under_the_producer_slug(self, db):
        p = make_producer(db)
        p.slug = "maafiya"
        rid = uuid4()
        assert indexnow.recipe_urls(p, rid) == _both(f"/maafiya/recipes/{rid}")

    def test_recipe_of_a_slugless_producer_has_no_page(self, db):
        # sitemap.js only fans recipes out over `slugged` producers.
        p = make_producer(db)
        assert indexnow.recipe_urls(p, uuid4()) == []

    def test_sitemap_still_builds_the_shapes_mirrored_here(self):
        """Anchored to the real file: if sitemap.js changes a path shape, this
        reds and the builders above must follow it."""
        src = SITEMAP_JS.read_text(encoding="utf-8")
        for template in (
            "p.slug ? `/${p.slug}` : `/producer/${p.id}`",
            "`/${p.slug}/recipes/${recipe.id}`",
            "`/events/${e.id}`",
            "`/organizers/${o.slug}`",
            "`/experiences/${x.id}`",
            "`/group-buys/${g.id}`",
            "locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`",
        ):
            assert template in src, template

    def test_key_file_is_served_from_public_with_exactly_the_key(self):
        key = indexnow.INDEXNOW_KEY
        assert len(key) == 32 and int(key, 16) >= 0
        key_file = REPO_ROOT / "frontend" / "public" / f"{key}.txt"
        assert key_file.read_text(encoding="utf-8") == key


# ─────────────────────────── 2. the wiring ─────────────────────────────────


class TestProducerWritePoints:
    def test_approve_pings_the_new_page(self, client, db, monkeypatch, posts):
        import app.routers.admin as admin_module

        monkeypatch.setattr(
            admin_module, "notify_producer_approved", lambda *a, **k: None
        )
        p = make_producer(
            db, status="pending", images=[TEST_IMAGE], phone_verified=True
        )
        resp = client.post(f"/admin/producers/{p.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        db.refresh(p)
        assert _urls(posts) == indexnow.producer_urls(p)
        assert p.slug and _urls(posts) == _both(f"/{p.slug}")

    def test_admin_create_pings_the_auto_approved_page(self, client, db, posts):
        resp = client.post(
            "/admin/producers",
            json={"name": "משק אינדקס", "city": "חיפה", "slug": "meshek-index"},
            headers=_admin(db),
        )
        assert resp.status_code == 201, resp.text
        assert _urls(posts) == _both("/meshek-index")

    def test_admin_create_draft_does_not_ping(self, client, db, posts):
        resp = client.post(
            "/admin/producers",
            json={"name": "טיוטת אינדקס", "city": "חיפה", "as_draft": True},
            headers=_admin(db),
        )
        assert resp.status_code == 201, resp.text
        assert posts == []

    def test_admin_edit_pings_old_and_new_url_on_slug_change(self, client, db, posts):
        p = make_producer(db, status="approved")
        resp = client.put(
            f"/admin/producers/{p.id}", json={"slug": "shem-hadash"}, headers=_admin(db)
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/producer/{p.id}") + _both("/shem-hadash")

    def test_admin_edit_of_a_pending_business_does_not_ping(self, client, db, posts):
        p = make_producer(db, status="pending")
        resp = client.put(
            f"/admin/producers/{p.id}", json={"description": "חדש"}, headers=_admin(db)
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    @pytest.mark.parametrize("start", ["approved", "inactive"])
    def test_toggle_hide_and_unhide_both_ping(self, client, db, posts, start):
        # MEH-2945: un-pausing runs the approval gates, so the row passes them.
        p = make_producer(db, status=start, images=[TEST_IMAGE], phone_verified=True)
        resp = client.post(f"/admin/producers/{p.id}/toggle-status", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/producer/{p.id}")

    def test_rejecting_a_live_business_pings_its_removal(self, client, db, posts):
        p = make_producer(db, status="approved")
        resp = client.post(
            f"/admin/producers/{p.id}/reject",
            json={"reason": "לא עומד בתנאים"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/producer/{p.id}")

    def test_rejecting_a_pending_business_does_not_ping(self, client, db, posts):
        p = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{p.id}/reject",
            json={"reason": "לא עומד בתנאים"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_deleting_a_live_business_pings_its_removal(self, client, db, posts):
        p = make_producer(db, status="approved")
        p.slug = "neelam"
        db.commit()
        resp = client.delete(f"/admin/producers/{p.id}", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both("/neelam")

    def test_owner_profile_update_pings(self, client, db, posts):
        p, user = _owner(db)
        resp = client.put(
            "/producers/me",
            json={"short_description": "לחם מחמצת טרי"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/producer/{p.id}")

    def test_owner_update_of_a_pending_business_does_not_ping(self, client, db, posts):
        _, user = _owner(db, status="pending")
        resp = client.put(
            "/producers/me",
            json={"short_description": "לחם מחמצת טרי"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []


def _event_payload(**overrides):
    payload = {
        "title": "יום פתוח במאפייה",
        "event_date": date(2099, 1, 1).isoformat(),
        "category": "שוק",
        "city": "תל אביב",
    }
    payload.update(overrides)
    return payload


class TestEventWritePoints:
    def test_create_update_delete_each_ping(self, client, db, posts):
        _, user = _owner(db)
        resp = client.post("/events", json=_event_payload(), headers=auth_header(user))
        assert resp.status_code == 201, resp.text
        event_id = resp.json()["id"]
        assert _urls(posts) == _both(f"/events/{event_id}")

        resp = client.put(
            f"/events/{event_id}", json={"is_active": False}, headers=auth_header(user)
        )
        assert resp.status_code == 200, resp.text
        assert len(posts) == 2 and posts[1]["json"]["urlList"] == _both(
            f"/events/{event_id}"
        )

        resp = client.delete(f"/events/{event_id}", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        assert len(posts) == 3 and posts[2]["json"]["urlList"] == _both(
            f"/events/{event_id}"
        )

    def test_event_of_a_pending_business_does_not_ping(self, client, db, posts):
        producer, user = _owner(db, status="pending")
        event = Event(
            producer_id=producer.id,
            title="אירוע",
            event_date=date(2099, 1, 1),
            category="שוק",
            city="תל אביב",
            is_active=True,
        )
        db.add(event)
        db.commit()
        resp = client.put(
            f"/events/{event.id}",
            json={"title": "אירוע מעודכן"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []


def _experience(db, host, **overrides):
    data = {
        "title": "סדנת לחם",
        "description": "תיאור ארוך מספיק כדי לעבור את האימות, לפחות עשרים תווים.",
        "image_url": TEST_IMAGE,
        "category": "בישול",
        "host_user_id": host.id,
        "event_date": israel_today() + timedelta(days=7),
        "location_type": "home",
        "city": "תל אביב",
        "max_participants": 10,
        "status": "pending",
        "moderation_status": "APPROVED",
    }
    data.update(overrides)
    ex = Experience(**data)
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


class TestExperienceWritePoints:
    def test_approve_pings(self, client, db, posts):
        _, host = _owner(db)
        ex = _experience(db, host)
        resp = client.post(f"/admin/experiences/{ex.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/experiences/{ex.id}")

    @pytest.mark.parametrize("action", ["reject", "request-changes"])
    def test_taking_a_live_experience_down_pings(self, client, db, posts, action):
        _, host = _owner(db)
        ex = _experience(db, host, status="approved")
        resp = client.post(
            f"/admin/experiences/{ex.id}/{action}",
            json={"feedback": "נא לעדכן"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/experiences/{ex.id}")

    def test_rejecting_a_never_public_experience_does_not_ping(self, client, db, posts):
        _, host = _owner(db)
        ex = _experience(db, host, status="pending")
        resp = client.post(
            f"/admin/experiences/{ex.id}/reject",
            json={"feedback": "לא מתאים"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_approving_for_a_pending_business_does_not_ping(self, client, db, posts):
        _, host = _owner(db, status="pending")
        ex = _experience(db, host)
        resp = client.post(f"/admin/experiences/{ex.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert posts == []


def _group_buy(db, producer, status="open"):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח",
        product_name="קמח",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=2,
        deadline=utc_now() + timedelta(days=7),
        city="תל אביב",
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


class TestGroupBuyWritePoints:
    def test_create_pings(self, client, db, posts):
        _, user = _owner(db)
        payload = {
            "title": "רכש שמן זית",
            "product_name": "שמן זית",
            "unit": "ליטר",
            "price_per_unit_regular": 80,
            "price_per_unit_group": 60,
            "min_participants": 3,
            "deadline": (utc_now() + timedelta(days=10)).isoformat(),
            "city": "חיפה",
            "fulfillment_note": "איסוף מהמשק ביום שישי",
        }
        resp = client.post("/group-buys", json=payload, headers=auth_header(user))
        assert resp.status_code == 201, resp.text
        assert _urls(posts) == _both(f"/group-buys/{resp.json()['id']}")

    def test_owner_cancel_pings(self, client, db, posts):
        producer, user = _owner(db)
        gb = _group_buy(db, producer)
        resp = client.patch(
            f"/group-buys/{gb.id}/status",
            json={"status": "cancelled"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/group-buys/{gb.id}")

    def test_admin_status_change_pings(self, client, db, posts):
        producer, _ = _owner(db)
        gb = _group_buy(db, producer)
        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "cancelled"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/group-buys/{gb.id}")


def _recipe(db, producer, **overrides):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="עוגת גבינה",
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status=overrides.get("moderation_status", "pending"),
        published=overrides.get("published", False),
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


class TestRecipeWritePoints:
    def _producer(self, db):
        p = make_producer(db, status="approved")
        p.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        return p

    def test_approve_pings(self, client, db, posts):
        p = self._producer(db)
        r = _recipe(db, p)
        resp = client.post(f"/admin/recipes/{r.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/{p.slug}/recipes/{r.id}")

    @pytest.mark.parametrize("action", ["reject", "request-changes"])
    def test_unpublishing_pings(self, client, db, posts, action):
        p = self._producer(db)
        r = _recipe(db, p, moderation_status="approved", published=True)
        resp = client.post(
            f"/admin/recipes/{r.id}/{action}",
            json={"feedback": "נא לעדכן"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/{p.slug}/recipes/{r.id}")

    def test_rejecting_an_unpublished_recipe_does_not_ping(self, client, db, posts):
        p = self._producer(db)
        r = _recipe(db, p)
        resp = client.post(
            f"/admin/recipes/{r.id}/reject", json={"feedback": "x"}, headers=_admin(db)
        )
        assert resp.status_code == 200, resp.text
        assert posts == []


# ── organizers and ordering (fresh-review follow-up) ─────────────────────────
#
# Experiences, recipes and group buys are public only from a live business
# (producer_listing.is_business: approved AND kind 'producer'). An approved
# organizer's are never listed, so a ping would announce a 404.


def _as_organizer(db, producer):
    producer.kind = "organizer"
    producer.slug = producer.slug or f"org-{uuid4().hex[:6]}"
    db.commit()
    db.refresh(producer)
    return producer


class TestOrganizerContentIsNotPinged:
    def test_approving_an_organizers_experience_does_not_ping(self, client, db, posts):
        producer, host = _owner(db)
        _as_organizer(db, producer)
        ex = _experience(db, host)
        resp = client.post(f"/admin/experiences/{ex.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_approving_an_organizers_recipe_does_not_ping(self, client, db, posts):
        producer = _as_organizer(db, make_producer(db, status="approved"))
        r = _recipe(db, producer)
        resp = client.post(f"/admin/recipes/{r.id}/approve", headers=_admin(db))
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_an_organizers_group_buy_status_change_does_not_ping(
        self, client, db, posts
    ):
        producer = _as_organizer(db, make_producer(db, status="approved"))
        gb = _group_buy(db, producer)
        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "cancelled"},
            headers=_admin(db),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []


class TestPingRunsAfterTheOwnerEmail:
    """Background tasks run one after another: a ping queued first (5s
    timeout) would hold the owner's email. Both are recorded on one timeline."""

    @pytest.mark.parametrize(
        ("action", "mailer", "published"),
        [
            ("approve", "notify_recipe_approved", False),
            ("request-changes", "notify_recipe_changes_requested", True),
            ("reject", "notify_recipe_rejected", True),
        ],
    )
    def test_recipe_moderation_mails_before_it_pings(
        self, client, db, monkeypatch, action, mailer, published
    ):
        from app.routers import admin_recipes

        timeline = []
        monkeypatch.setattr(settings, "railway_environment", "production")
        monkeypatch.setattr(
            indexnow.httpx,
            "post",
            lambda *a, **k: timeline.append("ping") or _Resp(200),
        )
        monkeypatch.setattr(
            admin_recipes, mailer, lambda *a, **k: timeline.append("email")
        )
        producer, _ = _owner(db)
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        r = _recipe(
            db,
            producer,
            moderation_status="approved" if published else "pending",
            published=published,
        )
        body = None if action == "approve" else {"feedback": "נא לעדכן"}
        resp = client.post(
            f"/admin/recipes/{r.id}/{action}", json=body, headers=_admin(db)
        )
        assert resp.status_code == 200, resp.text
        assert "email" in timeline, "control: the owner email was queued"
        assert "ping" in timeline, "control: the page was pinged"
        assert timeline.index("ping") > timeline.index("email")


# ── PR2: the owner's own edit / cancel / delete (Sapir 09/11) ────────────────
#
# experiences.py (host) and producer_recipes.py (owner). The rule is the same as
# the admin paths: a page that is public before OR after the write is
# announced; a draft, a pending edit and an organizer's content never are.


class TestOwnerExperienceWritePoints:
    def _live(self, db, **overrides):
        _, host = _owner(db)
        ex = _experience(db, host, status="approved", **overrides)
        return ex, auth_header(host)

    def test_content_edit_of_a_live_experience_pings_its_removal(
        self, client, db, posts
    ):
        ex, headers = self._live(db)
        resp = client.put(
            f"/experiences/{ex.id}", json={"title": "סדנת לחם מחמצת"}, headers=headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "pending", "control: the edit took it down"
        assert _urls(posts) == _both(f"/experiences/{ex.id}")

    @pytest.mark.parametrize("is_active", [False, True])
    def test_host_cancel_and_reactivate_ping(self, client, db, posts, is_active):
        ex, headers = self._live(db, is_active=not is_active)
        resp = client.put(
            f"/experiences/{ex.id}", json={"is_active": is_active}, headers=headers
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "approved", "control: still public"
        assert _urls(posts) == _both(f"/experiences/{ex.id}")

    def test_editing_a_pending_experience_does_not_ping(self, client, db, posts):
        _, host = _owner(db)
        ex = _experience(db, host, status="pending")
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"title": "סדנת לחם מחמצת"},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_deleting_a_live_experience_pings_its_removal(self, client, db, posts):
        ex, headers = self._live(db)
        ex_id = ex.id
        resp = client.delete(f"/experiences/{ex_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/experiences/{ex_id}")

    def test_deleting_a_pending_experience_does_not_ping(self, client, db, posts):
        _, host = _owner(db)
        ex = _experience(db, host, status="pending")
        resp = client.delete(f"/experiences/{ex.id}", headers=auth_header(host))
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_an_organizers_experience_edit_does_not_ping(self, client, db, posts):
        producer, host = _owner(db)
        _as_organizer(db, producer)
        ex = _experience(db, host, status="approved")
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []


class TestOwnerRecipeWritePoints:
    def _owner_with_slug(self, db):
        producer, user = _owner(db)
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        return producer, auth_header(user)

    def _patch(self, client, recipe, headers, body):
        return client.patch(
            f"/producers/me/recipes/{recipe.id}", json=body, headers=headers
        )

    def test_content_edit_of_a_published_recipe_pings_its_removal(
        self, client, db, posts
    ):
        p, headers = self._owner_with_slug(db)
        r = _recipe(db, p, moderation_status="approved", published=True)
        resp = self._patch(client, r, headers, {"title": "עוגת גבינה אפויה"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["published"] is False, "control: the edit unpublished it"
        assert _urls(posts) == _both(f"/{p.slug}/recipes/{r.id}")

    def test_metadata_edit_of_a_published_recipe_pings(self, client, db, posts):
        p, headers = self._owner_with_slug(db)
        r = _recipe(db, p, moderation_status="approved", published=True)
        resp = self._patch(client, r, headers, {"servings": 6})
        assert resp.status_code == 200, resp.text
        assert resp.json()["published"] is True, "control: still public"
        assert _urls(posts) == _both(f"/{p.slug}/recipes/{r.id}")

    def test_editing_a_pending_recipe_does_not_ping(self, client, db, posts):
        p, headers = self._owner_with_slug(db)
        r = _recipe(db, p)
        resp = self._patch(client, r, headers, {"title": "עוגת גבינה אפויה"})
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_deleting_a_published_recipe_pings_its_removal(self, client, db, posts):
        p, headers = self._owner_with_slug(db)
        r = _recipe(db, p, moderation_status="approved", published=True)
        r_id = r.id
        resp = client.delete(f"/producers/me/recipes/{r_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert _urls(posts) == _both(f"/{p.slug}/recipes/{r_id}")

    def test_deleting_a_draft_recipe_does_not_ping(self, client, db, posts):
        p, headers = self._owner_with_slug(db)
        r = _recipe(db, p)
        resp = client.delete(f"/producers/me/recipes/{r.id}", headers=headers)
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_an_organizers_recipe_edit_does_not_ping(self, client, db, posts):
        p, headers = self._owner_with_slug(db)
        _as_organizer(db, p)
        r = _recipe(db, p, moderation_status="approved", published=True)
        resp = self._patch(client, r, headers, {"servings": 6})
        assert resp.status_code == 200, resp.text
        assert posts == []


class TestOwnerWritePointsNeverAnnounceAHiddenPage:
    """Fresh-review follow-up: the business-status half of both predicates,
    the slugless business, the REJECTED edit, the stranger, and the order."""

    def test_experience_under_a_pending_business_is_not_pinged(self, client, db, posts):
        _, host = _owner(db, status="pending")
        ex = _experience(db, host, status="approved")
        resp = client.put(
            f"/experiences/{ex.id}",
            json={"is_active": False},
            headers=auth_header(host),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_recipe_under_a_pending_business_is_not_pinged(self, client, db, posts):
        producer, user = _owner(db, status="pending")
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        r = _recipe(db, producer, moderation_status="approved", published=True)
        resp = client.patch(
            f"/producers/me/recipes/{r.id}",
            json={"servings": 6},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_recipe_of_a_slugless_business_is_not_pinged(self, client, db, posts):
        producer, user = _owner(db)
        producer.slug = None
        db.commit()
        r = _recipe(db, producer, moderation_status="approved", published=True)
        resp = client.delete(f"/producers/me/recipes/{r.id}", headers=auth_header(user))
        assert resp.status_code == 200, resp.text
        assert posts == []

    def test_a_rejected_recipe_edit_changes_nothing_and_does_not_ping(
        self, client, db, posts, monkeypatch
    ):
        from app.routers import producer_recipes

        monkeypatch.setattr(
            producer_recipes,
            "validate_producer_recipe",
            lambda *_a, **_k: {"status": "REJECTED", "reason": "x"},
        )
        producer, user = _owner(db)
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        r = _recipe(db, producer, moderation_status="approved", published=True)
        resp = client.patch(
            f"/producers/me/recipes/{r.id}",
            json={"title": "עוגת גבינה אפויה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 400, resp.text
        assert posts == []

    def test_a_stranger_gets_404_and_nothing_is_pinged(self, client, db, posts):
        _, host = _owner(db)
        ex = _experience(db, host, status="approved")
        producer, owner = _owner(db)
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        r = _recipe(db, producer, moderation_status="approved", published=True)
        _, stranger = _owner(db)
        headers = auth_header(stranger)
        assert (
            client.put(
                f"/experiences/{ex.id}", json={"is_active": False}, headers=headers
            ).status_code
            == 404
        )
        assert (
            client.delete(f"/experiences/{ex.id}", headers=headers).status_code == 404
        )
        assert (
            client.patch(
                f"/producers/me/recipes/{r.id}", json={"servings": 6}, headers=headers
            ).status_code
            == 404
        )
        assert (
            client.delete(f"/producers/me/recipes/{r.id}", headers=headers).status_code
            == 404
        )
        assert posts == []

    def test_recipe_edit_mails_the_admin_before_it_pings(self, client, db, monkeypatch):
        from app.routers import producer_recipes

        timeline = []
        monkeypatch.setattr(settings, "railway_environment", "production")
        monkeypatch.setattr(
            indexnow.httpx,
            "post",
            lambda *a, **k: timeline.append("ping") or _Resp(200),
        )
        monkeypatch.setattr(
            producer_recipes,
            "notify_admin_new_recipe",
            lambda *a, **k: timeline.append("email"),
        )
        producer, user = _owner(db)
        producer.slug = f"maafiya-{uuid4().hex[:6]}"
        db.commit()
        r = _recipe(db, producer, moderation_status="approved", published=True)
        resp = client.patch(
            f"/producers/me/recipes/{r.id}",
            json={"title": "עוגת גבינה אפויה"},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        assert "email" in timeline, "control: the admin email was queued"
        assert "ping" in timeline, "control: the page was pinged"
        assert timeline.index("ping") > timeline.index("email")
