"""MEH-1541 — established_year ("מאז {שנה}" heritage line) I/O + validation.

Covers the API contract of the founding-year field:
  - owner PUT /producers/me persists a valid year (round-trip);
  - range validation (1800 ≤ year ≤ current year): 1799 → 422, next year → 422,
    both boundaries (1800 + current year) → 200;
  - null round-trip: the column is nullable, so an explicit null CLEARS it
    (200 → None) — unlike the NOT NULL dietary-scope fields (MEH-1508);
  - admin PUT /admin/producers/{id} accepts the field (manual-approval path);
  - established_year serializes on the public ProducerDetailOut (present as
    null when unset — the DOM-absence when null is a frontend concern).

Pure HTTP/DB tests, no Anthropic/email assertions (fail-open in test config).

REUSES: tests/test_dietary_scope_io.py:20 (_producer_user owner wiring —
make_producer + make_user(role="producer") + user.producer_id link).
"""

from app.utils.clock import israel_today

from tests.conftest import auth_header, make_producer, make_user

CURRENT_YEAR = israel_today().year


def _producer_user(db):
    producer = make_producer(db, name="מאפיית דור שלישי")
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_owner_put_persists_established_year(client, db):
    user, producer = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"established_year": 1940},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["established_year"] == 1940

    db.refresh(producer)
    assert producer.established_year == 1940


def test_owner_put_rejects_year_below_1800(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"established_year": 1799},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "שנת ההקמה לא תקינה" in resp.text


def test_owner_put_rejects_future_year(client, db):
    user, _ = _producer_user(db)
    resp = client.put(
        "/producers/me",
        json={"established_year": CURRENT_YEAR + 1},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
    assert "שנת ההקמה לא תקינה" in resp.text


def test_owner_put_accepts_range_boundaries(client, db):
    # Both inclusive bounds must pass: 1800 (lower) and the current year (upper).
    user, producer = _producer_user(db)
    for year in (1800, CURRENT_YEAR):
        resp = client.put(
            "/producers/me",
            json={"established_year": year},
            headers=auth_header(user),
        )
        assert resp.status_code == 200, resp.text
        db.refresh(producer)
        assert producer.established_year == year


def test_owner_put_null_clears_established_year(client, db):
    # Nullable column: an explicit null clears the year (round-trip → None),
    # so a business can retract a value it previously set.
    user, producer = _producer_user(db)
    producer.established_year = 1962
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"established_year": None},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["established_year"] is None

    db.refresh(producer)
    assert producer.established_year is None


def test_admin_put_accepts_established_year(client, db):
    producer = make_producer(db, name="בית בד משפחתי")
    admin = make_user(db, role="admin")
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"established_year": 1948},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["established_year"] == 1948

    db.refresh(producer)
    assert producer.established_year == 1948


def test_public_detail_exposes_established_year(client, db):
    producer = make_producer(db, name="חוות ותיקה", status="approved")
    producer.established_year = 1955
    db.commit()

    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["established_year"] == 1955


def test_public_detail_established_year_null_when_unset(client, db):
    # Absent value serializes as null (the frontend drops the DOM node on null).
    producer = make_producer(db, name="חוות בלי שנה", status="approved")
    resp = client.get(f"/producers/{producer.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["established_year"] is None
