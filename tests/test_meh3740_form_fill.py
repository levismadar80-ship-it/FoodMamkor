"""MEH-3740 — the shared «fill the form from text» engine and its route.

form=recipe: a pasted recipe becomes a draft of the recipe form. Nothing is
saved; a product comes only from the owner's own list, a number only when the
text writes it. The model is never called: each test patches the client.
"""

import json
import uuid
from types import SimpleNamespace

from app.models import Product, ProducerRecipe
from app.services import ai_budget, form_filler
from tests.conftest import auth_header, make_producer, make_user

URL = "/producers/me/ai-fill/recipe"
RECIPE = (
    "עוגת שמרים של סבתא. רכיבים: 500 גרם קמח, 2 ביצים, כוס חלב. "
    "לשים 10 דקות, אופים 35 דקות. יוצאות 12 פרוסות. משתמשים בחמאה שלנו."
)


def _client(answer, calls):
    class _C:
        class messages:
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text=json.dumps(answer))],
                    stop_reason="end_turn",
                )

    return _C()


def _answer(**over):
    base = {
        "title": "עוגת שמרים של סבתא",
        "description": "עוגה רכה כמו של פעם.",
        "ingredients": ["500 גרם קמח", "2 ביצים", "כוס חלב"],
        "instructions": ["לשים 10 דקות", "לאפות 35 דקות"],
        "prep_time_min": 10,
        "cook_time_min": 35,
        "servings": 12,
        "product_ids": [],
    }
    base.update(over)
    return base


def _owner(db, products=()):
    producer = make_producer(db)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    rows = [
        Product(producer_id=producer.id, name=n, price_range="₪20") for n in products
    ]
    db.add_all(rows)
    db.commit()
    db.refresh(user)
    return user, rows


def _patch(monkeypatch, answer):
    calls = []
    monkeypatch.setattr(form_filler, "_get_client", lambda: _client(answer, calls))
    return calls


# --- engine ---------------------------------------------------------------


def test_the_schema_holds_every_ai_field_and_nothing_else():
    fmap = form_filler.load_map("recipe")
    s = form_filler.schema(fmap)
    ai = [f["key"] for f in fmap["fields"] if f["ai"]]
    assert s["required"] == ai and set(s["properties"]) == set(ai)
    assert "image_url" not in s["properties"]  # a photo is not read from text
    assert s["additionalProperties"] is False


def test_numbers_the_text_does_not_write_are_dropped():
    fmap = form_filler.load_map("recipe")
    data = _answer(prep_time_min=20, cook_time_min=60, servings=0)
    draft = form_filler.to_draft(fmap, data, "אופים שעה. לשים 10 דקות.", {})
    assert draft["prep_time_min"] is None  # 20 is not in the text
    assert draft["cook_time_min"] is None  # «שעה» with no written 1
    assert draft["servings"] is None  # out of range


def test_an_hour_counts_only_when_the_text_writes_its_number():
    fmap = form_filler.load_map("recipe")
    draft = form_filler.to_draft(fmap, _answer(cook_time_min=60), "אופים שעה", {})
    assert draft["cook_time_min"] is None
    draft = form_filler.to_draft(fmap, _answer(cook_time_min=60), "אופים 1 שעה", {})
    assert draft["cook_time_min"] == 60


def test_lists_become_one_item_per_line():
    fmap = form_filler.load_map("recipe")
    draft = form_filler.to_draft(
        fmap, _answer(ingredients=["  קמח ", "", 3]), RECIPE, {}
    )
    assert draft["ingredients"] == "קמח"
    assert (
        form_filler.to_draft(fmap, _answer(ingredients=[]), RECIPE, {})["ingredients"]
        is None
    )


def test_a_claim_the_text_does_not_make_is_dropped():
    fmap = form_filler.load_map("recipe")
    data = _answer(description="עוגה רכה. היא כשרה למהדרין.")
    draft = form_filler.to_draft(fmap, data, RECIPE, {})
    assert "כשר" not in draft["description"]


def test_choices_are_only_the_listed_options():
    fmap = form_filler.load_map("recipe")
    options = [("id-a", "חמאה"), ("id-b", "קמח")]
    data = _answer(product_ids=[2, 2, 9, 0, -1, True])
    draft = form_filler.to_draft(fmap, data, RECIPE, {"product_ids": options})
    assert draft["product_ids"] == ["id-b"]


def test_an_unknown_form_has_no_map():
    for name in ("event_x", "../recipe", "Recipe"):
        try:
            form_filler.load_map(name)
        except KeyError:
            continue
        raise AssertionError(f"{name} loaded a map")


def test_over_the_ceiling_the_engine_does_not_call_the_model(monkeypatch):
    calls = _patch(monkeypatch, _answer())
    monkeypatch.setattr(ai_budget, "allow", lambda tier: False)
    assert form_filler.fill("recipe", RECIPE) is None
    assert calls == []


# --- route ----------------------------------------------------------------


def test_the_route_returns_a_draft_and_saves_nothing(client, db, monkeypatch):
    user, (butter, flour) = _owner(db, ["חמאה", "קמח"])
    calls = _patch(monkeypatch, _answer(product_ids=[1]))
    r = client.post(URL, json={"text": RECIPE}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    draft = r.json()["draft"]
    assert draft["title"] == "עוגת שמרים של סבתא"
    assert draft["ingredients"] == "500 גרם קמח\n2 ביצים\nכוס חלב"
    assert (draft["prep_time_min"], draft["cook_time_min"], draft["servings"]) == (
        10,
        35,
        12,
    )
    assert draft["product_ids"] == [str(butter.id)]  # «1» in the list, sorted by name
    assert db.query(ProducerRecipe).count() == 0
    # The owner's products are in the prompt, numbered; no other business's.
    prompt = calls[0]["messages"][0]["content"]
    assert "1: חמאה" in prompt and "2: קמח" in prompt


def test_another_business_products_never_reach_the_prompt(client, db, monkeypatch):
    _other, _ = _owner(db, ["סוד של מישהו אחר"])
    user, _ = _owner(db, [])
    calls = _patch(monkeypatch, _answer(product_ids=[1]))
    r = client.post(URL, json={"text": RECIPE}, headers=auth_header(user))
    assert r.status_code == 200
    assert r.json()["draft"]["product_ids"] == []
    assert "סוד של מישהו אחר" not in calls[0]["messages"][0]["content"]


def test_no_key_is_the_hebrew_503(client, db, monkeypatch):
    user, _ = _owner(db)
    monkeypatch.setattr(form_filler, "_get_client", lambda: None)
    r = client.post(URL, json={"text": RECIPE}, headers=auth_header(user))
    assert r.status_code == 503
    assert (
        r.json()["detail"]
        == "לא הצלחנו לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית."
    )


def test_an_unknown_form_is_a_hebrew_404(client, db, monkeypatch):
    user, _ = _owner(db)
    calls = _patch(monkeypatch, _answer())
    r = client.post(
        "/producers/me/ai-fill/nope", json={"text": RECIPE}, headers=auth_header(user)
    )
    assert r.status_code == 404 and r.json()["detail"] == "הטופס לא נמצא"
    assert calls == []


def test_a_visitor_and_a_consumer_cannot_fill(client, db, monkeypatch):
    calls = _patch(monkeypatch, _answer())
    assert client.post(URL, json={"text": RECIPE}).status_code == 401
    consumer = make_user(db, email=f"c{uuid.uuid4().hex[:8]}@example.com")
    r = client.post(URL, json={"text": RECIPE}, headers=auth_header(consumer))
    assert r.status_code == 403
    assert calls == []


def test_the_hourly_limit_holds_before_any_model_call(client, db, monkeypatch):
    # The per-business 20/day is held for every AI route by
    # tests/test_ai_daily_caps.py::test_every_business_ai_generation_route_has_a_daily_cap.
    user, _ = _owner(db)
    calls = _patch(monkeypatch, _answer())
    codes = [
        client.post(URL, json={"text": RECIPE}, headers=auth_header(user)).status_code
        for _ in range(11)
    ]
    assert codes == [200] * 10 + [429]
    assert len(calls) == 10
