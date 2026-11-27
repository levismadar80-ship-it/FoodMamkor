"""
Module:   test_meh3912_admin_notes_readback
Purpose:  The admin's «הערות פנימיות» (producers.admin_notes) round-trip
          through the admin edit form: what the PUT writes, the admin GET
          returns, so the form reopens with it and a second save keeps it.
Touches:  The test DB via `db`; HTTP via `client`.
Does NOT: test the sanitizer (schemas/producer.py `_sanitize_admin_notes`).
Related:  backend/app/schemas/producer_out.py (ProducerAdminOut.admin_notes);
          frontend/components/admin/ProducerForm.jsx (initial.admin_notes).
History:  MEH-3912 (creation — the field had a write path and no read path,
          so the form reopened empty and the next save sent "" over it).
"""

import uuid

from app.schemas.schemas import ProducerDetailOut, ProducerListOut, ProducerOwnerOut
from tests.conftest import auth_header, make_producer, make_user

NOTE = "מקורות: קבוצת וואטסאפ «עוגות מהיום להיום», תפריט מ-26/11"


def _admin(db):
    return make_user(db, role="admin", email=f"a{uuid.uuid4().hex[:8]}@example.com")


def test_admin_get_returns_the_note_the_put_saved(client, db):
    producer = make_producer(db)
    headers = auth_header(_admin(db))

    r = client.put(f"/admin/producers/{producer.id}", json={"admin_notes": NOTE}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json().get("admin_notes") == NOTE

    r = client.get(f"/admin/producers/{producer.id}", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json().get("admin_notes") == NOTE


def test_saving_another_field_keeps_the_note(client, db):
    """The form resends what GET gave it; a missing field came back as ""."""
    producer = make_producer(db)
    headers = auth_header(_admin(db))
    client.put(f"/admin/producers/{producer.id}", json={"admin_notes": NOTE}, headers=headers)

    loaded = client.get(f"/admin/producers/{producer.id}", headers=headers).json()
    resend = {"admin_notes": loaded.get("admin_notes") or "", "short_description": "עוגות בהזמנה"}
    r = client.put(f"/admin/producers/{producer.id}", json=resend, headers=headers)
    assert r.status_code == 200, r.text

    db.expire_all()
    db.refresh(producer)
    assert producer.admin_notes == NOTE


def test_admin_notes_is_absent_from_public_and_owner_schemas():
    for schema in (ProducerListOut, ProducerDetailOut, ProducerOwnerOut):
        assert "admin_notes" not in schema.model_fields, schema.__name__
