"""MEH-3593 — «הוראות איסוף», the business's pickup note for its surprise bag.

Written once in the «בדרך כלל» editor (PUT /producers/me/rescue/typical-items),
shown on every bag's page (GET /rescue/offers/{id}) and in the reservation
email. A PUT that does not send the field leaves it alone, so the editor's
older shape cannot wipe a note.
"""

from conftest import auth_header, make_user
from test_rescue import _seed_offer, rescue_on, shop  # noqa: F401 — fixtures

# ruff: noqa: F811 — the fixtures imported above are test parameters by name.

URL = "/producers/me/rescue/typical-items"
NOTE = "נכנסים מהכניסה האחורית ואומרים את הקוד בקופה"


def _put(client, shop, body):
    return client.put(URL, json=body, headers=auth_header(shop["owner"]))


def test_a_note_is_saved_trimmed_and_read_back(client, db, rescue_on, shop):
    res = _put(client, shop, {"items": ["לחם"], "pickup_note": f"  {NOTE}  "})
    assert res.status_code == 200, res.text
    assert res.json()["pickup_note"] == NOTE
    got = client.get(URL, headers=auth_header(shop["owner"])).json()
    assert got["pickup_note"] == NOTE


def test_a_put_without_the_field_keeps_the_note(client, db, rescue_on, shop):
    _put(client, shop, {"items": ["לחם"], "pickup_note": NOTE})
    res = _put(client, shop, {"items": ["חלה"]})
    assert res.json()["items"] == ["חלה"]
    assert res.json()["pickup_note"] == NOTE


def test_an_empty_note_clears_it(client, db, rescue_on, shop):
    _put(client, shop, {"items": [], "pickup_note": NOTE})
    res = _put(client, shop, {"items": [], "pickup_note": "   "})
    assert res.status_code == 200
    assert res.json()["pickup_note"] is None


def test_a_note_without_letters_or_too_long_is_refused(client, db, rescue_on, shop):
    assert _put(client, shop, {"items": [], "pickup_note": "???"}).status_code == 422
    too_long = "א" * 201
    assert _put(client, shop, {"items": [], "pickup_note": too_long}).status_code == 422


def test_the_bag_page_shows_the_note_and_null_without_one(client, db, rescue_on, shop):
    offer = _seed_offer(db, shop["location"])
    assert client.get(f"/rescue/offers/{offer.id}").json()["pickup_note"] is None
    _put(client, shop, {"items": [], "pickup_note": NOTE})
    assert client.get(f"/rescue/offers/{offer.id}").json()["pickup_note"] == NOTE


def test_the_reservation_email_carries_the_note(client, db, rescue_on, shop, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.rescue_emails.send_email",
        lambda to, subject, body, html=None, reply_to=None, test_cause=False: sent.append(
            {"body": body, "html": html}
        ),
    )
    _put(client, shop, {"items": [], "pickup_note": "<b>דלת</b> אחורית"})
    offer = _seed_offer(db, shop["location"], qty_total=2)
    buyer = make_user(db, email="note-buyer@example.com")
    db.commit()

    res = client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(buyer),
    )

    assert res.status_code == 201, res.text
    assert "הוראות איסוף: <b>דלת</b> אחורית" in sent[0]["body"]
    # The note is the business's text: escaped in the HTML part.
    assert "&lt;b&gt;דלת&lt;/b&gt; אחורית" in sent[0]["html"]
    assert "<b>דלת</b>" not in sent[0]["html"]


def test_no_note_means_no_line_in_the_email(client, db, rescue_on, shop, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.rescue_emails.send_email",
        lambda to, subject, body, html=None, reply_to=None, test_cause=False: sent.append(
            {"body": body, "html": html}
        ),
    )
    offer = _seed_offer(db, shop["location"], qty_total=2)
    buyer = make_user(db, email="no-note@example.com")
    db.commit()
    client.post(
        "/rescue/orders",
        json={"offer_id": str(offer.id), "qty": 1},
        headers=auth_header(buyer),
    )
    assert "הוראות איסוף" not in sent[0]["body"]
    assert "הוראות איסוף" not in sent[0]["html"]
