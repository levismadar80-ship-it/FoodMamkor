"""MEH-2582 — the approval row's one-field write of google_place_id.

PUT /admin/producers/{id}/google-place-id exists because the full admin PUT
re-checks every effective-state gate: a pending business in a licence-required
category without a licence number — exactly who sits in the approval queue —
got 422 «מספר רישיון יצרן חובה לקטגוריה זו» for a PUT carrying only
google_place_id, so it could never be mapped. These tests pin the new route.
"""
from app.models import Category

from conftest import auth_header, make_category, make_producer, make_user

PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4"


def _put(client, db, producer, value=PLACE_ID, role="admin"):
    return client.put(
        f"/admin/producers/{producer.id}/google-place-id",
        json={"google_place_id": value},
        headers=auth_header(make_user(db, role=role)),
    )


def _licence_category(db):
    return db.query(Category).filter(Category.name == "לחמים ואפייה").first() or make_category(
        db, name="לחמים ואפייה", emoji="🍞"
    )


def test_sets_place_id_and_nothing_else(client, db):
    producer = make_producer(db, status="pending")
    producer.contact_name = "גל"
    db.commit()
    before = {"name": producer.name, "city": producer.city, "status": producer.status,
              "contact_name": producer.contact_name, "description": producer.description}

    resp = _put(client, db, producer)

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"google_place_id": PLACE_ID}
    db.refresh(producer)
    assert producer.google_place_id == PLACE_ID
    assert {"name": producer.name, "city": producer.city, "status": producer.status,
            "contact_name": producer.contact_name, "description": producer.description} == before


def test_works_for_unlicensed_business_in_licence_category(client, db):
    producer = make_producer(db, status="pending", category=_licence_category(db))
    producer.producer_license_number = None
    db.commit()

    resp = _put(client, db, producer)

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.google_place_id == PLACE_ID


def test_full_admin_put_still_refuses_that_business(client, db):
    """The licence gate on the full edit is untouched — only the new route skips it."""
    producer = make_producer(db, status="pending", category=_licence_category(db))
    producer.producer_license_number = None
    db.commit()

    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"google_place_id": PLACE_ID},
        headers=auth_header(make_user(db, role="admin")),
    )

    assert resp.status_code == 422, resp.text


def test_blank_clears_it(client, db):
    producer = make_producer(db, status="pending")
    producer.google_place_id = PLACE_ID
    db.commit()

    resp = _put(client, db, producer, value="  ")

    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.google_place_id is None


def test_maps_url_is_refused(client, db):
    producer = make_producer(db, status="pending")
    resp = _put(client, db, producer, value="https://maps.google.com/?cid=1")
    assert resp.status_code == 422, resp.text
    db.refresh(producer)
    assert producer.google_place_id is None


def test_non_admin_is_refused(client, db):
    producer = make_producer(db, status="pending")
    resp = _put(client, db, producer, role="user")
    assert resp.status_code == 403, resp.text
    db.refresh(producer)
    assert producer.google_place_id is None


def test_unknown_or_organizer_is_404(client, db):
    producer = make_producer(db, status="pending")
    producer.kind = "organizer"
    db.commit()
    assert _put(client, db, producer).status_code == 404
