"""MEH-2952 chunk 1 (MEH-2892 §C.3): a seeded test business never reaches a
real visitor.

`producers.is_test` (revision b8cb5480552f). Every public surface hides a
test row; each test carries an ordinary approved business on the same path
as its CONTROL, so an absent / 404 / zero answer is the gate and not a
broken route or an empty fixture (testing.md: "if the element vanished, does
this go red?"). Assertions are on HTTP behaviour (ADR-032 §2.6), never on
which predicate was wired.

Writers do not exist yet (chunk 4). These tests set the column directly,
which is the only place it may be written before then
(tests/test_meh2952_is_test_guards.py).

Not here, on purpose: the business page's own resources (reviews,
google-rating, report-info, kashrut certs) follow the page, which chunk 3
reopens with `noindex`; the send layer is chunk 2; the chat tools run as
`mcp_reader`, whose column grant on producers does not include `is_test`, so
they need their own GRANT revision first (MEH-2952, before chunk 4).
"""

from datetime import timedelta

import pytest

from app.models import Experience, Favorite, FavoriteAlert, ProducerRecipe
from app.config import settings
from app.models.models import Event, GroupBuy, Product, ProducerLocation, RescueOffer
from app.routers import rescue as rescue_module
from app.routers.alerts import fire_alerts
from app.data.cities import canonical_city
from app.schemas.schemas import AlertContent
from app.services import indexnow
from app.services.producer_listing import is_business_row
from app.utils.clock import israel_today, utc_now
from conftest import auth_header, make_producer, make_user

CONTROL_NAME = "חוות הבקרה — בדיקה"
CONTROL_SLUG = "meh2952-control"
TEST_NAME = "חוות הניסוי הסמויה — בדיקה"
TEST_SLUG = "meh2952-test-row"
CITY = "תל אביב"
IMAGE = "https://res.cloudinary.com/demo/image/upload/sample.jpg"


def _pin(db, producer) -> ProducerLocation:
    """Primary branch with coordinates: the /map query reads ONLY
    producer_locations (MEH-1938 5a), so without it the test row would drop
    out of the geo query for the wrong reason."""
    loc = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city=producer.city,
        address="הרצל 1",
        lat=producer.lat,
        lng=producer.lng,
        location_precision="exact",
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


def _business(db, *, name, slug, is_test, kind="producer"):
    producer = make_producer(db, name=name, city=CITY)
    producer.slug = slug
    producer.kind = kind
    producer.is_test = is_test
    db.commit()
    db.refresh(producer)
    _pin(db, producer)
    return producer


@pytest.fixture
def pair(db):
    """(control, test row): identical in every way but `is_test`."""
    control = _business(db, name=CONTROL_NAME, slug=CONTROL_SLUG, is_test=False)
    hidden = _business(db, name=TEST_NAME, slug=TEST_SLUG, is_test=True)
    return control, hidden


def _owner(db, producer, email):
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user


def _names(items) -> set[str]:
    return {item["name"] for item in items}


def _event(db, producer, title):
    event = Event(
        producer_id=producer.id,
        title=title,
        event_date=israel_today() + timedelta(days=3),
        category="שוק",
        city=CITY,
        is_active=True,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


# ── 1 · listings, 2 · search, 3 · map ──────────────────────────────────────


class TestBusinessSurfaces:
    def test_listing(self, client, db, pair):
        resp = client.get("/producers")
        assert resp.status_code == 200
        names = _names(resp.json())
        assert CONTROL_NAME in names
        assert TEST_NAME not in names
        assert resp.headers["X-Total-Count"] == "1"

    def test_listing_q_search(self, client, db, pair):
        names = _names(client.get("/producers", params={"q": "בדיקה"}).json())
        assert CONTROL_NAME in names
        assert TEST_NAME not in names

    def test_legacy_search(self, client, db, pair):
        resp = client.get("/search", params={"q": "בדיקה"})
        assert resp.status_code == 200
        names = {p["name"] for p in resp.json()["producers"]}
        assert CONTROL_NAME in names
        assert TEST_NAME not in names

    def test_map_geo_query(self, client, db, pair):
        resp = client.get(
            "/producers", params={"lat": 32.0853, "lng": 34.7818, "radius_km": 50}
        )
        names = _names(resp.json())
        assert CONTROL_NAME in names
        assert TEST_NAME not in names


# ── 8 · counts ─────────────────────────────────────────────────────────────


class TestCounts:
    def test_producers_count(self, client, db, pair):
        assert client.get("/producers/count").json()["count"] == 1

    def test_producers_cities(self, client, db, pair):
        cities = client.get("/producers/cities").json()
        assert sum(c["count"] for c in cities) == 1

    def test_stats(self, client, db, pair):
        assert client.get("/stats").json()["producers_count"] == 1

    def test_random_404_when_only_a_test_row_exists(self, client, db):
        _business(db, name=TEST_NAME, slug=TEST_SLUG, is_test=True)
        assert client.get("/producers/random").status_code == 404

    def test_random_picks_the_control(self, client, db, pair):
        control, _ = pair
        resp = client.get("/producers/random")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(control.id)

    def test_cities_autocomplete(self, client, db):
        _business(
            db, name=CONTROL_NAME, slug=CONTROL_SLUG, is_test=False
        ).city = "כפר בקרה"
        _business(db, name=TEST_NAME, slug=TEST_SLUG, is_test=True).city = "כפר ניסוי"
        db.commit()
        cities = client.get("/cities", params={"q": "כפר"}).json()
        assert "כפר בקרה" in cities
        assert "כפר ניסוי" not in cities

    def test_search_products_and_cities(self, client, db, pair):
        control, hidden = pair
        control.city = "כפר בקרה"
        hidden.city = "כפר ניסוי"
        db.add(Product(producer_id=control.id, name="גבינת בקרה", description=""))
        db.add(Product(producer_id=hidden.id, name="גבינת ניסוי", description=""))
        db.commit()
        products = {
            p["name"]
            for p in client.get("/search", params={"q": "גבינת"}).json()["products"]
        }
        assert "גבינת בקרה" in products
        assert "גבינת ניסוי" not in products
        found = client.get("/search", params={"q": "כפר"}).json()["cities"]
        flat = {c if isinstance(c, str) else c.get("name") for c in found}
        assert "כפר בקרה" in flat
        assert "כפר ניסוי" not in flat

    def test_admin_business_counts(self, client, db, pair):
        admin = make_user(db, role="admin", email="meh2952-admin@example.com")
        h = auth_header(admin)
        dash = client.get("/admin/dashboard", headers=h)
        assert dash.status_code == 200, dash.text
        assert dash.json()["stats"]["approved_producers"] == 1
        stats = client.get("/admin/stats", headers=h)
        assert stats.status_code == 200, stats.text
        assert stats.json()["approved_producers"] == 1


# ── the page itself (reopened with noindex in chunk 3) ─────────────────────


class TestThePage:
    def test_by_slug(self, client, db, pair):
        assert client.get(f"/producers/by-slug/{CONTROL_SLUG}").status_code == 200
        assert client.get(f"/producers/by-slug/{TEST_SLUG}").status_code == 404

    def test_by_id_stranger_404_owner_and_admin_see(self, client, db, pair):
        control, hidden = pair
        assert client.get(f"/producers/{control.id}").status_code == 200
        assert client.get(f"/producers/{hidden.id}").status_code == 404
        owner = _owner(db, hidden, "meh2952-owner@example.com")
        assert (
            client.get(
                f"/producers/{hidden.id}", headers=auth_header(owner)
            ).status_code
            == 200
        )
        admin = make_user(db, role="admin", email="meh2952-admin2@example.com")
        assert (
            client.get(
                f"/producers/{hidden.id}", headers=auth_header(admin)
            ).status_code
            == 200
        )

    def test_page_view_gate_agrees_with_the_get(self, client, db, pair):
        control, hidden = pair
        # schema-valid body (regression rule 6), same as the MEH-2459 test
        ok = client.post(f"/producers/{control.id}/view", json={})
        assert ok.status_code != 404, ok.text
        assert client.post(f"/producers/{hidden.id}/view", json={}).status_code == 404

    def test_row_predicate(self, db, pair):
        control, hidden = pair
        assert is_business_row(control) is True
        assert is_business_row(hidden) is False
        assert is_business_row(hidden, include_test=True) is True


# ── 9 · lists that belong to a test business ───────────────────────────────


class TestOwnedLists:
    def test_events_feed_and_upcoming(self, client, db, pair):
        control, hidden = pair
        _event(db, control, "שוק הבקרה")
        _event(db, hidden, "שוק הניסוי")
        titles = {e["title"] for e in client.get("/events").json()}
        assert "שוק הבקרה" in titles
        assert "שוק הניסוי" not in titles
        upcoming = {e["title"] for e in client.get("/events/upcoming").json()}
        assert "שוק הבקרה" in upcoming
        assert "שוק הניסוי" not in upcoming

    def test_event_detail_404_to_strangers(self, client, db, pair):
        control, hidden = pair
        ok = _event(db, control, "שוק הבקרה")
        bad = _event(db, hidden, "שוק הניסוי")
        assert client.get(f"/events/{ok.id}").status_code == 200
        assert client.get(f"/events/{bad.id}").status_code == 404
        owner = _owner(db, hidden, "meh2952-evd-owner@example.com")
        assert (
            client.get(f"/events/{bad.id}", headers=auth_header(owner)).status_code
            == 200
        )

    def test_event_signup_refused(self, client, db, pair):
        control, hidden = pair
        body = {"name": "דנה כהן", "phone": "052-7654321", "email": "dana@example.com"}
        ids = {}
        for producer in pair:
            ev = _event(db, producer, f"שוק של {producer.slug}")
            ev.registration_method = "site_form"
            ev.max_participants = 10
            db.commit()
            ids[producer.is_test] = ev.id
        assert (
            client.post(f"/events/{ids[False]}/registrations", json=body).status_code
            == 201
        )
        assert (
            client.post(f"/events/{ids[True]}/registrations", json=body).status_code
            == 404
        )

    def test_owner_still_sees_her_own_events(self, client, db, pair):
        _, hidden = pair
        _event(db, hidden, "שוק הניסוי")
        owner = _owner(db, hidden, "meh2952-ev-owner@example.com")
        resp = client.get(
            "/events",
            params={"producer_id": str(hidden.id)},
            headers=auth_header(owner),
        )
        assert {e["title"] for e in resp.json()} == {"שוק הניסוי"}

    def test_organizer_pages(self, client, db):
        _business(
            db,
            name="מארגן הבקרה",
            slug="meh2952-org-control",
            is_test=False,
            kind="organizer",
        )
        _business(
            db,
            name="מארגן הניסוי",
            slug="meh2952-org-test",
            is_test=True,
            kind="organizer",
        )
        slugs = {o["slug"] for o in client.get("/organizers").json()}
        assert "meh2952-org-control" in slugs
        assert "meh2952-org-test" not in slugs
        assert client.get("/organizers/meh2952-org-control").status_code == 200
        assert client.get("/organizers/meh2952-org-test").status_code == 404

    def test_group_buys(self, client, db, pair):
        ids = {}
        for producer in pair:
            gb = GroupBuy(
                producer_id=producer.id,
                title=f"רכש של {producer.name}",
                product_name="קמח",
                unit="שק",
                price_per_unit_regular=120,
                price_per_unit_group=90,
                min_participants=2,
                deadline=utc_now() + timedelta(days=7),
                city=CITY,
                status="open",
            )
            db.add(gb)
            db.commit()
            ids[producer.is_test] = str(gb.id)
        listed = {g["id"] for g in client.get("/group-buys").json()}
        assert ids[False] in listed
        assert ids[True] not in listed
        assert client.get(f"/group-buys/{ids[False]}").status_code == 200
        assert client.get(f"/group-buys/{ids[True]}").status_code == 404

    def test_experiences_feed(self, client, db, pair):
        ids = {}
        for producer in pair:
            host = _owner(db, producer, f"host-{producer.slug}@example.com")
            ex = Experience(
                title=f"סדנה של {producer.name}",
                description="תיאור ארוך מספיק כדי לעבור את האימות, לפחות עשרים תווים.",
                image_url=IMAGE,
                category="בישול",
                host_user_id=host.id,
                event_date=israel_today() + timedelta(days=7),
                location_type="home",
                city=CITY,
                max_participants=10,
                status="approved",
                moderation_status="APPROVED",
            )
            db.add(ex)
            db.commit()
            ids[producer.is_test] = str(ex.id)
        listed = {e["id"] for e in client.get("/experiences").json()}
        assert ids[False] in listed
        assert ids[True] not in listed

    def test_host_link_never_points_at_a_test_business_page(self, client, db, pair):
        """The host's own /experiences/mine still lists her workshop, but the
        link to her business page is built only when that page is public."""
        slugs = {}
        for producer in pair:
            host = _owner(db, producer, f"mine-{producer.slug}@example.com")
            db.add(
                Experience(
                    title=f"סדנה של {producer.name}",
                    description="תיאור ארוך מספיק כדי לעבור את האימות, לפחות עשרים תווים.",
                    image_url=IMAGE,
                    category="בישול",
                    host_user_id=host.id,
                    event_date=israel_today() + timedelta(days=7),
                    location_type="home",
                    city=CITY,
                    max_participants=10,
                    status="pending",
                    moderation_status="APPROVED",
                )
            )
            db.commit()
            resp = client.get("/experiences/mine", headers=auth_header(host))
            assert resp.status_code == 200, resp.text
            (row,) = resp.json()
            slugs[producer.is_test] = (row["host"] or {}).get("producer_slug")
        assert slugs[False] == CONTROL_SLUG  # control: the link is built
        assert slugs[True] is None

    def test_saved_event_of_a_test_business(self, client, db, pair):
        control, hidden = pair
        user = make_user(db, email="meh2952-saver@example.com")
        h = auth_header(user)
        ok = _event(db, control, "שוק הבקרה")
        assert client.post(f"/users/me/saved/event/{ok.id}", headers=h).status_code in (
            200,
            201,
        )
        bad = _event(db, hidden, "שוק הניסוי")
        assert (
            client.post(f"/users/me/saved/event/{bad.id}", headers=h).status_code == 404
        )

    def test_recipes_by_slug(self, client, db, pair):
        for producer in pair:
            db.add(
                ProducerRecipe(
                    producer_id=producer.id,
                    title="עוגת גבינה",
                    ingredients="א" * 20,
                    instructions="ב" * 20,
                    moderation_status="approved",
                    published=True,
                )
            )
        db.commit()
        ok = client.get(f"/producers/{CONTROL_SLUG}/recipes")
        assert ok.status_code == 200 and len(ok.json()) == 1
        assert client.get(f"/producers/{TEST_SLUG}/recipes").status_code == 404

    def test_rescue_offers(self, client, db, pair, monkeypatch):
        monkeypatch.setattr(rescue_module, "rescue_bags_enabled", lambda: True)
        # The location row stores the canonical city (models._canonical_city).
        monkeypatch.setattr(
            rescue_module, "rescue_cities", lambda: (canonical_city(CITY),)
        )
        now = utc_now()
        ids = {}
        for producer in pair:
            loc = (
                db.query(ProducerLocation)
                .filter(ProducerLocation.producer_id == producer.id)
                .one()
            )
            offer = RescueOffer(
                producer_location_id=loc.id,
                date=israel_today(),
                qty_total=5,
                qty_left=3,
                price_agorot=1500,
                pickup_start=now + timedelta(minutes=30),
                pickup_end=now + timedelta(hours=3),
                cancel_until=now + timedelta(minutes=10),
                status="active",
            )
            db.add(offer)
            db.commit()
            ids[producer.is_test] = str(offer.id)
        # No ?city=: canonical_city() maps «תל אביב» to its canonical form,
        # which is not the pilot string. The pilot filter alone is enough.
        resp = client.get("/rescue/offers")
        assert resp.status_code == 200, resp.text
        listed = {o["id"] for o in resp.json()}
        assert ids[False] in listed
        assert ids[True] not in listed
        # …and not reservable by id either (same 404 as a missing bag)
        buyer = make_user(db, email="meh2952-buyer@example.com")
        h = auth_header(buyer)
        body = {"qty": 1}
        ok = client.post(
            "/rescue/orders", json={**body, "offer_id": ids[False]}, headers=h
        )
        assert ok.status_code == 201, ok.text
        bad = client.post(
            "/rescue/orders", json={**body, "offer_id": ids[True]}, headers=h
        )
        assert bad.status_code == 404, bad.text


# ── favorites and follower fan-out ─────────────────────────────────────────


class TestFavoritesAndAlerts:
    def test_favorite_add_refused(self, client, db, pair):
        control, hidden = pair
        user = make_user(db, email="meh2952-fan@example.com")
        h = auth_header(user)
        assert (
            client.post(f"/users/me/favorites/{control.id}", headers=h).status_code
            == 201
        )
        assert (
            client.post(f"/users/me/favorites/{hidden.id}", headers=h).status_code
            == 404
        )
        assert db.query(Favorite).filter(Favorite.producer_id == hidden.id).count() == 0

    def test_favorites_list_skips_a_test_row(self, client, db, pair):
        user = make_user(db, email="meh2952-favlist@example.com")
        for p in pair:
            db.add(Favorite(user_id=user.id, producer_id=p.id))
        db.commit()
        listed = {
            f["producer"]["name"]
            for f in client.get("/users/me/favorites", headers=auth_header(user)).json()
        }
        assert listed == {CONTROL_NAME}

    def test_delivery_waitlist_refused(self, client, db, pair):
        control, hidden = pair
        body = {"email": "dana@example.com", "city": "חיפה"}
        assert (
            client.post(
                f"/producers/{control.id}/delivery-waitlist", json=body
            ).status_code
            == 201
        )
        assert (
            client.post(
                f"/producers/{hidden.id}/delivery-waitlist", json=body
            ).status_code
            == 404
        )

    def test_fire_alerts_silent_for_a_test_row(self, db, pair, monkeypatch):
        control, hidden = pair
        calls = []
        monkeypatch.setattr(
            "app.services.push.send_push_notification",
            lambda sub, **kw: calls.append(kw["url"]),
        )
        monkeypatch.setattr(
            "app.routers.alerts.send_template", lambda to, tmpl, **kw: True
        )
        user = make_user(db, email="meh2952-alert@example.com")
        sub = {
            "endpoint": "https://push.example/abc",
            "keys": {"p256dh": "x", "auth": "y"},
        }
        for p in pair:
            db.add(
                FavoriteAlert(
                    user_id=user.id,
                    producer_id=p.id,
                    notify_new_product=True,
                    push_subscription=sub,
                )
            )
        db.commit()
        fire_alerts(
            db, control.id, "new_product", AlertContent(title="t", body="b", url="/ok")
        )
        assert calls == ["/ok"]  # control
        fire_alerts(
            db, hidden.id, "new_product", AlertContent(title="t", body="b", url="/no")
        )
        assert calls == ["/ok"]


# ── 6 · IndexNow ───────────────────────────────────────────────────────────


@pytest.fixture
def pings(monkeypatch):
    """Every IndexNow POST, with production switched on (same seam as
    tests/test_indexnow.py)."""
    calls = []

    class _Resp:
        status_code = 200

    def fake_post(url, *, json=None, timeout=None, **kwargs):
        calls.append(json)
        return _Resp()

    monkeypatch.setattr(indexnow.httpx, "post", fake_post)
    monkeypatch.setattr(settings, "railway_environment", "production")
    return calls


def _pinged(calls) -> list[str]:
    return [u for call in calls for u in call["urlList"]]


class TestIndexNow:
    def test_owner_predicates(self, db, pair):
        control, hidden = pair
        assert indexnow.is_public_owner(control) is True
        assert indexnow.is_public_business(control) is True
        assert indexnow.is_public_owner(hidden) is False
        assert indexnow.is_public_business(hidden) is False
        assert indexnow.producer_urls(hidden) == []
        assert indexnow.recipe_urls(hidden, "r1") == []

    def test_admin_toggle_pings_the_control_never_the_test_row(
        self, client, db, pair, pings
    ):
        """admin.py's toggle / approve / reject ping without asking
        is_public_owner; the URL builder itself must say no."""
        control, hidden = pair
        admin = make_user(db, role="admin", email="meh2952-ping@example.com")
        h = auth_header(admin)
        assert (
            client.post(
                f"/admin/producers/{control.id}/toggle-status", headers=h
            ).status_code
            == 200
        )
        assert any(CONTROL_SLUG in u for u in _pinged(pings))  # control
        before = len(pings)
        assert (
            client.post(
                f"/admin/producers/{hidden.id}/toggle-status", headers=h
            ).status_code
            == 200
        )
        assert not any(TEST_SLUG in u for u in _pinged(pings[before:]))
