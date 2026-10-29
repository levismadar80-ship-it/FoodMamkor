"""MEH-2557 — the saved recipes / events / experiences API (chunk 2/5 of MEH-2555).

The risk in this router is visibility, not storage: a save endpoint that
accepts any id lets a stranger confirm that a hidden recipe or a pending
business's event exists (200 vs 404), and a list that serves whatever was
saved leaks it again after the owner hides it. So most cases below put a
hidden item through the endpoint and assert it behaves exactly like a missing
one — 404 on save, absent from the list.

Ownership: the user comes from the token only; there is no user id in any path,
so the IDOR question is "can user B delete user A's save" — asserted below.
"""

from datetime import date, time, timedelta
from decimal import Decimal
from uuid import uuid4

from app.models import Event, Experience, ProducerRecipe, SavedItem
from app.utils.clock import israel_today
from tests.conftest import auth_header, make_producer, make_user

BASE = "/users/me/saved"


def _recipe(db, producer, *, published=True, moderation_status="approved"):
    recipe = ProducerRecipe(
        producer_id=producer.id,
        title="ברוסקטה חגיגית מלחם מחמצת",
        ingredients="א" * 20,
        instructions="ב" * 20,
        moderation_status=moderation_status,
        published=published,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return recipe


def _event(db, producer, *, event_date=date(2099, 1, 1), is_active=True):
    event = Event(
        producer_id=producer.id,
        title="שוק איכרים",
        event_date=event_date,
        category="שוק",
        is_active=is_active,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _experience(db, *, producer_status="approved", status="approved"):
    host = make_user(db, email=f"host-{uuid4().hex[:8]}@example.com")
    host.producer_id = make_producer(db, status=producer_status).id
    db.commit()
    ex = Experience(
        title="סדנת מחמצת",
        description="סדנה מעשית של שלוש שעות, מהתחלה ועד הסוף.",
        category="בישול",
        host_user_id=host.id,
        event_date=israel_today() + timedelta(days=7),
        event_time=time(10, 0),
        location_type="home",
        city="זכרון יעקב",
        max_participants=10,
        price_per_person=Decimal("150"),
        status=status,
        moderation_status="APPROVED",
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


def _all_three(db):
    producer = make_producer(db, status="approved")
    producer.slug = "maafiyat-ruach-hasade"
    db.commit()
    return {
        "recipe": _recipe(db, producer),
        "event": _event(db, producer),
        "experience": _experience(db),
    }


# ---------- auth ----------


def test_guest_gets_401_everywhere(client, db):
    item_id = uuid4()
    assert client.get(BASE).status_code == 401
    assert client.get(f"{BASE}/ids").status_code == 401
    assert client.post(f"{BASE}/recipe/{item_id}").status_code == 401
    assert client.delete(f"{BASE}/recipe/{item_id}").status_code == 401


# ---------- save + list, one per type ----------


def test_save_each_type_then_it_is_listed(client, db):
    user = make_user(db, email="saver-2557@example.com")
    items = _all_three(db)
    for item_type, item in items.items():
        resp = client.post(f"{BASE}/{item_type}/{item.id}", headers=auth_header(user))
        assert resp.status_code == 201, (item_type, resp.text)

    body = client.get(BASE, headers=auth_header(user)).json()
    assert [r["id"] for r in body["recipes"]] == [str(items["recipe"].id)]
    assert [e["id"] for e in body["events"]] == [str(items["event"].id)]
    assert [x["id"] for x in body["experiences"]] == [str(items["experience"].id)]
    recipe = body["recipes"][0]
    assert recipe["producer_slug"] == "maafiyat-ruach-hasade"
    assert recipe["producer_name"]
    assert "moderation_notes" not in recipe
    assert all("saved_at" in row for key in body for row in body[key])

    ids = client.get(f"{BASE}/ids", headers=auth_header(user)).json()
    assert {(r["item_type"], r["item_id"]) for r in ids} == {
        (t, str(i.id)) for t, i in items.items()
    }


def test_saving_twice_keeps_one_row(client, db):
    user = make_user(db, email="twice-2557@example.com")
    recipe = _recipe(db, make_producer(db, status="approved"))
    for _ in range(2):
        resp = client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
        assert resp.status_code == 201
    assert db.query(SavedItem).filter_by(user_id=user.id).count() == 1


def test_newest_save_first(client, db):
    user = make_user(db, email="order-2557@example.com")
    producer = make_producer(db, status="approved")
    first, second = _recipe(db, producer), _recipe(db, producer)
    client.post(f"{BASE}/recipe/{first.id}", headers=auth_header(user))
    client.post(f"{BASE}/recipe/{second.id}", headers=auth_header(user))
    # created_at comes from utc_now at insert; pin the order explicitly so the
    # assertion does not depend on two inserts landing in distinct microseconds.
    rows = {r.item_id: r for r in db.query(SavedItem).filter_by(user_id=user.id)}
    rows[first.id].created_at = rows[second.id].created_at - timedelta(minutes=1)
    db.commit()
    body = client.get(BASE, headers=auth_header(user)).json()
    assert [r["id"] for r in body["recipes"]] == [str(second.id), str(first.id)]


# ---------- visibility: a hidden item is a missing item ----------


def test_unknown_id_is_404(client, db):
    user = make_user(db, email="unknown-2557@example.com")
    for item_type in ("recipe", "event", "experience"):
        resp = client.post(f"{BASE}/{item_type}/{uuid4()}", headers=auth_header(user))
        assert resp.status_code == 404, item_type


def test_unknown_type_is_422(client, db):
    user = make_user(db, email="type-2557@example.com")
    resp = client.post(f"{BASE}/product/{uuid4()}", headers=auth_header(user))
    assert resp.status_code == 422


def test_hidden_items_cannot_be_saved(client, db):
    user = make_user(db, email="hidden-2557@example.com")
    live = make_producer(db, status="approved")
    pending = make_producer(db, status="pending")
    hidden = {
        "draft recipe": ("recipe", _recipe(db, live, published=False)),
        "unmoderated recipe": (
            "recipe",
            _recipe(db, live, moderation_status="pending"),
        ),
        "recipe of a pending business": ("recipe", _recipe(db, pending)),
        "event of a pending business": ("event", _event(db, pending)),
        "pending experience": ("experience", _experience(db, status="pending")),
        "experience of a pending business": (
            "experience",
            _experience(db, producer_status="pending"),
        ),
    }
    for name, (item_type, item) in hidden.items():
        resp = client.post(f"{BASE}/{item_type}/{item.id}", headers=auth_header(user))
        assert resp.status_code == 404, name
    assert db.query(SavedItem).filter_by(user_id=user.id).count() == 0


def test_item_hidden_after_saving_drops_out_and_comes_back(client, db):
    user = make_user(db, email="later-2557@example.com")
    producer = make_producer(db, status="approved")
    recipe = _recipe(db, producer)
    event = _event(db, producer)
    client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    client.post(f"{BASE}/event/{event.id}", headers=auth_header(user))

    producer.status = "suspended"
    db.commit()
    body = client.get(BASE, headers=auth_header(user)).json()
    assert body["recipes"] == [] and body["events"] == []
    assert db.query(SavedItem).filter_by(user_id=user.id).count() == 2

    producer.status = "approved"
    db.commit()
    body = client.get(BASE, headers=auth_header(user)).json()
    assert len(body["recipes"]) == 1 and len(body["events"]) == 1


def test_deleted_item_drops_out_without_error(client, db):
    user = make_user(db, email="deleted-2557@example.com")
    recipe = _recipe(db, make_producer(db, status="approved"))
    client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    db.delete(recipe)
    db.commit()
    resp = client.get(BASE, headers=auth_header(user))
    assert resp.status_code == 200
    assert resp.json()["recipes"] == []


def test_past_and_cancelled_events_stay_listed(client, db):
    """The public event page still serves both by direct link, so the saved
    list keeps them; the page labels them («עברו»)."""
    user = make_user(db, email="past-2557@example.com")
    producer = make_producer(db, status="approved")
    past = _event(db, producer, event_date=israel_today() - timedelta(days=3))
    cancelled = _event(db, producer, is_active=False)
    for event in (past, cancelled):
        resp = client.post(f"{BASE}/event/{event.id}", headers=auth_header(user))
        assert resp.status_code == 201
    body = client.get(BASE, headers=auth_header(user)).json()
    assert {e["id"] for e in body["events"]} == {str(past.id), str(cancelled.id)}


# ---------- ownership ----------


def test_users_do_not_see_or_remove_each_others_saves(client, db):
    alice = make_user(db, email="alice-2557@example.com")
    bob = make_user(db, email="bob-2557@example.com")
    recipe = _recipe(db, make_producer(db, status="approved"))
    client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(alice))

    assert client.get(BASE, headers=auth_header(bob)).json()["recipes"] == []
    assert client.get(f"{BASE}/ids", headers=auth_header(bob)).json() == []
    resp = client.delete(f"{BASE}/recipe/{recipe.id}", headers=auth_header(bob))
    assert resp.status_code == 404
    assert db.query(SavedItem).filter_by(user_id=alice.id).count() == 1


def test_remove_save(client, db):
    user = make_user(db, email="remove-2557@example.com")
    recipe = _recipe(db, make_producer(db, status="approved"))
    client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    resp = client.delete(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    assert resp.status_code == 200
    assert client.get(f"{BASE}/ids", headers=auth_header(user)).json() == []
    again = client.delete(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    assert again.status_code == 404


def test_remove_works_after_the_item_was_hidden(client, db):
    user = make_user(db, email="unhide-2557@example.com")
    producer = make_producer(db, status="approved")
    recipe = _recipe(db, producer)
    client.post(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    recipe.published = False
    db.commit()
    resp = client.delete(f"{BASE}/recipe/{recipe.id}", headers=auth_header(user))
    assert resp.status_code == 200


def test_api_type_list_matches_the_model_list():
    """Third copy of the type list (the path Literal in schemas.py) — the
    revision ↔ model pair is guarded in test_meh2556_saved_items_table.py."""
    from typing import get_args

    from app.models import SAVED_ITEM_TYPES
    from app.schemas.schemas import SavedItemType

    assert get_args(SavedItemType) == SAVED_ITEM_TYPES
