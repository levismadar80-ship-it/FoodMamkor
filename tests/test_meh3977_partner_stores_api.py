"""MEH-3977 chunk 2: the partner-stores field through the API.

Admin create, admin PUT and owner PUT accept «נמכר דרך חנויות אחרות» as a
way to reach customers on its own; a business left with none of place,
delivery and stores is a 422, never the DB CHECK's 500.
"""

from tests.conftest import auth_header, make_category, make_producer, make_user


def _admin_body(cat_id: int, **kw) -> dict:
    body = {"name": "משק חזיזה בדיקה", "city": "שעל", "category_ids": [cat_id]}
    body.update(kw)
    return body


def _owner(db):
    user = make_user(db, role="producer")
    producer = make_producer(db)
    user.producer_id = producer.id
    db.commit()
    return user, producer


def test_admin_create_partner_stores_only_is_201(client, db):
    admin = make_user(db, email="admin3977a@example.com", role="admin")
    cat = make_category(db, name="ירקות 3977")
    body = _admin_body(
        cat.id,
        has_physical_location=False,
        offers_delivery=False,
        partner_stores=[" פארמרים ", "הענתיות", "פארמרים", ""],
    )
    resp = client.post("/admin/producers", json=body, headers=auth_header(admin))
    assert resp.status_code == 201, resp.text
    assert resp.json()["partner_stores"] == ["פארמרים", "הענתיות"]


def test_admin_create_none_of_the_three_is_422(client, db):
    admin = make_user(db, email="admin3977b@example.com", role="admin")
    cat = make_category(db, name="ירקות 3977ב")
    body = _admin_body(cat.id, has_physical_location=False, offers_delivery=False)
    resp = client.post("/admin/producers", json=body, headers=auth_header(admin))
    assert resp.status_code == 422, resp.text
    assert "חנויות אחרות" in resp.text


def test_admin_create_eleven_stores_is_422(client, db):
    admin = make_user(db, email="admin3977c@example.com", role="admin")
    cat = make_category(db, name="ירקות 3977ג")
    body = _admin_body(cat.id, partner_stores=[f"חנות {i}" for i in range(11)])
    resp = client.post("/admin/producers", json=body, headers=auth_header(admin))
    assert resp.status_code == 422, resp.text


def test_store_name_over_sixty_chars_is_422(client, db):
    user, _ = _owner(db)
    resp = client.put(
        "/producers/me", json={"partner_stores": ["א" * 61]}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text
    assert "שם חנות" in resp.text


def test_owner_put_writes_partner_stores_and_page_shows_them(client, db):
    user, producer = _owner(db)
    resp = client.put(
        "/producers/me",
        json={"partner_stores": ["עלה הביתה"]},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.partner_stores == ["עלה הביתה"]
    page = client.get(f"/producers/{producer.id}")
    assert page.status_code == 200, page.text
    assert page.json()["partner_stores"] == ["עלה הביתה"]


def test_owner_put_partner_only_switches_place_off(client, db):
    user, producer = _owner(db)
    resp = client.put(
        "/producers/me",
        json={
            "has_physical_location": False,
            "offers_delivery": False,
            "partner_stores": ["פארמרים"],
        },
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.has_physical_location is False
    assert producer.partner_stores == ["פארמרים"]


def test_clearing_the_last_way_to_reach_customers_is_422_not_500(client, db):
    """Stored: no place, no delivery, one store. Sending [] alone would leave
    nothing; the schema cannot see the stored flags, ensure_location_mode can."""
    user, producer = _owner(db)
    producer.has_physical_location = False
    producer.offers_delivery = False
    producer.partner_stores = ["פארמרים"]
    db.commit()
    resp = client.put(
        "/producers/me", json={"partner_stores": []}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text
    assert "location_mode_required" in resp.text
    db.refresh(producer)
    assert producer.partner_stores == ["פארמרים"]


def test_explicit_null_is_422(client, db):
    user, _ = _owner(db)
    resp = client.put(
        "/producers/me", json={"partner_stores": None}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text


def test_admin_put_partner_stores(client, db):
    admin = make_user(db, email="admin3977d@example.com", role="admin")
    producer = make_producer(db)
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"partner_stores": ["הענתיות"]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["partner_stores"] == ["הענתיות"]


def test_store_name_without_letters_is_422(client, db):
    user, _ = _owner(db)
    resp = client.put(
        "/producers/me", json={"partner_stores": ["!!!", "12"]}, headers=auth_header(user)
    )
    assert resp.status_code == 422, resp.text
    assert "אותיות" in resp.text


def test_flags_off_without_the_list_uses_the_stored_stores(client, db):
    """Review nit: the schema cannot see the stored list, so it defers."""
    user, producer = _owner(db)
    producer.partner_stores = ["פארמרים"]
    db.commit()
    resp = client.put(
        "/producers/me",
        json={"has_physical_location": False, "offers_delivery": False},
        headers=auth_header(user),
    )
    assert resp.status_code == 200, resp.text


def test_flags_off_with_nothing_stored_is_still_422(client, db):
    user, _ = _owner(db)
    resp = client.put(
        "/producers/me",
        json={"has_physical_location": False, "offers_delivery": False},
        headers=auth_header(user),
    )
    assert resp.status_code == 422, resp.text
