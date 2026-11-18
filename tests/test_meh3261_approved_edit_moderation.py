"""MEH-3261 (grill-retro D11) — an APPROVED business's text and photo edits.

| business | change                              | AI check | ping                      |
|----------|-------------------------------------|----------|---------------------------|
| approved | description changed                 | yes      | ONE «עדכן תוכן» — תיאור   |
| approved | same text re-sent (after strip)     | no       | none                      |
| approved | images changed                      | no       | ONE — תמונות              |
| approved | AI FLAGGED                          | yes      | suffix « — טקסט סומן ע״י AI» |
| approved | AI REJECTED                         | yes      | none — 422, nothing saved |
| approved | AI fail-open (None)                 | yes      | ping, saved, no flag      |
| pending  | description changed                 | no       | none                      |
| approved | product created / renamed, FLAGGED  | yes      | «מוצרים — טקסט סומן ע״י AI» |
| approved | product renamed, APPROVED           | yes      | none                      |
| approved | product REJECTED                    | yes      | 422, product unchanged    |
"""

from unittest.mock import patch

import pytest

from app.services import approved_edit_moderation as mod
from tests.conftest import auth_header, make_producer, make_user

MODERATE = "app.services.approved_edit_moderation.moderate"
NOTIFY = "app.services.approved_edit_moderation.notify_admin_content_edit"


def _owner(db, status="approved"):
    producer = make_producer(db, name="משק התוכן", status=status)
    producer.description = "תיאור ישן של המשק"
    producer.images = ["https://res.cloudinary.com/x/image/upload/a.jpg"]
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def _put(client, user, body):
    return client.put("/producers/me", json=body, headers=auth_header(user))


def _calls(moderate_return="APPROVED"):
    return patch(MODERATE, return_value=moderate_return), patch(NOTIFY)


def test_changed_description_is_checked_and_pings_once(client, db):
    user, producer = _owner(db)
    m, n = _calls()
    with m as ai, n as ping:
        r = _put(client, user, {"description": "תיאור חדש לגמרי של המשק"})
    assert r.status_code == 200, r.text
    ai.assert_called_once_with(
        {"description": "תיאור חדש לגמרי של המשק"}, "producer_content"
    )
    ping.assert_called_once_with("משק התוכן", ["description"], False, test_cause=False)


def test_unchanged_text_after_strip_is_neither_checked_nor_pinged(client, db):
    user, _ = _owner(db)
    m, n = _calls()
    with m as ai, n as ping:
        r = _put(client, user, {"description": "  תיאור ישן של המשק  "})
    assert r.status_code == 200, r.text
    ai.assert_not_called()
    ping.assert_not_called()


def test_images_change_pings_without_ai(client, db):
    user, _ = _owner(db)
    new = ["https://res.cloudinary.com/x/image/upload/b.jpg"]
    m, n = _calls()
    with m as ai, n as ping, patch("app.cloudinary_utils.destroy_removed_images"):
        r = _put(client, user, {"images": new})
    assert r.status_code == 200, r.text
    ai.assert_not_called()
    ping.assert_called_once_with("משק התוכן", ["images"], False, test_cause=False)


def test_flagged_text_saves_and_marks_the_ping(client, db):
    user, producer = _owner(db)
    m, n = _calls("FLAGGED")
    with m, n as ping:
        r = _put(client, user, {"owner_bio": "אני מבשלת מגיל חמש ומרפאת הכל"})
    assert r.status_code == 200, r.text
    ping.assert_called_once_with("משק התוכן", ["owner_bio"], True, test_cause=False)
    db.refresh(producer)
    assert producer.owner_bio == "אני מבשלת מגיל חמש ומרפאת הכל"


def test_rejected_text_is_422_and_nothing_is_saved(client, db):
    user, producer = _owner(db)
    m, n = _calls("REJECTED")
    with m, n as ping:
        r = _put(client, user, {"description": "טקסט פוגעני", "phone": "0501112233"})
    assert r.status_code == 422
    assert r.json()["detail"] == mod.REJECTED_DETAIL
    ping.assert_not_called()
    db.refresh(producer)
    assert producer.description == "תיאור ישן של המשק"
    assert producer.phone != "0501112233", "the whole PUT is refused"


def test_ai_fail_open_saves_and_pings_without_flag(client, db):
    user, producer = _owner(db)
    m, n = _calls(None)
    with m, n as ping:
        r = _put(client, user, {"short_description": "ירקות אורגניים מהשדה"})
    assert r.status_code == 200, r.text
    ping.assert_called_once_with(
        "משק התוכן", ["short_description"], False, test_cause=False
    )


def test_pending_business_is_not_checked_or_pinged(client, db):
    user, _ = _owner(db, status="pending")
    m, n = _calls("REJECTED")
    with m as ai, n as ping:
        r = _put(client, user, {"description": "תיאור חדש לגמרי של המשק"})
    assert r.status_code == 200, r.text
    ai.assert_not_called()
    ping.assert_not_called()


def _product(client, user, **over):
    body = {"name": "לחם שאור", "price_min": 20, **over}
    return client.post("/producers/me/products", json=body, headers=auth_header(user))


def test_product_create_flagged_pings_products(client, db):
    user, _ = _owner(db)
    m, n = _calls("FLAGGED")
    with m as ai, n as ping, patch("app.routers.alerts.fire_alerts"):
        r = _product(client, user)
    assert r.status_code == 201, r.text
    ai.assert_called_once_with({"name": "לחם שאור"}, "product_content")
    ping.assert_called_once_with("משק התוכן", ["products"], True, test_cause=False)


def test_product_rename_approved_does_not_ping(client, db):
    user, _ = _owner(db)
    with (
        patch(MODERATE, return_value="APPROVED"),
        patch("app.routers.alerts.fire_alerts"),
    ):
        pid = _product(client, user).json()["id"]
    m, n = _calls("APPROVED")
    with m as ai, n as ping:
        r = client.put(
            f"/producers/me/products/{pid}",
            json={"name": "לחם שאור כפרי"},
            headers=auth_header(user),
        )
    assert r.status_code == 200, r.text
    ai.assert_called_once_with({"name": "לחם שאור כפרי"}, "product_content")
    ping.assert_not_called()


def test_product_rejected_is_422_and_unchanged(client, db):
    user, _ = _owner(db)
    with (
        patch(MODERATE, return_value="APPROVED"),
        patch("app.routers.alerts.fire_alerts"),
    ):
        pid = _product(client, user).json()["id"]
    with patch(MODERATE, return_value="REJECTED"), patch(NOTIFY):
        r = client.put(
            f"/producers/me/products/{pid}",
            json={"description": "טקסט פוגעני"},
            headers=auth_header(user),
        )
    assert r.status_code == 422
    listed = client.get("/producers/me/products", headers=auth_header(user)).json()
    assert listed[0]["description"] is None


def test_message_copy():
    assert (
        mod.content_edit_message("משק", ["description", "images"], True)
        == "📝 עסק מאושר עדכן תוכן: משק — תיאור · תמונות — טקסט סומן ע״י AI"
    )
    assert mod.content_edit_message("משק", ["products"], False) == (
        "📝 עסק מאושר עדכן תוכן: משק — מוצרים"
    )


@pytest.mark.parametrize("raw", ["not json", '{"status": "WAT"}'])
def test_moderate_fails_open_on_bad_output(monkeypatch, raw):
    class _Block:
        type = "text"
        text = raw

    class _Msg:
        stop_reason = "end_turn"
        content = [_Block()]

    class _Client:
        class messages:  # noqa: N801
            @staticmethod
            def create(**_):
                return _Msg()

    seen = []
    monkeypatch.setattr(mod, "_get_client", lambda: _Client())
    monkeypatch.setattr(mod, "report_fail_open", lambda s, r: seen.append(s))
    assert mod.moderate({"description": "x"}, "producer_content") is None
    assert seen == ["producer_content"]


def test_product_create_rejected_is_422_and_no_row(client, db):
    user, _ = _owner(db)
    with patch(MODERATE, return_value="REJECTED"), patch(NOTIFY) as ping:
        r = _product(client, user, name="מוצר פוגעני")
    assert r.status_code == 422
    assert client.get("/producers/me/products", headers=auth_header(user)).json() == []
    ping.assert_not_called()


def test_pending_business_product_is_not_checked(client, db):
    user, _ = _owner(db, status="pending")
    m, n = _calls("REJECTED")
    with m as ai, n as ping, patch("app.routers.alerts.fire_alerts"):
        r = _product(client, user)
    assert r.status_code == 201, r.text
    ai.assert_not_called()
    ping.assert_not_called()


def test_unchanged_product_name_makes_no_ai_call(client, db):
    user, _ = _owner(db)
    with (
        patch(MODERATE, return_value="APPROVED"),
        patch("app.routers.alerts.fire_alerts"),
    ):
        pid = _product(client, user).json()["id"]
    with patch(MODERATE) as ai, patch(NOTIFY):
        r = client.put(
            f"/producers/me/products/{pid}",
            json={"name": " לחם שאור "},
            headers=auth_header(user),
        )
    assert r.status_code == 200, r.text
    ai.assert_not_called()


def test_product_ingredients_are_checked(client, db):
    user, _ = _owner(db)
    with (
        patch(MODERATE, return_value="APPROVED"),
        patch("app.routers.alerts.fire_alerts"),
    ):
        pid = _product(client, user).json()["id"]
    with patch(MODERATE, return_value="APPROVED") as ai, patch(NOTIFY):
        r = client.put(
            f"/producers/me/products/{pid}",
            json={"ingredients": "קמח, מים, מלח"},
            headers=auth_header(user),
        )
    assert r.status_code == 200, r.text
    ai.assert_called_once_with({"ingredients": "קמח, מים, מלח"}, "product_content")


def test_reordered_images_do_not_ping(client, db):
    user, producer = _owner(db)
    producer.images = [
        "https://res.cloudinary.com/x/image/upload/a.jpg",
        "https://res.cloudinary.com/x/image/upload/b.jpg",
    ]
    db.commit()
    with patch(NOTIFY) as ping:
        r = _put(client, user, {"images": list(reversed(producer.images))})
    assert r.status_code == 200, r.text
    ping.assert_not_called()


def _fake_client(stop_reason="end_turn", text="", sink=None):
    class _Block:
        type = "text"

    _Block.text = text

    class _Msg:
        content = [_Block()]

    _Msg.stop_reason = stop_reason

    class _Client:
        class messages:  # noqa: N801
            @staticmethod
            def create(**kwargs):
                if sink is not None:
                    sink.append(kwargs)
                return _Msg()

    return _Client()


def test_refusal_is_flagged(monkeypatch):
    monkeypatch.setattr(mod, "_get_client", lambda: _fake_client("refusal"))
    assert mod.moderate({"description": "x"}, "producer_content") == "FLAGGED"


def test_lowercase_status_is_parsed_and_call_is_bounded(monkeypatch):
    sent = []
    fake = _fake_client(text='{"status": "rejected"}', sink=sent)
    monkeypatch.setattr(mod, "_get_client", lambda: fake)
    assert mod.moderate({"description": "x"}, "producer_content") == "REJECTED"
    assert sent[0]["timeout"] == 10.0


def test_test_cause_skips_every_send(monkeypatch):
    monkeypatch.setattr(mod.settings, "admin_email", "a@example.com")
    monkeypatch.setattr(mod.settings, "admin_whatsapp_to", "+972500000000")
    with patch.object(mod, "send_email") as mail, patch.object(mod, "send_text") as wa:
        mod.notify_admin_content_edit("משק", ["description"], True, test_cause=True)
    mail.assert_not_called()
    wa.assert_not_called()


@pytest.mark.parametrize(
    ("flagged", "subject"),
    [
        (False, "מהמקור - משק עדכן תוכן"),
        (True, "מהמקור - משק עדכן תוכן (סומן ע״י AI)"),
    ],
)
def test_email_subject(monkeypatch, flagged, subject):
    monkeypatch.setattr(mod.settings, "admin_email", "a@example.com")
    monkeypatch.setattr(mod.settings, "admin_whatsapp_to", "")
    with patch.object(mod, "send_email") as mail:
        mod.notify_admin_content_edit("משק", ["description"], flagged)
    assert mail.call_args.args[1] == subject
