"""MEH-3751 — form=event on the shared fill engine (MEH-3740).

An owner pastes a post about an event and gets a draft of the event form. It
is a new field map only: the same route, no save, a city only from the city
list, a category only from the closed set, no past date. The model is never
called: each test patches the client.
"""

import json
import uuid
from datetime import date
from types import SimpleNamespace

from app.models import Event
from app.routers import events as events_router
from app.routers import form_fill
from app.services import form_filler
from tests.conftest import auth_header, make_producer, make_user

URL = "/producers/me/ai-fill/event"
TODAY = date(2026, 11, 24)
POST = (
    "שוק איכרים בחצר המשק! יום שישי 27.11 בין 9:00 ל-13:00, רחוב הזית 4, "
    "זכרון יעקב. כניסה 20 ש״ח, עד 40 משתתפים. טעימות של גבינות ולחם."
)


def _answer(**over):
    base = {
        "title": "שוק איכרים בחצר המשק",
        "description": "שוק בחצר המשק עם גבינות ולחם.",
        "category": "שוק",
        "event_date": "2026-11-27",
        "event_time": "09:00",
        "end_time": "13:00",
        "location": "רחוב הזית 4",
        "city": "זכרון יעקב",
        "price": 20,
        "max_participants": 40,
    }
    base.update(over)
    return base


def _patch(monkeypatch, answer):
    calls = []

    class _C:
        class messages:
            @staticmethod
            def create(**kwargs):
                calls.append(kwargs)
                return SimpleNamespace(
                    content=[SimpleNamespace(type="text", text=json.dumps(answer))],
                    stop_reason="end_turn",
                )

    monkeypatch.setattr(form_filler, "_get_client", lambda: _C())
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    return calls


def _draft(data, source=POST):
    return form_filler.form_to_draft(form_filler.load_map("event"), data, source, {})


def _owner(db):
    producer = make_producer(db)
    user = make_user(db, role="producer", email=f"o{uuid.uuid4().hex[:8]}@example.com")
    user.producer_id = producer.id
    user.is_producer = True
    db.commit()
    db.refresh(user)
    return user


def test_event_is_a_map_on_the_same_route():
    assert "event" in form_filler.forms()
    paths = {r.path for r in form_fill.router.routes}
    assert paths == {"/producers/me/ai-fill/{form}"}  # no route per form
    fmap = form_filler.load_map("event")
    assert len(fmap["fields"]) == 11
    ai = [f["key"] for f in fmap["fields"] if f["ai"]]
    assert form_filler.schema(fmap)["required"] == ai


def test_the_category_set_is_the_events_router_set():
    field = next(
        f for f in form_filler.load_map("event")["fields"] if f["key"] == "category"
    )
    assert set(field["values"]) == events_router.VALID_CATEGORIES


def test_a_full_post_drafts_every_field(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    draft = _draft(_answer())
    assert draft == {**_answer(), "description": "שוק בחצר המשק עם גבינות ולחם."}


def test_a_category_outside_the_set_is_dropped(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(category="סדנה"))["category"] is None


def test_a_past_or_far_or_broken_date_is_dropped(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    # Each source writes its date, so only the window can drop it.
    assert _draft(_answer(event_date="2026-11-23"), "שוק ב-23.11")["event_date"] is None
    today = _draft(_answer(event_date="2026-11-24"), "שוק היום, 24.11")
    assert today["event_date"] == "2026-11-24"
    assert (
        _draft(_answer(event_date="2028-01-01"), "שוק ב-1.1.2028")["event_date"] is None
    )
    assert _draft(_answer(event_date="27.11"))["event_date"] is None


def test_times_must_be_hh_mm(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    draft = _draft(_answer(event_time="9:00", end_time="25:00"))
    assert (draft["event_time"], draft["end_time"]) == (None, None)


def test_a_city_must_be_on_the_list_and_in_the_text(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(city="עיר שלא קיימת"), "עיר שלא קיימת")["city"] is None
    assert _draft(_answer(city="חיפה"))["city"] is None  # not in the post
    assert _draft(_answer(city="חיפה"), "שוק בחיפה ב-27.11")["city"] == "חיפה"


def test_a_price_or_a_count_the_post_does_not_write_is_dropped(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    draft = _draft(_answer(price=35, max_participants=15))
    assert (draft["price"], draft["max_participants"]) == (None, None)


def test_a_price_and_a_count_count_only_beside_their_unit(monkeypatch):
    """«40 משתתפים» backs neither price=40 nor «20 ש״ח» a count of 20."""
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    draft = _draft(_answer(price=40, max_participants=20))
    assert (draft["price"], draft["max_participants"]) == (None, None)
    assert _draft(_answer(price=25), "כניסה ₪25 לאדם")["price"] == 25


def test_free_is_a_price_of_zero_only_when_the_post_says_so(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(price=0), "שוק איכרים, הכניסה בחינם")["price"] == 0
    assert _draft(_answer(price=0), "שוק איכרים ביום שישי")["price"] is None


def test_a_date_or_a_time_the_post_does_not_write_is_dropped(monkeypatch):
    """With today in the prompt, a post with no date must not come back as today."""
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    bare = "שוק איכרים בחצר המשק, זכרון יעקב."
    draft = _draft(
        _answer(event_date="2026-11-24", event_time="10:00", end_time=None), bare
    )
    assert (draft["event_date"], draft["event_time"]) == (None, None)


def test_a_date_counts_by_its_day_its_weekday_or_tomorrow(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)  # a Tuesday
    cases = [
        ("שוק ב-27.11", "2026-11-27"),
        ("שוק ביום שישי", "2026-11-27"),
        ("שוק מחר בבוקר", "2026-11-25"),
        ("שוק היום", "2026-11-24"),
    ]
    for source, day in cases:
        assert _draft(_answer(event_date=day), source)["event_date"] == day, source
    assert (
        _draft(_answer(event_date="2026-11-28"), "שוק ביום שישי")["event_date"] is None
    )


def test_a_time_counts_by_its_hour(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert (
        _draft(_answer(event_time="09:00"), "מתחילים בשעה 9")["event_time"] == "09:00"
    )
    assert _draft(_answer(event_time="09:30"), "פותחים ב-9:30")["event_time"] == "09:30"
    assert _draft(_answer(event_time="10:00"), "פותחים ב-9:30")["event_time"] is None


def test_a_unit_is_a_whole_word_and_a_price_reads_as_written(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(price=20), "20 שחקנים בטורניר")["price"] is None
    assert _draft(_answer(price=1500), 'סדנה, 1,500 ש"ח לאדם')["price"] == 1500
    assert _draft(_answer(price=40), "כניסה 40 ש''ח")["price"] == 40


def test_free_with_a_price_beside_it_is_not_a_price_of_zero(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(price=0), "הכניסה חופשית? כניסה חופשית לכולם")["price"] == 0
    assert _draft(_answer(price=0), 'חינם לילדים, 30 ש"ח למבוגרים')["price"] is None


def test_a_city_is_named_as_its_own_word(monkeypatch):
    monkeypatch.setattr(form_filler, "israel_today", lambda: TODAY)
    assert _draft(_answer(city="יהוד"), "שוק באור יהודה")["city"] is None
    assert _draft(_answer(city="חיפה"), "שוק בחיפה")["city"] == "חיפה"


def test_the_prompt_carries_today_so_a_weekday_can_be_dated(monkeypatch):
    calls = _patch(monkeypatch, _answer())
    assert form_filler.fill("event", POST) is not None
    assert "Today is 2026-11-24 in Israel." in calls[0]["messages"][0]["content"]


def test_the_route_returns_an_event_draft_and_saves_nothing(client, db, monkeypatch):
    _patch(monkeypatch, _answer())
    user = _owner(db)
    r = client.post(URL, json={"text": POST}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    assert r.json()["form"] == "event"
    assert r.json()["draft"]["city"] == "זכרון יעקב"
    assert r.json()["draft"]["event_date"] == "2026-11-27"
    assert db.query(Event).count() == 0


def test_no_key_is_the_hebrew_503(client, db, monkeypatch):
    monkeypatch.setattr(form_filler, "_get_client", lambda: None)
    user = _owner(db)
    r = client.post(URL, json={"text": POST}, headers=auth_header(user))
    assert r.status_code == 503


def _nodes(node):
    """Every dict in a JSON schema, depth first."""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _nodes(v)
    elif isinstance(node, list):
        for v in node:
            yield from _nodes(v)


def test_no_form_schema_mixes_an_enum_with_a_type_list():
    # MEH-3825: the event schema sent {"type": ["string","null"], "enum": [..., null]}
    # and the API answered 400 (BadRequestError) on every call on staging, so the
    # event fill always fell back to «לא הצלחנו לקרוא». Every enum that works in
    # production is {"type": "string", "enum": [...]}; nullable goes through anyOf.
    checked = []
    for form in form_filler.forms():
        for node in _nodes(form_filler.schema(form_filler.load_map(form))):
            if "enum" in node:
                checked.append(form)
                assert isinstance(node.get("type"), str), (form, node)
                assert None not in node["enum"], (form, node)
    assert "event" in checked  # the category enum was actually walked


def test_the_category_can_still_be_null():
    prop = form_filler.schema(form_filler.load_map("event"))["properties"]["category"]
    assert {"type": "null"} in prop["anyOf"]
    assert {"type": "string", "enum": ["שוק", "קטיף", "טעימות", "אחר"]} in prop["anyOf"]
