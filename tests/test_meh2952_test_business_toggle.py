"""MEH-2952 chunk 4: the admin writer of `producers.is_test`.

«עסק בדיקה — מוסתר מהאתר» on the admin edit screen. Behaviour only
(ADR-032 §2.6): who may flip it, that a flipped row leaves every public
listing and comes back when flipped off, that the admin still sees it, and
that hiding a live page tells IndexNow about the URL it is leaving.

Each "absent" assertion has a control business on the same path, so an
empty answer is the gate and not a broken route (testing.md).
"""

import pytest

from app.config import settings
from app.models import Producer
from app.services import indexnow
from conftest import auth_header, make_producer, make_user

CITY = "תל אביב"
CONTROL = "חוות הבקרה — מתג"
TARGET = "חוות היעד — מתג"


def _names(resp) -> set[str]:
    body = resp.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    return {p["name"] for p in items}


@pytest.fixture
def pair(db):
    control = make_producer(db, name=CONTROL, city=CITY)
    target = make_producer(db, name=TARGET, city=CITY)
    target.slug = "meh2952-toggle-target"
    db.commit()
    return control, target


@pytest.fixture
def admin(db):
    return make_user(db, role="admin", email="admin2952@example.com")


def _put(client, user, producer_id, hidden: bool):
    return client.put(
        f"/admin/test-businesses/{producer_id}",
        json={"hidden": hidden},
        headers=auth_header(user),
    )


class TestPermissions:
    @pytest.mark.parametrize("role", ["consumer", "producer"])
    def test_non_admin_cannot_flip(self, client, db, pair, role):
        _, target = pair
        user = make_user(db, role=role, email=f"{role}2952@example.com")
        resp = _put(client, user, target.id, True)
        assert resp.status_code == 403
        db.refresh(target)
        assert target.is_test is False

    def test_anonymous_cannot_flip(self, client, db, pair):
        _, target = pair
        resp = client.put(
            f"/admin/test-businesses/{target.id}", json={"hidden": True}
        )
        assert resp.status_code == 401
        db.refresh(target)
        assert target.is_test is False

    def test_non_admin_cannot_list(self, client, db):
        user = make_user(db, role="consumer", email="c2952list@example.com")
        resp = client.get("/admin/test-businesses", headers=auth_header(user))
        assert resp.status_code == 403

    def test_unknown_business_is_404(self, client, admin):
        resp = _put(client, admin, "00000000-0000-0000-0000-000000000000", True)
        assert resp.status_code == 404


class TestFlip:
    def test_hide_then_show(self, client, db, pair, admin):
        control, target = pair
        before = _names(client.get("/producers"))
        assert {CONTROL, TARGET} <= before

        resp = _put(client, admin, target.id, True)
        assert resp.status_code == 200
        assert resp.json() == {"producer_id": str(target.id), "hidden": True}
        db.refresh(target)
        assert target.is_test is True
        hidden = _names(client.get("/producers"))
        assert CONTROL in hidden  # control: the listing still works
        assert TARGET not in hidden

        resp = _put(client, admin, target.id, False)
        assert resp.status_code == 200
        assert resp.json()["hidden"] is False
        assert TARGET in _names(client.get("/producers"))

    def test_admin_list_names_only_hidden_rows(self, client, db, pair, admin):
        control, target = pair
        empty = client.get("/admin/test-businesses", headers=auth_header(admin))
        assert empty.status_code == 200
        assert empty.json() == {"producer_ids": []}

        _put(client, admin, target.id, True)
        resp = client.get("/admin/test-businesses", headers=auth_header(admin))
        assert resp.json() == {"producer_ids": [str(target.id)]}

    def test_admin_still_opens_a_hidden_row(self, client, db, pair, admin):
        _, target = pair
        _put(client, admin, target.id, True)
        resp = client.get(f"/admin/producers/{target.id}", headers=auth_header(admin))
        assert resp.status_code == 200
        assert resp.json()["name"] == TARGET

    def test_flip_writes_only_the_flag(self, client, db, pair, admin):
        _, target = pair
        status, name = target.status, target.name
        _put(client, admin, target.id, True)
        db.refresh(target)
        assert (target.status, target.name) == (status, name)


@pytest.fixture
def pings(monkeypatch):
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
    def test_hiding_a_live_page_pings_the_url_it_leaves(
        self, client, db, pair, admin, pings
    ):
        _, target = pair
        _put(client, admin, target.id, True)
        assert any(u.endswith("/meh2952-toggle-target") for u in _pinged(pings))

    def test_showing_it_again_pings_the_url(self, client, db, pair, admin, pings):
        _, target = pair
        target.is_test = True
        db.commit()
        _put(client, admin, target.id, False)
        assert any(u.endswith("/meh2952-toggle-target") for u in _pinged(pings))

    def test_a_draft_is_never_announced(self, client, db, admin, pings):
        draft = make_producer(db, name="טיוטה — מתג", city=CITY, status="draft")
        draft.slug = "meh2952-toggle-draft"
        db.commit()
        _put(client, admin, draft.id, True)
        _put(client, admin, draft.id, False)
        assert _pinged(pings) == []

    def test_noop_flip_pings_nothing(self, client, db, pair, admin, pings):
        _, target = pair
        resp = _put(client, admin, target.id, False)  # already visible
        assert resp.status_code == 200
        assert _pinged(pings) == []


def test_model_still_defaults_false(db):
    """The seed flag is opt-in: a row made without it is a real business."""
    p = Producer(name="ברירת מחדל", city=CITY, lat=32.0, lng=34.0, status="draft")
    db.add(p)
    db.commit()
    db.refresh(p)
    assert p.is_test is False


# ── the seed's opt-in flag (off by default) ─────────────────────────────────


class _StubEngine:
    def __init__(self, url):
        self.url = url


def _seed_main(monkeypatch, *argv, staging=False):
    """Run seed.main() against the test DB with every seeding step stubbed,
    so only the flag's wiring is under test."""
    import sys

    from scripts import seed_demo_business as seed

    if staging:
        monkeypatch.setattr(
            seed, "engine", _StubEngine("postgresql://u:p@db.railway.internal:5432/x")
        )
        monkeypatch.setenv("RAILWAY_ENVIRONMENT", "staging")
    else:
        monkeypatch.setattr(
            seed, "engine", _StubEngine("postgresql://u:p@localhost:5432/x")
        )
        monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    for fn in (
        "seed_demo_business",
        "seed_dietary_scope_demos",
        "seed_availability_demos",
        "seed_marketing_fixtures",
        "seed_open_group_buy",
    ):
        monkeypatch.setattr(seed, fn, lambda *a, **k: None)
    monkeypatch.setattr(sys, "argv", ["seed_demo_business.py", *argv])
    seed.main()


class TestSeedFlag:
    def _demo(self, db):
        from scripts import seed_demo_business as seed

        demo = make_producer(db, name="רוח השדה — בדיקה", city=CITY)
        demo.slug = seed.DEMO_SLUG
        other = make_producer(db, name="עסק אמיתי — בדיקה", city=CITY)
        other.slug = "meh2952-not-a-demo"
        db.commit()
        return demo, other

    def test_plain_run_leaves_demos_visible(self, db, monkeypatch):
        demo, _ = self._demo(db)
        _seed_main(monkeypatch)
        db.expire_all()
        assert db.get(Producer, demo.id).is_test is False

    def test_refresh_leaves_demos_visible(self, db, monkeypatch):
        demo, _ = self._demo(db)
        _seed_main(monkeypatch, "--refresh")
        db.expire_all()
        assert db.get(Producer, demo.id).is_test is False

    def test_mark_test_hides_only_the_demos(self, db, monkeypatch):
        demo, other = self._demo(db)
        _seed_main(monkeypatch, "--mark-test")
        db.expire_all()
        assert db.get(Producer, demo.id).is_test is True
        assert db.get(Producer, other.id).is_test is False  # control

    def test_plain_run_on_staging_leaves_demos_visible(self, db, monkeypatch):
        demo, _ = self._demo(db)
        _seed_main(monkeypatch, "--refresh", staging=True)
        db.expire_all()
        assert db.get(Producer, demo.id).is_test is False

    def test_mark_test_refused_on_staging(self, db, monkeypatch):
        demo, _ = self._demo(db)
        with pytest.raises(SystemExit) as exc:
            _seed_main(monkeypatch, "--mark-test", staging=True)
        assert "local database only" in str(exc.value)
        db.expire_all()
        assert db.get(Producer, demo.id).is_test is False

    @pytest.mark.parametrize("other", ["--golden", "--sync-users"])
    def test_mark_test_refuses_other_modes(self, db, monkeypatch, other):
        with pytest.raises(SystemExit) as exc:
            _seed_main(monkeypatch, other, "--mark-test")
        assert "--mark-test" in str(exc.value)

    def test_slug_list_covers_every_seeded_demo(self):
        from scripts import seed_demo_business as seed

        slugs = seed.demo_business_slugs()
        assert seed.DEMO_SLUG in slugs and seed.DELIVERY_ONLY_SLUG in slugs
        for spec in (*seed.DIETARY_SCOPE_DEMOS, *seed.AVAILABILITY_DEMOS):
            assert spec["slug"] in slugs
