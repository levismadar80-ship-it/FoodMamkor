"""MEH-3477 / MEH-3478 — move many products between groups in one write, and
the AI group suggestion (nothing saved until the owner approves).

The model is never called: `suggest_groups` is patched at the service, and
the answer-shaping (`to_suggestion`) is tested on its own. Guard bodies are
schema-valid (regression rule 6).
"""

import uuid

from app.models import Product
from app.services import group_suggester
from tests.conftest import auth_header, make_producer, make_user
from tests.test_meh3055_product_organize import _owner, _products

MOVES = "/producers/me/product-groups/assign"
SUGGEST = "/producers/me/product-groups/suggest"


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def _with_groups(db, producer, *names):
    producer.product_groups = [{"id": f"g{i}", "name": n} for i, n in enumerate(names)]
    db.commit()


def _group_ids(db, producer):
    db.expire_all()
    return {p.name: p.group_id for p in db.query(Product).filter(Product.producer_id == producer.id)}


# --- bulk moves (MEH-3477) ----------------------------------------------------


def test_moves_put_many_products_in_a_group_and_take_others_out_in_one_write(client, db):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים", "עוגות")
    a, b, c = _products(db, producer, 3)
    c.group_id = "g1"
    db.commit()
    body = {"moves": [
        {"group_id": "g0", "product_ids": [str(a.id), str(b.id)]},
        {"group_id": None, "product_ids": [str(c.id)]},
    ]}
    r = client.put(MOVES, json=body, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert _group_ids(db, producer) == {"מוצר 0": "g0", "מוצר 1": "g0", "מוצר 2": None}
    assert {p["id"]: p["group_id"] for p in r.json()} == {str(a.id): "g0", str(b.id): "g0", str(c.id): None}


def test_moves_refuse_another_business_product_and_change_nothing(client, db):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים")
    (mine,) = _products(db, producer, 1)
    other = make_producer(db)
    (theirs,) = _products(db, other, 1)
    body = {"moves": [{"group_id": "g0", "product_ids": [str(mine.id), str(theirs.id)]}]}
    r = client.put(MOVES, json=body, headers=auth_header(user))
    assert r.status_code == 404
    assert _group_ids(db, producer) == {"מוצר 0": None}
    assert _group_ids(db, other) == {"מוצר 0": None}


def test_moves_refuse_an_unknown_group(client, db):
    user, producer = _owner(db)
    (p,) = _products(db, producer, 1)
    r = client.put(MOVES, json={"moves": [{"group_id": "nope", "product_ids": [str(p.id)]}]}, headers=auth_header(user))
    assert r.status_code == 404
    assert _group_ids(db, producer) == {"מוצר 0": None}


def test_moves_refuse_one_product_in_two_moves(client, db):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים")
    (p,) = _products(db, producer, 1)
    body = {"moves": [
        {"group_id": "g0", "product_ids": [str(p.id)]},
        {"group_id": None, "product_ids": [str(p.id)]},
    ]}
    assert client.put(MOVES, json=body, headers=auth_header(user)).status_code == 422


def test_owner_moves_never_reach_a_draft_admin_moves_do(client, db):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים")
    (draft,) = _products(db, producer, 1)
    draft.is_draft = True
    db.commit()
    body = {"moves": [{"group_id": "g0", "product_ids": [str(draft.id)]}]}
    assert client.put(MOVES, json=body, headers=auth_header(user)).status_code == 404
    r = client.put(f"/admin/producers/{producer.id}/product-groups/assign", json=body, headers=auth_header(_admin(db)))
    assert r.status_code == 200, r.text
    assert _group_ids(db, producer) == {"מוצר 0": "g0"}


def test_moves_need_the_owner(client, db):
    _, producer = _owner(db)
    (p,) = _products(db, producer, 1)
    stranger = make_user(db, role="consumer", email=f"c{uuid.uuid4().hex[:8]}@example.com")
    body = {"moves": [{"group_id": None, "product_ids": [str(p.id)]}]}
    assert client.put(MOVES, json=body, headers=auth_header(stranger)).status_code == 403
    assert client.put(f"/admin/producers/{producer.id}/product-groups/assign", json=body, headers=auth_header(stranger)).status_code == 403


# --- suggestion (MEH-3478) ----------------------------------------------------


def test_suggest_sees_only_ungrouped_products_and_saves_nothing(client, db, monkeypatch):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים")
    a, b, c = _products(db, producer, 3)
    a.group_id = "g0"
    for i, p in enumerate((a, b, c)):
        p.position = i  # the owner's order is the order the model reads
    db.commit()
    seen = {}

    def fake(names, existing, room):
        seen.update(names=names, existing=existing, room=room)
        return {"groups": [{"name": "לחמים", "items": [1]}, {"name": "עוגות", "items": [2]}]}

    monkeypatch.setattr(group_suggester, "_ask", fake)
    r = client.post(SUGGEST, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert seen["names"] == ["מוצר 1", "מוצר 2"]
    assert seen["existing"] == ["לחמים"]
    assert seen["room"] == 19
    assert r.json() == {"groups": [
        {"id": "g0", "name": "לחמים", "product_ids": [str(b.id)]},
        {"id": None, "name": "עוגות", "product_ids": [str(c.id)]},
    ]}
    assert _group_ids(db, producer) == {"מוצר 0": "g0", "מוצר 1": None, "מוצר 2": None}
    assert len(producer.product_groups) == 1


def test_suggest_without_ai_answers_503(client, db, monkeypatch):
    user, producer = _owner(db)
    _products(db, producer, 2)
    monkeypatch.setattr(group_suggester, "_ask", lambda *a: None)
    r = client.post(SUGGEST, headers=auth_header(user))
    assert r.status_code == 503
    assert r.json()["detail"]


def test_suggest_with_nothing_ungrouped_does_not_call_the_model(client, db, monkeypatch):
    user, producer = _owner(db)
    _with_groups(db, producer, "לחמים")
    for p in _products(db, producer, 2):
        p.group_id = "g0"
    db.commit()
    monkeypatch.setattr(group_suggester, "_ask", lambda *a: (_ for _ in ()).throw(AssertionError("called")))
    r = client.post(SUGGEST, headers=auth_header(user))
    assert r.status_code == 200
    assert r.json() == {"groups": []}


def test_admin_suggest_sees_drafts_too(client, db, monkeypatch):
    _, producer = _owner(db)
    (draft,) = _products(db, producer, 1)
    draft.is_draft = True
    db.commit()
    monkeypatch.setattr(group_suggester, "_ask", lambda names, e, r: {"groups": [{"name": "שונות", "items": [1]}]})
    r = client.post(f"/admin/producers/{producer.id}/product-groups/suggest", headers=auth_header(_admin(db)))
    assert r.status_code == 200, r.text
    assert r.json()["groups"][0]["product_ids"] == [str(draft.id)]
    owner_view = client.post(SUGGEST, headers=auth_header(_owner(db)[0]))
    assert owner_view.json() == {"groups": []}


# --- answer shaping -----------------------------------------------------------


def _shape(answer, n=4, existing=(), room=20):
    ids = [f"p{i}" for i in range(n)]
    groups = [{"id": f"g{i}", "name": nm} for i, nm in enumerate(existing)]
    return group_suggester.to_suggestion(answer, ids, groups, room)


def test_shaping_drops_bad_indexes_repeats_and_empty_groups():
    out = _shape({"groups": [
        {"name": "לחמים", "items": [1, 1, 9, 0, "2"]},
        {"name": "עוגות", "items": [1]},  # already placed
        {"name": "ריקה", "items": []},
    ]})
    assert out == [{"id": None, "name": "לחמים", "product_ids": ["p0"]}]


def test_shaping_merges_names_that_differ_only_in_case_or_space_and_maps_existing():
    out = _shape({"groups": [
        {"name": " Cakes ", "items": [1]},
        {"name": "cakes", "items": [2]},
        {"name": "לחמים", "items": [3]},
    ]}, existing=["לחמים"])
    assert out == [
        {"id": None, "name": "Cakes", "product_ids": ["p0", "p1"]},
        {"id": "g0", "name": "לחמים", "product_ids": ["p2"]},
    ]


def test_shaping_refuses_a_name_the_owner_could_not_type_and_stops_at_the_room_left():
    out = _shape({"groups": [
        {"name": "א" * 41, "items": [1]},
        {"name": "לחמים", "items": [2]},
        {"name": "עוגות", "items": [3]},
        {"name": "קיימת", "items": [4]},
    ]}, existing=["קיימת"], room=1)
    assert out == [
        {"id": None, "name": "לחמים", "product_ids": ["p1"]},
        {"id": "g0", "name": "קיימת", "product_ids": ["p3"]},
    ]


def test_shaping_survives_an_answer_of_the_wrong_shape():
    assert _shape({"groups": "x"}) == []
    assert _shape({"nope": []}) == []
    assert _shape({"groups": [None, {"name": 5, "items": [1]}, {"name": "ok", "items": "1"}]}) == []
