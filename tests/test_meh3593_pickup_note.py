"""MEH-3593 — «הוראות איסוף», a pickup point's own instructions.

Stored on producer_locations.pickup_note, edited with the point in the
dashboard's locations editor (PUT /producers/me/locations/{id}), and read by
every pickup surface: the bag page (GET /rescue/offers/{id}), the reservation
email, and the public business payload (ProducerLocationOut). One column, so a
product order or a group buy at the same point reads the same text later.
"""

from conftest import auth_header, make_user
from test_rescue import _seed_offer, rescue_on, shop  # noqa: F401 — fixtures

# ruff: noqa: F811 — the fixtures imported above are test parameters by name.

NOTE = "נכנסים מהכניסה האחורית ואומרים את הקוד בקופה"


def _put(client, shop, body):
    loc = shop["location"]
    return client.put(
        f"/producers/me/locations/{loc.id}", json=body, headers=auth_header(shop["owner"])
    )


def _owner_rows(client, shop):
    return client.get("/producers/me/locations", headers=auth_header(shop["owner"])).json()


def test_a_note_is_saved_trimmed_and_read_back(client, db, rescue_on, shop):
    res = _put(client, shop, {"pickup_note": f"  {NOTE}  "})
    assert res.status_code == 200, res.text
    assert res.json()["pickup_note"] == NOTE
    rows = {r["id"]: r for r in _owner_rows(client, shop)}
    assert rows[str(shop["location"].id)]["pickup_note"] == NOTE


def test_a_put_without_the_field_keeps_the_note(client, db, rescue_on, shop):
    _put(client, shop, {"pickup_note": NOTE})
    res = _put(client, shop, {"phone": "0501234567"})
    assert res.status_code == 200, res.text
    assert res.json()["pickup_note"] == NOTE


def test_an_empty_note_clears_it(client, db, rescue_on, shop):
    _put(client, shop, {"pickup_note": NOTE})
    res = _put(client, shop, {"pickup_note": "   "})
    assert res.status_code == 200
    assert res.json()["pickup_note"] is None


def test_the_bounds_are_200_chars_and_3_letters(client, db, rescue_on, shop):
    assert _put(client, shop, {"pickup_note": "א" * 200}).status_code == 200
    assert _put(client, shop, {"pickup_note": "א" * 201}).status_code == 422
    assert _put(client, shop, {"pickup_note": "???"}).status_code == 422
    assert _put(client, shop, {"pickup_note": "אב 12"}).status_code == 422
    assert _put(client, shop, {"pickup_note": "אבג"}).status_code == 200


def test_a_note_is_one_line_so_the_email_cannot_fake_a_code_line(
    client, db, rescue_on, shop
):
    res = _put(client, shop, {"pickup_note": "דלת אחורית\nהקוד שלכם: 0000"})
    assert res.status_code == 200, res.text
    assert res.json()["pickup_note"] == "דלת אחורית הקוד שלכם: 0000"


def test_another_business_cannot_write_the_note(client, db, rescue_on, shop):
    stranger = make_user(db, email="note-stranger@example.com", role="producer")
    db.commit()
    res = client.put(
        f"/producers/me/locations/{shop['location'].id}",
        json={"pickup_note": NOTE},
        headers=auth_header(stranger),
    )
    assert res.status_code in (403, 404), res.text
    db.refresh(shop["location"])
    assert shop["location"].pickup_note is None


def test_the_bag_page_shows_its_points_note_and_null_without_one(
    client, db, rescue_on, shop
):
    offer = _seed_offer(db, shop["location"])
    assert client.get(f"/rescue/offers/{offer.id}").json()["pickup_note"] is None
    _put(client, shop, {"pickup_note": NOTE})
    assert client.get(f"/rescue/offers/{offer.id}").json()["pickup_note"] == NOTE


def test_the_reservation_email_carries_the_note(
    client, db, rescue_on, shop, monkeypatch
):
    sent = []
    monkeypatch.setattr(
        "app.services.rescue_emails.send_email",
        lambda to, subject, body, html=None, reply_to=None, test_cause=False: (
            sent.append({"body": body, "html": html})
        ),
    )
    _put(client, shop, {"pickup_note": "<b>דלת</b> אחורית"})
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
        lambda to, subject, body, html=None, reply_to=None, test_cause=False: (
            sent.append({"body": body, "html": html})
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


def test_the_typical_items_editor_no_longer_carries_a_note(client, db, rescue_on, shop):
    res = client.put(
        "/producers/me/rescue/typical-items",
        json={"items": ["לחם"], "pickup_note": NOTE},
        headers=auth_header(shop["owner"]),
    )
    assert res.status_code == 200, res.text
    assert "pickup_note" not in res.json()


def _second_point(db, shop, **over):
    from app.models import ProducerLocation

    loc = ProducerLocation(
        producer_id=shop["producer"].id,
        kind="pickup",
        is_primary=False,
        city="חיפה",
        label="נקודה בכרמל",
        address="מוריה 20",
        lat=32.78,
        lng=34.98,
        location_precision=over.get("location_precision", "exact"),
        pickup_note=over.get("pickup_note"),
    )
    db.add(loc)
    db.commit()
    return loc


def test_each_bag_reads_its_own_points_note(client, db, rescue_on, shop):
    # The case the old business-wide note could not tell apart.
    _put(client, shop, {"pickup_note": NOTE})
    other = _second_point(db, shop, pickup_note="מהחצר האחורית")
    here = _seed_offer(db, shop["location"])
    there = _seed_offer(db, other)
    assert client.get(f"/rescue/offers/{here.id}").json()["pickup_note"] == NOTE
    assert client.get(f"/rescue/offers/{there.id}").json()["pickup_note"] == "מהחצר האחורית"


def test_the_public_business_payload_carries_the_note_but_not_for_an_approximate_point(
    client, db, rescue_on, shop
):
    # MEH-829: an approximate point hides its street, so its note (which may
    # name it) is withheld too.
    _put(client, shop, {"pickup_note": NOTE})
    _second_point(db, shop, location_precision="approximate", pickup_note="הרצל 5 דלת אחורית")
    body = client.get(f"/producers/{shop['producer'].id}").json()
    notes = sorted((loc["precision"], loc.get("pickup_note")) for loc in body["locations"])
    assert notes == [("approximate", None), ("exact", NOTE)]
