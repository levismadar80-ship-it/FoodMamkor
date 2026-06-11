"""MEH-747 — admin producer-delete must unlink users_producer_id_fkey first.

DELETE /admin/producers/{id} previously did `db.delete(producer); db.commit()`
with no FK unlink. For a self-registered producer (a User row points at the
producer via User.producer_id, which has no ondelete in models.py), the commit
violated `users_producer_id_fkey` and the request 500'd — so the admin "מחק"
button looked like a no-op on exactly the real onboarding path.

The fix mirrors auth.py::delete_account: unlink every user pointing at the
producer (producer_id -> None, is_producer -> False) and flush BEFORE the
delete. Admin-created producers have no linked user, so the unlink is a no-op
and that path must not regress.
"""

from app.models import User

from tests.conftest import auth_header, make_producer, make_user


# Mirrors tests/test_admin_producer_lockout.py UPGRADE_BODY shape.
_REGISTER_BODY = {
    "producer_name": "חוות הניסוי",
    "phone": "0501234567",
    "category_ids": [],
    "primary_contact_method": "whatsapp",
    "email": "selfreg@example.com",
    "name": "בעלת עסק",
    "password": "Zx7Yp9Mq2Lr4",
    "declaration_accepted": True,  # MEH-759: mandatory binding declaration
}


def test_admin_delete_self_registered_producer_unlinks_fk(client, db, monkeypatch):
    """register producer via API → admin delete → 200 + user.producer_id IS NULL."""
    # Skip Cloudinary network on the post-commit cleanup.
    from app import cloudinary_utils

    monkeypatch.setattr(cloudinary_utils, "destroy_image", lambda *a, **k: True)

    resp = client.post("/auth/register/producer", json=_REGISTER_BODY)
    assert resp.status_code == 200, resp.json()

    user = db.query(User).filter(User.email == _REGISTER_BODY["email"]).one()
    assert user.producer_id is not None, "self-registered user must be linked"
    assert user.is_producer is True
    producer_id = str(user.producer_id)

    admin = make_user(db, role="admin")
    del_resp = client.delete(
        f"/admin/producers/{producer_id}", headers=auth_header(admin)
    )

    # The FK violation previously surfaced here as a 500.
    assert del_resp.status_code == 200, del_resp.json()
    assert del_resp.json() == {"detail": "Producer deleted"}

    db.refresh(user)
    assert user.producer_id is None
    # is_producer reset so the owner is not locked out of re-registering
    # (409 at auth.py checks is_producer) — MEH-669 family lockout.
    assert user.is_producer is False


def test_admin_delete_admin_created_producer_no_regression(client, db, monkeypatch):
    """Producer with no linked user (admin-created) still deletes cleanly."""
    from app import cloudinary_utils

    monkeypatch.setattr(cloudinary_utils, "destroy_image", lambda *a, **k: True)

    admin = make_user(db, role="admin")
    producer = make_producer(db)
    producer_id = str(producer.id)

    resp = client.delete(
        f"/admin/producers/{producer_id}", headers=auth_header(admin)
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json() == {"detail": "Producer deleted"}
