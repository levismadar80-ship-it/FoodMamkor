"""MEH-2015 chunk B — server-side parity: producer registration `city` must be
present and non-empty.

MEH-951 made the field's asterisk visual-only on purpose (no client or server
gate); Sapir's 14.8.2026 ruling on MEH-2015 revoked that exception — city is
the discovery axis (map + filter), not a profile field, and an unenforced
value shipped empty for most producers (measured 14/08: 2 of 14 businesses
carried delivery_areas at all). ProducerRegister.city is now
`Field(..., min_length=1, max_length=100)` — the same shape MEH-2013 already
gave ExperienceCreate.city / EventCreate.city.

Covers both ProducerRegister paths: new (unauthenticated) registration and
the MEH-143 upgrade (authenticated, no email/name/password in the body) —
city is sent unconditionally on both by the client, so the schema enforces
it unconditionally too.
"""
from conftest import auth_header, make_user, valid_producer_register_payload


# ---------- New (unauthenticated) registration ----------


def test_register_with_city_succeeds(client, db):
    payload = valid_producer_register_payload() | {"phone": "0501234567"}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code in (200, 201), resp.text


def test_register_missing_city_returns_422(client, db):
    payload = valid_producer_register_payload() | {"phone": "0501234567"}
    del payload["city"]
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text


def test_register_empty_city_returns_422(client, db):
    payload = valid_producer_register_payload() | {"phone": "0501234567", "city": ""}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text


def test_register_null_city_returns_422(client, db):
    payload = valid_producer_register_payload() | {"phone": "0501234567", "city": None}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text


def test_register_whitespace_only_city_returns_422(client, db):
    """Adversarial-review finding on this PR: `Field(..., min_length=1)` alone
    counts raw length, so "   " (length 3) would pass it — the exact shape of
    a whitespace-only submission that ships an effectively-empty city. Closed
    by the sanitize→letter-floor validator pair (mirrors MEH-870's address /
    short_description floors); this test is what proves it."""
    payload = valid_producer_register_payload() | {"phone": "0501234567", "city": "   "}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text


def test_register_punctuation_only_city_returns_422(client, db):
    payload = valid_producer_register_payload() | {"phone": "0501234567", "city": "---"}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 422, resp.text


def test_register_short_legitimate_city_name_accepted(client, db):
    """The letter floor is min_count=1, not the ≥3 used for names/taglines —
    a real short Hebrew city name ("לוד") must not be over-rejected."""
    payload = valid_producer_register_payload() | {"phone": "0501234567", "city": "לוד"}
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code in (200, 201), resp.text


# ---------- MEH-143 upgrade path (authenticated) ----------


def test_upgrade_with_city_succeeds(client, db):
    u = make_user(db, email="upgrade-city@example.com")
    payload = valid_producer_register_payload() | {"phone": "0501234567"}
    for field in ("email", "name", "password"):
        payload.pop(field, None)
    resp = client.post(
        "/auth/register/producer",
        json=payload,
        headers=auth_header(u),
    )
    assert resp.status_code == 200, resp.text


def test_upgrade_missing_city_returns_422(client, db):
    u = make_user(db, email="upgrade-city-missing@example.com")
    payload = valid_producer_register_payload() | {"phone": "0501234567"}
    for field in ("email", "name", "password", "city"):
        payload.pop(field, None)
    resp = client.post(
        "/auth/register/producer",
        json=payload,
        headers=auth_header(u),
    )
    assert resp.status_code == 422, resp.text
