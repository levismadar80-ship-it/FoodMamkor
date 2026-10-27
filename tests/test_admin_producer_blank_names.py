"""MEH-2432 — a blank contact name or top product from the admin form.

The server's name fields reject "" («שם לא יכול להיות ריק»), so the admin form
sends null for a blank field. These tests pin both halves: "" is a 422, and an
explicit null creates fine and, on edit, clears the stored value.
"""
from conftest import auth_header, make_producer, make_user


def _admin(db):
    return make_user(db, role="admin")


def test_create_with_blank_names_as_null_succeeds(client, db):
    resp = client.post(
        "/admin/producers",
        json={"name": "בדיקת טיוטה", "city": "זכרון יעקב", "as_draft": True,
              "contact_name": None, "top_product_name": None},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code in (200, 201), resp.text


def test_create_with_blank_names_as_empty_string_is_422(client, db):
    resp = client.post(
        "/admin/producers",
        json={"name": "בדיקת טיוטה", "city": "זכרון יעקב",
              "contact_name": "", "top_product_name": ""},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 422, resp.text
    fields = {err["loc"][-1] for err in resp.json()["detail"]}
    assert {"contact_name", "top_product_name"} <= fields


def test_edit_with_null_contact_name_clears_it(client, db):
    producer = make_producer(db)
    producer.contact_name = "גל"
    db.commit()
    resp = client.put(
        f"/admin/producers/{producer.id}",
        json={"contact_name": None},
        headers=auth_header(_admin(db)),
    )
    assert resp.status_code == 200, resp.text
    db.refresh(producer)
    assert producer.contact_name is None
