"""MEH-767 (HOT-001) — owner-scoped response model for /producers/me.

Closes a CRITICAL data leak: GET/PUT /producers/me previously returned
ProducerAdminOut, which serialized the admin-only AI risk surface
(risk_score + risk_reasoning, MEH-509 PR3) back to the very producer
being scored. The endpoints now return ProducerOwnerOut.

These tests pin the contract:
  - GET + PUT /producers/me must NOT contain risk_score / risk_reasoning
    (nor the admin-only declaration audit trail declared_at /
    declaration_version).
  - The admin route (/admin/producers) STILL exposes risk_score /
    risk_reasoning — the fix must not regress admin visibility.
  - GET /producers/me STILL exposes producer_license_number — owners see
    and edit the value they themselves submitted (MEH-530). The leak fix
    must not strip the owner's own data.

Pure HTTP/DB tests, mirroring tests/test_producer_declaration.py. No
Anthropic/email assertions (those layers fail-open in the test config).
"""
from conftest import (
    auth_header,
    make_producer,
    make_user,
    valid_producer_register_payload,
)


# admin-only fields that ProducerOwnerOut must NOT serialize back to the
# producer being scored / declared.
_ADMIN_ONLY_FIELDS = (
    "risk_score",
    "risk_reasoning",
    "declared_at",
    "declaration_version",
)


def _make_owner(db, *, email):
    """Create an approved producer + the producer-role user that owns it,
    with risk fields populated so a leak would actually show a value."""
    producer = make_producer(db, name="חוות הבעלים", status="approved")
    producer.risk_score = 73
    producer.risk_reasoning = "סימני סיכון פנימיים — לאדמין בלבד"
    producer.producer_license_number = "12345678"
    db.commit()
    db.refresh(producer)
    user = make_user(db, email=email, role="producer")
    user.producer_id = producer.id
    db.commit()
    return producer, user


def test_get_producers_me_omits_admin_only_fields(client, db):
    _, user = _make_owner(db, email="owner-get@example.com")
    resp = client.get("/producers/me", headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for field in _ADMIN_ONLY_FIELDS:
        assert field not in body, f"/producers/me GET leaked admin field: {field}"


def test_put_producers_me_omits_admin_only_fields(client, db):
    _, user = _make_owner(db, email="owner-put@example.com")
    # Minimal valid PUT — a name edit is enough to exercise the response model.
    resp = client.put(
        "/producers/me",
        json={"name": "חוות הבעלים המעודכנת"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for field in _ADMIN_ONLY_FIELDS:
        assert field not in body, f"/producers/me PUT leaked admin field: {field}"


def test_get_producers_me_keeps_owner_license(client, db):
    # MEH-530 must not regress: the owner still sees their own license number.
    _, user = _make_owner(db, email="owner-license@example.com")
    resp = client.get("/producers/me", headers=auth_header(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "producer_license_number" in body
    assert body["producer_license_number"] == "12345678"


def test_admin_route_still_exposes_risk_fields(client, db):
    # The fix is scoped to the owner endpoint — admin visibility is intact.
    producer = make_producer(db, name="חוות אדמין", status="approved")
    producer.risk_score = 42
    producer.risk_reasoning = "נראה תקין"
    db.commit()
    admin = make_user(db, email="admin-risk@example.com", role="admin")
    resp = client.get("/admin/producers", headers=auth_header(admin))
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) >= 1
    row = next((r for r in rows if r.get("risk_score") == 42), rows[0])
    assert "risk_score" in row
    assert "risk_reasoning" in row


# --- MEH-296: contact-channel columns + boundary validators ---


def test_put_producers_me_persists_contact_channels(client, db):
    # Owner can set the new facebook + external_order_form channels; both
    # round-trip through PUT response and a follow-up GET.
    _, user = _make_owner(db, email="owner-channels@example.com")
    resp = client.put(
        "/producers/me",
        json={
            "facebook": "https://facebook.com/mybiz",
            "external_order_form": "https://myshop.etsy.com/order",
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["facebook"] == "https://facebook.com/mybiz"
    assert body["external_order_form"] == "https://myshop.etsy.com/order"
    got = client.get("/producers/me", headers=auth_header(user)).json()
    assert got["facebook"] == "https://facebook.com/mybiz"
    assert got["external_order_form"] == "https://myshop.etsy.com/order"


def test_put_producers_me_rejects_bad_contact_method(client, db):
    # primary_contact_method is guarded to the 7-value set → 422.
    _, user = _make_owner(db, email="owner-badmethod@example.com")
    resp = client.put(
        "/producers/me",
        json={"primary_contact_method": "garbage"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_put_producers_me_accepts_instagram_contact_method(client, db):
    # instagram is a newly-enumerated valid method → 200.
    _, user = _make_owner(db, email="owner-instamethod@example.com")
    resp = client.put(
        "/producers/me",
        json={"primary_contact_method": "instagram"},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["primary_contact_method"] == "instagram"


def test_put_producers_me_rejects_javascript_url(client, db):
    # Non-http(s) schemes (XSS vector) are rejected on URL fields → 422.
    # Also closes the pre-existing gap on `website` (MEH-296 / MEH-329).
    _, user = _make_owner(db, email="owner-xssurl@example.com")
    resp = client.put(
        "/producers/me",
        json={"website": "javascript:alert(1)"},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text


def test_register_producer_rejects_javascript_url(client, db):
    # MEH-296: the same http(s) scheme guard applies on the PUBLIC
    # registration path (ProducerRegister.website) → 422. Baseline payload
    # is otherwise valid (phone added) so the 422 isolates the URL guard.
    payload = {
        **valid_producer_register_payload(),
        "phone": "+972501234567",
        "website": "javascript:alert(1)",
    }
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text
