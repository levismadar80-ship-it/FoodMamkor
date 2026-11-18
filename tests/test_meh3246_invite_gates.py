"""MEH-3246 (grill B9): an owner invite never goes out for a page that
could not have been approved.

Accepting an invite publishes a hidden business (`inactive` -> `approved`,
producer_owner_invite.py accept). Before this, the admin could invite for a
page with no photo or no licence, and the owner's click put it live without
the approval gates (admin.py MEH-799 photo, MEH-971 licence). Sapir 14/11:
block the invite until it is complete; the WhatsApp number is verified by
the owner herself after she joins, so it is not an invite gate.
"""

from conftest import auth_header, make_category, make_producer, make_user

PHOTO = ["https://res.cloudinary.com/demo/image/upload/v1/g.jpg"]
BODY = {
    "email": "owner-gate@example.com",
    "name": "דנה כהן",
    "consent_confirmed": True,
    "consent_note": "שיחה טלפונית עם בעלת העסק, הסכימה לקבל קישור.",
}


def _post(client, db, producer, suffix=""):
    admin = make_user(db, role="admin", email=f"adm{suffix or 'c'}@example.com")
    return client.post(
        f"/admin/producers/{producer.id}/owner-invite{suffix}",
        json=BODY if not suffix else None,
        headers=auth_header(admin),
    )


def test_hidden_business_without_a_photo_gets_no_invite(client, db):
    p = make_producer(db, status="inactive")
    r = _post(client, db, p)
    assert r.status_code == 422, r.text
    assert "תמונה" in r.json()["detail"]
    db.refresh(p)
    assert p.owner_invite_token_hash is None


def test_licence_category_without_a_licence_gets_no_invite(client, db):
    cat = make_category(db, name="לחמים ואפייה")
    p = make_producer(db, status="inactive", images=PHOTO, category=cat)
    r = _post(client, db, p)
    assert r.status_code == 422, r.text
    assert "רישיון" in r.json()["detail"]


def test_complete_hidden_business_is_invitable(client, db):
    p = make_producer(db, status="inactive", images=PHOTO)
    r = _post(client, db, p)
    assert r.status_code == 200, r.text


def test_resend_is_refused_once_the_photo_is_gone(client, db):
    p = make_producer(db, status="inactive", images=PHOTO)
    assert _post(client, db, p).status_code == 200
    p.images = []
    db.commit()
    r = _post(client, db, p, "/resend")
    assert r.status_code == 422, r.text
