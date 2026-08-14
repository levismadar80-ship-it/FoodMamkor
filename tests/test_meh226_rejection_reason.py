"""MEH-226 — the admin rejection reason is PERSISTED, not only emailed.

Before this ticket `reject_producer` (admin.py:777) flipped
`producers.status` to "rejected" and put the admin's reason in the email
body only. `producers.rejection_reason` stayed NULL, so the rejected owner's
dashboard banner — which reads `producer_rejection_reason` off
`GET /auth/me` (auth.py:1095-1101) — rendered "נדחה" with no reason.

Contract exercised here:

| body                                   | status | rejection_reason           |
|----------------------------------------|--------|----------------------------|
| {preset_key: "missing_docs"}           | 200    | the preset label           |
| {preset_key: "missing_docs", reason:x} | 200    | "<label> — x"              |
| {preset_key: "other", reason: x}       | 200    | x alone (label is a UI     |
|                                        |        | affordance, not a reason)  |
| {preset_key: "other"} (no free text)   | 400    | unchanged — NOT rejected   |
| {preset_key: "bogus"}                  | 400    | unchanged — NOT rejected   |
| {reason: x} (pre-MEH-226 body)         | 200    | x                          |

Mirrors tests/test_producer_request_changes.py: pure HTTP/DB, with
`_send_notification_email` monkeypatched to assert the email carries the same
composed string that landed in the column (the two must not drift).
"""
import app.routers.admin as admin_module
from app.routers.admin import PRODUCER_REJECTION_PRESETS
from conftest import auth_header, make_producer, make_user

FREE_TEXT = "הרישיון שהועלה פג תוקף ביוני"


def _admin(db):
    return make_user(db, role="admin")


def _reject(client, producer_id, admin, **body):
    return client.post(
        f"/admin/producers/{producer_id}/reject",
        json=body,
        headers=auth_header(admin),
    )


# --- persistence: the bug this ticket exists to fix -------------------------


def test_reject_persists_preset_label_to_the_column(client, db):
    """The regression guard. Against the pre-MEH-226 handler this assertion
    fails on `rejection_reason is None` while every other assertion in the
    file still passes — the status flip and the email were never broken."""
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), preset_key="missing_docs")
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.status == "rejected"
    assert producer.rejection_reason == PRODUCER_REJECTION_PRESETS["missing_docs"]
    # the response echoes what was stored (spec: 200 {id, status, rejection_reason})
    assert resp.json()["rejection_reason"] == producer.rejection_reason
    assert resp.json()["status"] == "rejected"


def test_reject_joins_preset_label_with_free_text(client, db):
    producer = make_producer(db, status="pending")
    resp = _reject(
        client, producer.id, _admin(db), preset_key="missing_docs", reason=FREE_TEXT
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    expected = f"{PRODUCER_REJECTION_PRESETS['missing_docs']} — {FREE_TEXT}"
    assert producer.rejection_reason == expected


def test_reject_other_persists_the_free_text_alone(client, db):
    """"אחר (פירוט חופשי)" describes the input box, not a reason — prefixing it
    would put it in a business owner's inbox."""
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), preset_key="other", reason=FREE_TEXT)
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.rejection_reason == FREE_TEXT


def test_reject_trims_free_text(client, db):
    producer = make_producer(db, status="pending")
    resp = _reject(
        client, producer.id, _admin(db), preset_key="other", reason=f"  {FREE_TEXT}  "
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.rejection_reason == FREE_TEXT


def test_reject_without_preset_still_persists_the_bare_reason(client, db):
    """Back-compat: the pre-MEH-226 body was `{"reason": "..."}` with no
    preset. It must keep working AND now persist."""
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), reason=FREE_TEXT)
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.rejection_reason == FREE_TEXT


def test_reject_with_no_body_at_all_leaves_the_column_null(client, db):
    """An empty reason stores NULL, not "" — the dashboard banner keys off
    truthiness and an empty string would render an empty paragraph."""
    producer = make_producer(db, status="pending")
    resp = client.post(
        f"/admin/producers/{producer.id}/reject", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert producer.status == "rejected"
    assert producer.rejection_reason is None


# --- validation: a bad body must not leave a half-decided producer ----------


def test_other_without_free_text_is_400_and_does_not_reject(client, db):
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), preset_key="other")
    assert resp.status_code == 400, resp.text

    db.refresh(producer)
    assert producer.status == "pending", "a 400 must not have flipped the status"
    assert producer.rejection_reason is None


def test_other_with_whitespace_only_free_text_is_400(client, db):
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), preset_key="other", reason="   ")
    assert resp.status_code == 400, resp.text

    db.refresh(producer)
    assert producer.status == "pending"


def test_unknown_preset_key_is_400_and_does_not_reject(client, db):
    producer = make_producer(db, status="pending")
    resp = _reject(client, producer.id, _admin(db), preset_key="definitely_not_a_preset")
    assert resp.status_code == 400, resp.text

    db.refresh(producer)
    assert producer.status == "pending", "a 400 must not have flipped the status"
    assert producer.rejection_reason is None


# --- the reason reaches the owner: email + GET /auth/me ---------------------


def test_email_body_carries_the_same_string_that_was_persisted(client, db, monkeypatch):
    """One composed string, three consumers (column, email, admin WhatsApp).
    Asserting the column and the email agree is what stops them drifting."""
    sent = {}

    def _capture(to_email, subject, body):
        sent["to"] = to_email
        sent["body"] = body

    monkeypatch.setattr(admin_module, "_send_notification_email", _capture)

    producer = make_producer(db, status="pending")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = _reject(
        client, producer.id, _admin(db), preset_key="missing_image", reason=FREE_TEXT
    )
    assert resp.status_code == 200, resp.text

    db.refresh(producer)
    assert sent["to"] == owner.email
    assert producer.rejection_reason in sent["body"], sent["body"]


def test_rejected_owner_sees_the_reason_on_auth_me(client, db):
    """End-to-end for the surface the ticket is about: the dashboard banner
    reads `producer_rejection_reason` from GET /auth/me."""
    producer = make_producer(db, status="pending")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    resp = _reject(
        client, producer.id, _admin(db), preset_key="incomplete_info", reason=FREE_TEXT
    )
    assert resp.status_code == 200, resp.text

    me = client.get("/auth/me", headers=auth_header(owner))
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["producer_status"] == "rejected"
    expected = f"{PRODUCER_REJECTION_PRESETS['incomplete_info']} — {FREE_TEXT}"
    assert body["producer_rejection_reason"] == expected


# --- the email's recovery line must stay true -------------------------------


def test_rejected_owner_can_still_edit_her_details(client, db):
    """The approved rejection email says "אפשר לתקן את הפרטים בלוח הבקרה".

    That sentence is a claim about the product, and nothing else in the repo
    holds it up: `require_producer` (auth.py:363-368) gates on role only and
    `update_my_producer` (producer_me.py:379-381) checks status nowhere, so
    the door is open by absence rather than by decision. If someone later adds
    a status gate to the owner PUT — a reasonable-looking change — the email
    starts telling rejected business owners to do something that 403s, with no
    other test going red.

    Deliberately NOT asserting the copy string itself: that would only prove
    the sentence exists. This asserts the capability the sentence promises.
    """
    producer = make_producer(db, status="pending")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    assert (
        _reject(client, producer.id, _admin(db), preset_key="missing_image").status_code
        == 200
    )
    db.refresh(producer)
    assert producer.status == "rejected"

    resp = client.put(
        "/producers/me",
        json={"description": "עדכנו את התיאור אחרי הדחייה כדי לתקן את מה שחסר"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 200, (
        "a rejected owner must still be able to edit — the rejection email "
        f"tells her to. Got {resp.status_code}: {resp.text}"
    )
    db.refresh(producer)
    assert producer.description == "עדכנו את התיאור אחרי הדחייה כדי לתקן את מה שחסר"
    assert producer.status == "rejected", "editing must not change the status"


def test_retired_resubmit_promise_is_not_in_the_email(client, db):
    """The RETIRED line, kept as a named string so it cannot quietly return.

    "הגישי שוב מהדף האישי" was the ticket's original copy and it promises a
    flow that 409s (producer_me.py:1392). This is not a restatement of the
    body — it is the one assertion that goes red if a future edit reinstates
    the sentence, which is exactly the change nothing else would catch."""
    body = admin_module._producer_rejected_body("מאפיית הדגן", "מסמכים חסרים")

    assert "להגיש שוב" not in body, body
    assert "הדף האישי" not in body, body
    assert "אפשר לתקן את הפרטים בלוח הבקרה" in body, body


# --- the presets endpoint the admin UI consumes -----------------------------


def test_presets_endpoint_returns_the_five_labels_in_order(client, db):
    resp = client.get(
        "/admin/producers/rejection-presets", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text

    rows = resp.json()
    assert [r["key"] for r in rows] == [
        "missing_docs",
        "missing_image",
        "incomplete_info",
        "not_eligible",
        "other",
    ]
    # verbatim from the MEH-226 spec — the frontend renders these, so a typo
    # here is a typo in the admin UI and in the owner's email at once.
    assert [r["label"] for r in rows] == [
        "מסמכים חסרים / לא קריאים",
        "תמונה ראשית חסרה",
        "מידע עסקי לא מלא (כתובת / טלפון / תיאור)",
        "עסק לא עומד בתנאי הפלטפורמה",
        "אחר (פירוט חופשי)",
    ]


def test_presets_endpoint_is_admin_only(client, db):
    consumer = make_user(db, role="consumer")
    resp = client.get(
        "/admin/producers/rejection-presets", headers=auth_header(consumer)
    )
    assert resp.status_code == 403, resp.text


def test_presets_route_is_not_shadowed_by_a_producer_id_route(client, db):
    """`rejection-presets` sits under /admin/producers/ — if a
    GET /admin/producers/{id} route were ever added ABOVE it, FastAPI would
    match this path as a UUID param and 422. This asserts it still resolves."""
    resp = client.get(
        "/admin/producers/rejection-presets", headers=auth_header(_admin(db))
    )
    assert resp.status_code == 200, resp.text
