"""MEH-1291 (Chunk B) — Producer.updated_at freshness signal.

Guards the two load-bearing properties of the "עודכן לאחרונה" line on the
public producer page:

1. **Honest signal** — a producer that has never been edited exposes
   `updated_at = null`, so the page renders nothing (no backfill, no
   server_default; the Chunk A migration a3f1c9d2e4b7 added the column
   nullable).
2. **Stamp fires on a real edit** — the owner edit path
   (`producer_me.py:update_my_producer`) loads the ORM object, `setattr`s
   the changed fields, and `commit`s, so the model-level
   `onupdate=func.now()` (models.py:186) stamps `updated_at`. This is the
   regression guard flagged in the MEH-1291 Chunk A review: a bulk
   `session.execute(update(Producer)...)` path would silently skip the
   stamp — this test locks in the object-mutation contract.

Both assertions also cover the public exposure — `updated_at` must be a
field on `ProducerDetailOut` (schemas.py) or the GET below would 200 with
the key absent.

REUSES: tests/test_verified_email_enforcement.py — the producer-owner
wiring (make_producer + make_user role=producer + user.producer_id).
"""

from conftest import auth_header, make_producer, make_user


def test_untouched_producer_exposes_null_updated_at(client, db):
    """A never-edited producer: column present in the response, value null."""
    producer = make_producer(db, name="חוות ללא עריכה")

    r = client.get(f"/producers/{producer.id}")

    assert r.status_code == 200
    body = r.json()
    # Exposure: the field must exist on ProducerDetailOut...
    assert "updated_at" in body
    # ...and stay null until a real edit (honest freshness signal).
    assert body["updated_at"] is None


def test_owner_edit_stamps_updated_at(client, db):
    """PUT /producers/me mutates the ORM object -> onupdate=func.now() fires."""
    producer = make_producer(db, name="חוות עם עריכה")
    owner = make_user(db, role="producer")
    owner.producer_id = producer.id
    db.commit()

    r = client.put(
        "/producers/me",
        json={"description": "תיאור מעודכן על ידי הבעלים"},
        headers=auth_header(owner),
    )
    assert r.status_code == 200

    detail = client.get(f"/producers/{producer.id}")
    assert detail.status_code == 200
    # The edit stamped updated_at; the public page will now render the line.
    assert detail.json()["updated_at"] is not None
