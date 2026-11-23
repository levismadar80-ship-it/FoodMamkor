"""MEH-3752 — form=order_setup on the shared fill engine (MEH-3740).

An owner describes how she takes orders and gets a draft of the order setup:
the settings numbers, the weekly hand-over windows and the products open to
order. Hard lines: the business ID, «לקבל הזמנות באתר» and auto-confirm are
never drafted; a window passes the same check as a manual save; a slot is 30,
60 or 120 minutes; a product comes only from the owner's own list. The model
is never called: each test patches the client.
"""

import json
import uuid
from types import SimpleNamespace

from app.models import Product
from app.models.product_orders import (
    PRODUCT_ORDER_MAX_CUTOFF_HOURS,
    PRODUCT_ORDER_MAX_LEAD_HOURS,
    PRODUCT_ORDER_MAX_WINDOWS,
    PRODUCT_ORDER_SLOT_MINUTES,
)
from app.schemas.product_orders import MAX_AUTO_CONFIRM_SLOT_CAP, MAX_MIN_ORDER_AGOROT
from app.services import form_filler
from tests.conftest import auth_header, make_producer, make_user

URL = "/producers/me/ai-fill/order_setup"
TEXT = (
    "מזמינים עד חמישי בערב, איסוף בשישי בבוקר מהמשק. עד 20 הזמנות בכל מועד, "
    "מינימום הזמנה 80 ש״ח. ביטול עד 24 שעות לפני. כל מועד שעה. "
    "מספר עוסק 512345678. אפשר להזמין חלות ועוגות."
)
FRIDAY_MORNING = {
    "weekday": 5,
    "start_time": "08:00",
    "end_time": "12:00",
    "fulfilment": "pickup",
}


def _answer(**over):
    base = {
        "slot_cap": 20,
        "cancel_cutoff_hours": 24,
        "min_order": 80,
        "slot_minutes": 60,
        "lead_time_hours": None,
        "windows": [FRIDAY_MORNING],
        "product_ids": [],
    }
    base.update(over)
    return base


def _draft(data, source=TEXT):
    return form_filler.to_draft(form_filler.load_map("order_setup"), data, source, {})


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
    return calls


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


# --- the map ---------------------------------------------------------------


def test_the_map_never_drafts_the_business_id_or_switches_ordering_on():
    keys = {f["key"] for f in form_filler.load_map("order_setup")["fields"]}
    assert keys == {
        "slot_cap",
        "cancel_cutoff_hours",
        "min_order",
        "slot_minutes",
        "lead_time_hours",
        "windows",
        "product_ids",
    }
    schema = form_filler.schema(form_filler.load_map("order_setup"))
    assert schema["additionalProperties"] is False  # the model can't add one


def test_the_map_limits_are_the_save_routes_limits():
    """A draft value the settings save would refuse is never drafted."""
    f = {x["key"]: x for x in form_filler.load_map("order_setup")["fields"]}
    assert f["slot_cap"]["max"] == MAX_AUTO_CONFIRM_SLOT_CAP
    assert f["cancel_cutoff_hours"]["max"] == PRODUCT_ORDER_MAX_CUTOFF_HOURS
    assert f["lead_time_hours"]["max"] == PRODUCT_ORDER_MAX_LEAD_HOURS
    assert f["min_order"]["max"] * 100 == MAX_MIN_ORDER_AGOROT
    assert tuple(f["slot_minutes"]["allowed"]) == PRODUCT_ORDER_SLOT_MINUTES
    assert f["windows"]["max"] == PRODUCT_ORDER_MAX_WINDOWS


# --- the numbers -------------------------------------------------------------


def test_a_full_text_drafts_the_settings_and_the_window():
    draft = _draft(_answer())
    assert draft == {**_answer(), "windows": [FRIDAY_MORNING]}


def test_a_business_id_in_the_text_is_not_a_minimum_or_a_count():
    draft = _draft(_answer(min_order=512345678, slot_cap=512345678))
    assert (draft["min_order"], draft["slot_cap"]) == (None, None)


def test_a_slot_is_30_60_or_120_minutes_only():
    assert _draft(_answer(slot_minutes=45), "כל מועד 45 דקות")["slot_minutes"] is None
    assert _draft(_answer(slot_minutes=30), "כל מועד חצי שעה")["slot_minutes"] == 30
    assert _draft(_answer(slot_minutes=120), "כל מועד שעתיים")["slot_minutes"] == 120
    assert _draft(_answer(slot_minutes=90), "כל מועד 90 דקות")["slot_minutes"] is None


def test_hours_written_in_days_count():
    assert (
        _draft(_answer(lead_time_hours=48), "להזמין יומיים מראש")["lead_time_hours"]
        == 48
    )
    assert (
        _draft(_answer(lead_time_hours=72), "להזמין 3 ימים מראש")["lead_time_hours"]
        == 72
    )
    # «ביום שישי» names a day, not 24 hours.
    assert (
        _draft(_answer(lead_time_hours=24), "איסוף ביום שישי")["lead_time_hours"]
        is None
    )


def test_a_number_the_text_does_not_write_is_dropped():
    draft = _draft(_answer(slot_cap=30, cancel_cutoff_hours=12, min_order=100))
    assert (draft["slot_cap"], draft["cancel_cutoff_hours"], draft["min_order"]) == (
        None,
        None,
        None,
    )


# --- the windows -------------------------------------------------------------


def test_a_window_needs_its_day_named():
    sunday = {**FRIDAY_MORNING, "weekday": 0}
    assert _draft(_answer(windows=[sunday]))["windows"] == []


def test_a_window_needs_its_hours_written():
    evening = {**FRIDAY_MORNING, "start_time": "17:00", "end_time": "21:00"}
    assert _draft(_answer(windows=[evening]))["windows"] == []  # the text says בבוקר
    hours = "איסוף בשישי 9-12"
    nine = {**FRIDAY_MORNING, "start_time": "09:00"}
    assert _draft(_answer(windows=[nine]), hours)["windows"] == [nine]


def test_the_order_deadline_day_is_not_a_hand_over_day():
    """«עד חמישי בערב» closes orders; it opens no Thursday evening window."""
    thursday_evening = {
        **FRIDAY_MORNING,
        "weekday": 4,
        "start_time": "17:00",
        "end_time": "21:00",
    }
    assert _draft(_answer(windows=[thursday_evening]))["windows"] == []
    assert (
        _draft(_answer(windows=[thursday_evening]), "עד יום חמישי בערב")["windows"]
        == []
    )
    assert _draft(_answer(windows=[thursday_evening]), "איסוף בחמישי בערב")[
        "windows"
    ] == [thursday_evening]


def test_a_part_of_the_day_is_a_whole_word():
    noon = {**FRIDAY_MORNING, "start_time": "12:00", "end_time": "16:00"}
    afternoon = {**FRIDAY_MORNING, "start_time": "14:00", "end_time": "18:00"}
    evening = {**FRIDAY_MORNING, "start_time": "17:00", "end_time": "21:00"}
    source = "איסוף בשישי אחר הצהריים"
    assert _draft(_answer(windows=[noon]), source)["windows"] == []
    assert _draft(_answer(windows=[afternoon]), source)["windows"] == [afternoon]
    assert _draft(_answer(windows=[evening]), "איסוף בשישי במערב העיר")["windows"] == []


def test_a_clock_time_is_not_a_slot_length():
    """«בשעה 9» is when, not «כל מועד שעה»."""
    assert (
        _draft(_answer(slot_minutes=60), "איסוף בשישי בשעה 9")["slot_minutes"] is None
    )
    assert _draft(_answer(slot_minutes=60), "כל מועד שעה")["slot_minutes"] == 60


def test_a_window_that_ends_before_it_starts_is_dropped():
    backwards = {**FRIDAY_MORNING, "start_time": "12:00", "end_time": "08:00"}
    assert _draft(_answer(windows=[backwards]), "שישי 8-12")["windows"] == []


def test_overlapping_windows_keep_the_first_like_a_manual_save():
    source = "איסוף בשישי 8-12 ו-10-13"
    late = {**FRIDAY_MORNING, "start_time": "10:00", "end_time": "13:00"}
    assert _draft(_answer(windows=[FRIDAY_MORNING, late]), source)["windows"] == [
        FRIDAY_MORNING
    ]


def test_many_windows_on_many_days():
    source = "איסוף בשני ובחמישי 16:00-19:00, משלוח בשישי בבוקר"
    monday = {
        "weekday": 1,
        "start_time": "16:00",
        "end_time": "19:00",
        "fulfilment": "pickup",
    }
    thursday = {**monday, "weekday": 4}
    friday = {**FRIDAY_MORNING, "fulfilment": "delivery"}
    windows = [monday, thursday, friday]
    assert _draft(_answer(windows=windows), source)["windows"] == windows


def test_a_broken_window_is_dropped_not_guessed():
    bad = [
        {**FRIDAY_MORNING, "weekday": 7},
        {**FRIDAY_MORNING, "start_time": "8:00"},
        {**FRIDAY_MORNING, "fulfilment": "shipping"},
        "שישי בבוקר",
    ]
    assert _draft(_answer(windows=bad))["windows"] == []


# --- the route ---------------------------------------------------------------


def test_the_route_returns_a_draft_with_the_owners_products_only(
    client, db, monkeypatch
):
    _other, _ = _owner(db, ["סוד של מישהו אחר"])
    user, (challah, cake) = _owner(db, ["חלה", "עוגה"])
    calls = _patch(monkeypatch, _answer(product_ids=[1, 2, 9]))
    r = client.post(URL, json={"text": TEXT}, headers=auth_header(user))
    assert r.status_code == 200, r.text
    draft = r.json()["draft"]
    assert r.json()["form"] == "order_setup"
    assert sorted(draft["product_ids"]) == sorted([str(challah.id), str(cake.id)])
    assert draft["windows"] == [FRIDAY_MORNING]
    assert "512345678" not in json.dumps(draft)
    prompt = calls[0]["messages"][0]["content"]
    assert "סוד של מישהו אחר" not in prompt


def test_no_key_is_the_hebrew_503(client, db, monkeypatch):
    monkeypatch.setattr(form_filler, "_get_client", lambda: None)
    user, _ = _owner(db)
    r = client.post(URL, json={"text": TEXT}, headers=auth_header(user))
    assert r.status_code == 503
