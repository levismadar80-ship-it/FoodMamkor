"""MEH-3483 — «ספרו לנו על העסק»: free text in, a DRAFT of the page fields
out. The read saves nothing, and the draft never holds what the text does not
say. The model is never called: the client or `read_page` is patched.
"""

import json
import uuid
from types import SimpleNamespace

from conftest import auth_header, make_category, make_producer, make_user
from app.routers import page_fill as route
from app.schemas.page_fill import PageDraft
from app.services import page_filler

SOURCE = (
    "אנחנו מאפייה ביתית בחיפה, אופים לחמי מחמצת ועוגות. "
    "שולחים לחיפה ולקריית ביאליק. פתוחים א'-ה' 8 עד 18 ובשישי 8 עד 13. "
    "טלפון 054-1234567, אינסטגרם @bakery_haifa. מזמינים בוואטסאפ."
)


def _model_answer(**over):
    data = {
        "description": "מאפייה בחיפה שאופה לחמי מחמצת ועוגות.",
        "category_ids": [],
        "delivery_cities": ["חיפה", "קריית ביאליק"],
        "opening_hours": "Sun-Thu 08:00-18:00, Fri 08:00-13:00",
        "phone": "054-1234567",
        "instagram": "@bakery_haifa",
        "facebook": None,
        "website": None,
        "contact_email": None,
        "primary_contact_method": "whatsapp",
    }
    data.update(over)
    return data


# ── the draft filter: nothing the text does not say ─────────────────────────


def test_a_full_text_keeps_every_backed_field():
    d = page_filler.to_draft(_model_answer(category_ids=[7]), SOURCE, {7, 8})
    assert d.category_ids == [7]
    assert d.delivery_cities == ["חיפה", "קריית ביאליק"]
    assert d.opening_hours == "Sun-Thu 08:00-18:00, Fri 08:00-13:00"
    assert d.phone == "054-1234567" and d.instagram == "@bakery_haifa"
    assert d.primary_contact_method == "whatsapp"
    assert d.description == "מאפייה בחיפה שאופה לחמי מחמצת ועוגות."


def test_a_contact_detail_not_in_the_text_is_dropped():
    d = page_filler.to_draft(
        _model_answer(
            phone="052-9999999",
            website="https://bakery.co.il",
            contact_email="hi@bakery.co.il",
            facebook="bakeryhaifa",
        ),
        SOURCE,
        set(),
    )
    assert (d.phone, d.website, d.contact_email, d.facebook) == (None, None, None, None)


def test_a_phone_written_with_other_separators_still_matches():
    d = page_filler.to_draft(_model_answer(phone="0541234567"), SOURCE, set())
    assert d.phone == "0541234567"


def test_unknown_category_ids_and_cities_are_dropped():
    d = page_filler.to_draft(
        _model_answer(
            category_ids=[7, 99, "8"], delivery_cities=["חיפה", "עיר שלא קיימת", 3]
        ),
        SOURCE,
        {7, 8},
    )
    assert d.category_ids == [7]
    assert d.delivery_cities == ["חיפה"]


def test_hours_outside_the_grammar_are_dropped_not_guessed():
    for bad in ("א'-ה' 8-18", "Sun-Thu 8:00-18:00", "Sunday 08:00-18:00", ""):
        assert (
            page_filler.to_draft(
                _model_answer(opening_hours=bad), SOURCE, set()
            ).opening_hours
            is None
        )
    two = "Sun-Thu 08:00-12:00 16:00-19:00, Fri 08:00-13:00"
    split_day = SOURCE + " בימי חול הפסקה מ-12 עד 16 ונסגרים ב-19."
    assert (
        page_filler.to_draft(
            _model_answer(opening_hours=two), split_day, set()
        ).opening_hours
        == two
    )


def test_hours_the_text_does_not_give_are_dropped():
    # Grammatical, but 07 and 22 are not in the text; 18-08 runs backwards.
    for invented in ("Sun-Thu 07:00-22:00", "Sun 18:00-08:00", "Sun 99:00-99:30"):
        assert (
            page_filler.to_draft(
                _model_answer(opening_hours=invented), SOURCE, set()
            ).opening_hours
            is None
        )
    # «6 בערב» backs 18:00.
    evening = "פתוחים מ-8 בבוקר עד 6 בערב, טלפון 054-1234567"
    assert (
        page_filler.to_draft(
            _model_answer(opening_hours="Sun 08:00-18:00"), evening, set()
        ).opening_hours
        == "Sun 08:00-18:00"
    )


def test_a_city_the_text_does_not_name_is_dropped():
    d = page_filler.to_draft(
        _model_answer(delivery_cities=["חיפה", "עכו"]), SOURCE, set()
    )
    assert d.delivery_cities == ["חיפה"]


def test_contact_details_must_stand_on_their_own_and_have_their_shape():
    text = (
        "המאפייה שלנו, bakery לכל דבר. כתבו ל-hi@bakeryhaifa.co.il "
        "או היכנסו ל-www.bakery-haifa.co.il ולאינסטגרם instagram.com/bakery_haifa"
    )
    d = page_filler.to_draft(
        _model_answer(
            phone=None,
            instagram="bakery",
            website="bakeryhaifa.co.il",
            contact_email="hi@bakeryhaifa.co.il",
            facebook="not a link",
        ),
        text,
        set(),
    )
    # "bakery" is prose, not a handle; the site is a piece of the email.
    assert d.instagram is None and d.website is None and d.facebook is None
    assert d.contact_email == "hi@bakeryhaifa.co.il"
    d2 = page_filler.to_draft(
        _model_answer(
            phone=None, instagram="bakery_haifa", website="www.bakery-haifa.co.il"
        ),
        text,
        set(),
    )
    # A bare domain is saved with https:// (the edit form rejects it without).
    assert d2.instagram == "@bakery_haifa"
    assert d2.website == "https://www.bakery-haifa.co.il"


def test_a_claim_the_text_does_not_make_is_cut_from_the_description():
    d = page_filler.to_draft(
        _model_answer(description="מאפייה בחיפה. הכל כשר למהדרין."), SOURCE, set()
    )
    assert d.description == "מאפייה בחיפה."


def test_an_unknown_contact_method_is_dropped():
    d = page_filler.to_draft(
        _model_answer(primary_contact_method="pigeon"), SOURCE, set()
    )
    assert d.primary_contact_method is None


def test_an_empty_answer_is_an_empty_draft():
    d = page_filler.to_draft({}, SOURCE, set())
    assert d == PageDraft()


# ── the model call ───────────────────────────────────────────────────────────


class _FakeClient:
    def __init__(self, text, stop="end_turn"):
        self.text, self.stop, self.kwargs = text, stop, None
        self.messages = self

    def create(self, **kwargs):
        self.kwargs = kwargs
        block = SimpleNamespace(type="text", text=self.text)
        return SimpleNamespace(stop_reason=self.stop, content=[block])


def test_the_prompt_carries_the_category_list_and_the_text_as_data(monkeypatch):
    fake = _FakeClient(json.dumps(_model_answer(category_ids=[3])))
    monkeypatch.setattr(page_filler, "_get_client", lambda: fake)
    d = page_filler.read_page("טקסט <b>של</b> בעלת העסק", [(3, "מאפים")])
    prompt = fake.kwargs["messages"][0]["content"]
    assert "  3: מאפים" in prompt
    assert "<owner_text>טקסט  b של /b  בעלת העסק</owner_text>" in prompt
    assert fake.kwargs["output_config"]["format"]["type"] == "json_schema"
    assert d is not None and d.category_ids == [3]


def test_no_key_a_cut_off_or_a_bad_answer_is_none(monkeypatch):
    monkeypatch.setattr(page_filler, "_get_client", lambda: None)
    assert page_filler.read_page(SOURCE, []) is None
    monkeypatch.setattr(
        page_filler, "_get_client", lambda: _FakeClient("{}", stop="max_tokens")
    )
    assert page_filler.read_page(SOURCE, []) is None
    monkeypatch.setattr(page_filler, "_get_client", lambda: _FakeClient("not json"))
    assert page_filler.read_page(SOURCE, []) is None


# ── the routes ───────────────────────────────────────────────────────────────

URL = "/producers/me/page-fill/read"


def _owner(db):
    producer = make_producer(db)
    owner = make_user(db, email=f"o{uuid.uuid4().hex[:8]}@example.com", role="producer")
    owner.producer_id = producer.id
    db.commit()
    return owner, producer


def _patch_read(monkeypatch, draft=PageDraft(description="מאפייה בחיפה.")):
    seen = {}

    def fake(text, categories):
        seen["text"], seen["categories"] = text, categories
        return draft

    monkeypatch.setattr(route, "read_page", fake)
    return seen


def test_owner_gets_a_draft_and_nothing_is_saved(client, db, monkeypatch):
    owner, producer = _owner(db)
    cat = make_category(db, name="מאפים")
    before = producer.description
    seen = _patch_read(monkeypatch)
    r = client.post(URL, json={"text": SOURCE}, headers=auth_header(owner))
    assert r.status_code == 200, r.text
    assert r.json()["draft"]["description"] == "מאפייה בחיפה."
    assert seen["text"] == SOURCE and (cat.id, "מאפים") in seen["categories"]
    db.refresh(producer)
    assert producer.description == before


def test_a_too_short_text_is_a_hebrew_422(client, db, monkeypatch):
    owner, _ = _owner(db)
    _patch_read(monkeypatch)
    r = client.post(URL, json={"text": "  מאפייה  "}, headers=auth_header(owner))
    assert r.status_code == 422 and "כתבו עוד כמה מילים" in r.text


def test_only_an_owner_reaches_the_owner_route(client, db, monkeypatch):
    _patch_read(monkeypatch)
    assert client.post(URL, json={"text": SOURCE}).status_code == 401
    consumer = make_user(db, email=f"c{uuid.uuid4().hex[:6]}@example.com")
    assert (
        client.post(
            URL, json={"text": SOURCE}, headers=auth_header(consumer)
        ).status_code
        == 403
    )


def test_no_answer_is_a_hebrew_503(client, db, monkeypatch):
    owner, _ = _owner(db)
    monkeypatch.setattr(page_filler, "_get_client", lambda: None)
    r = client.post(URL, json={"text": SOURCE}, headers=auth_header(owner))
    assert r.status_code == 503 and r.json()["detail"] == route.UNAVAILABLE_DETAIL


def test_admin_route_reads_for_an_existing_business_only(client, db, monkeypatch):
    _patch_read(monkeypatch)
    admin = make_user(db, email=f"ad{uuid.uuid4().hex[:6]}@example.com", role="admin")
    producer = make_producer(db)
    ok = client.post(
        f"/admin/producers/{producer.id}/page-fill/read",
        json={"text": SOURCE},
        headers=auth_header(admin),
    )
    assert ok.status_code == 200, ok.text
    missing = client.post(
        f"/admin/producers/{uuid.uuid4()}/page-fill/read",
        json={"text": SOURCE},
        headers=auth_header(admin),
    )
    assert missing.status_code == 404 and missing.json()["detail"] == "בית העסק לא נמצא"
    owner, _ = _owner(db)
    denied = client.post(
        f"/admin/producers/{producer.id}/page-fill/read",
        json={"text": SOURCE},
        headers=auth_header(owner),
    )
    assert denied.status_code == 403
