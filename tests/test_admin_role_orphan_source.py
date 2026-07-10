"""MEH — close the two admin paths that create orphan producer accounts.

An orphan = a User row with role="producer" but producer_id=NULL.
require_producer (auth.py:268-273) gates on role ALONE, so such a row
passes the dep then 404s on every /producers/me* handler
(producer_me.py:75-76), leaving the dashboard stuck on "loading".

Two admin paths could create the orphan:

  Chunk 2a — DELETE /admin/producers/{id} (admin_delete_producer):
    unlinking the owning user cleared producer_id + is_producer but left
    role="producer". Fixed by also resetting role="consumer".

  Chunk 2b — PUT /admin/users/{id}/role (update_user_role):
    accepted role="producer" with no Producer creation/link. Fixed by
    rejecting that value (producers come only from the atomic register
    flow, auth.py:511-514 / :619-628).

Registration is already atomic and is NOT touched by this work.
"""
from app.models import Producer

from tests.conftest import auth_header, make_producer, make_user


ADMIN_EMAIL = "admin@example.com"
OWNER_EMAIL = "owner@example.com"


class TestDeleteProducerResetsOwnerRole:
    """Chunk 2a — admin_delete_producer must leave the owner consistent:
    role=consumer, producer_id=None, is_producer=False."""

    def test_owner_demoted_to_consumer_after_business_delete(self, client, db):
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        producer = make_producer(db, name="חוות הניסוי")

        # Self-registered owner: linked + role=producer (mirrors the atomic
        # register flow at auth.py:511-514).
        owner = make_user(db, email=OWNER_EMAIL, role="producer")
        owner.producer_id = producer.id
        owner.is_producer = True
        db.commit()

        resp = client.delete(
            f"/admin/producers/{producer.id}",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.json()

        # Producer row is gone.
        assert db.query(Producer).filter(Producer.id == producer.id).first() is None

        # Owner is a consistent consumer — no orphan left behind.
        db.refresh(owner)
        assert owner.role == "consumer"
        assert owner.producer_id is None
        assert owner.is_producer is False

    def test_admin_created_producer_delete_is_noop_on_users(self, client, db):
        # Regression — a producer with no linked user (admin-imported) must
        # delete cleanly without touching any User row.
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        producer = make_producer(db, name="עסק מיובא")

        # An unrelated consumer must be untouched by the bulk update.
        bystander = make_user(db, email="by@example.com", role="consumer")

        resp = client.delete(
            f"/admin/producers/{producer.id}",
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.json()

        db.refresh(bystander)
        assert bystander.role == "consumer"
        assert bystander.producer_id is None


class TestUpdateUserRoleRejectsProducer:
    """Chunk 2b — PUT /admin/users/{id}/role must refuse role="producer".
    Producers are created only by the atomic register flow; a manual bump
    here would create an orphan. consumer<->admin transitions stay open."""

    def test_promote_to_producer_rejected_4xx(self, client, db):
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        consumer = make_user(db, email="c@example.com", role="consumer")

        resp = client.put(
            f"/admin/users/{consumer.id}/role",
            json={"role": "producer"},  # schema-valid value → 422 is the guard
            headers=auth_header(admin),
        )
        # 422 originates from the handler guard, not schema validation:
        # "producer" passes UserRoleUpdate's pattern (schemas.py:1771).
        assert resp.status_code == 422, resp.json()

        # Target role unchanged — no orphan created.
        db.refresh(consumer)
        assert consumer.role == "consumer"
        assert consumer.producer_id is None

    def test_promote_consumer_to_admin_still_works(self, client, db):
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        consumer = make_user(db, email="c@example.com", role="consumer")

        resp = client.put(
            f"/admin/users/{consumer.id}/role",
            json={"role": "admin"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(consumer)
        assert consumer.role == "admin"

    def test_demote_admin_to_consumer_still_works(self, client, db):
        admin = make_user(db, email=ADMIN_EMAIL, role="admin")
        other_admin = make_user(db, email="a2@example.com", role="admin")

        resp = client.put(
            f"/admin/users/{other_admin.id}/role",
            json={"role": "consumer"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 200, resp.json()
        db.refresh(other_admin)
        assert other_admin.role == "consumer"
