"""MEH-2503 — deleting a business or an account never 500s on group buys, and
the people waiting on a live group buy are told.

Before the fix three ORM relationships pointed at a NOT NULL foreign key with
no cascade and no ``passive_deletes``, so ``db.delete(parent)`` made
SQLAlchemy try to NULL the child's column → NotNullViolation → 500:

  - ``Producer.group_buys``            (admin delete / owner self-delete)
  - ``Producer.name_change_requests``  (same two paths)
  - ``User.group_buy_commits``         (any user who ever joined a group buy
                                        could not delete her account)

The last test is the guard for the class: it walks every mapper, so the next
relationship added the same way fails here instead of in production.
"""

from datetime import timedelta

from sqlalchemy.orm import configure_mappers

from app.database import Base
from app.models.models import (
    GroupBuy,
    GroupBuyCommit,
    Producer,
    ProducerNameChangeRequest,
    User,
)
from app.utils.clock import utc_now
from conftest import auth_header, make_producer, make_user


def _business(db, email=None):
    producer = make_producer(db, name="מאפיית הגליל")
    owner = make_user(
        db, role="producer", email=email or f"owner-{producer.id}@example.com"
    )
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()
    return producer, owner


def _group(db, producer, status="open", min_participants=5):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        product_name="קמח מלא",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=min_participants,
        deadline=utc_now() + timedelta(days=7),
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _join(db, gb, email):
    user = make_user(db, email=email)
    db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=user.id, quantity=1))
    db.commit()
    return user


def _capture(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.group_buy_notifications.send_email",
        lambda to, subject, body, html=None: sent.append((to, subject, body)),
    )
    return sent


def _gone(db, model, row_id):
    # count() always reads the database; no identity-map refresh of a row
    # that the request under test has deleted.
    return db.query(model).filter(model.id == row_id).count() == 0


class TestAdminDelete:
    def test_with_live_group_buy_deletes_and_tells_participant(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer1@example.com")
        admin = make_user(db, role="admin", email="admin1@example.com")
        pid, gid = producer.id, gb.id

        resp = client.delete(f"/admin/producers/{pid}", headers=auth_header(admin))
        assert resp.status_code == 200
        assert _gone(db, Producer, pid) and _gone(db, GroupBuy, gid)
        assert [to for to, _, _ in sent] == ["buyer1@example.com"]
        assert "כבר לא מופיע במהמקור" in sent[0][2]

    def test_finished_group_buy_deleted_without_email(self, client, db, monkeypatch):
        sent = _capture(monkeypatch)
        producer, _ = _business(db)
        gb = _group(db, producer, status="fulfilled")
        _join(db, gb, "buyer2@example.com")
        admin = make_user(db, role="admin", email="admin2@example.com")
        pid, gid = producer.id, gb.id

        resp = client.delete(f"/admin/producers/{pid}", headers=auth_header(admin))
        assert resp.status_code == 200
        assert _gone(db, GroupBuy, gid)
        assert sent == []

    def test_with_name_change_request(self, client, db):
        producer, _ = _business(db)
        req = ProducerNameChangeRequest(
            producer_id=producer.id,
            current_name="מאפיית הגליל",
            requested_name="מאפיית הכרמל",
        )
        db.add(req)
        db.commit()
        admin = make_user(db, role="admin", email="admin3@example.com")
        pid, rid = producer.id, req.id

        resp = client.delete(f"/admin/producers/{pid}", headers=auth_header(admin))
        assert resp.status_code == 200
        assert _gone(db, ProducerNameChangeRequest, rid)


class TestOwnerSelfDelete:
    def test_with_live_group_buy_deletes_and_tells_participant(
        self, client, db, monkeypatch
    ):
        sent = _capture(monkeypatch)
        producer, owner = _business(db)
        gb = _group(db, producer)
        _join(db, gb, "buyer3@example.com")
        pid, gid = producer.id, gb.id

        resp = client.delete("/auth/me", headers=auth_header(owner))
        assert resp.status_code == 200
        assert _gone(db, Producer, pid) and _gone(db, GroupBuy, gid)
        assert [to for to, _, _ in sent] == ["buyer3@example.com"]

    def test_with_name_change_request(self, client, db):
        producer, owner = _business(db)
        db.add(
            ProducerNameChangeRequest(
                producer_id=producer.id, current_name="א", requested_name="מאפיית הכרמל"
            )
        )
        db.commit()
        assert client.delete("/auth/me", headers=auth_header(owner)).status_code == 200


class TestParticipantSelfDelete:
    def test_open_group_loses_the_commit_only(self, client, db):
        producer, _ = _business(db)
        gb = _group(db, producer)
        user = _join(db, gb, "buyer4@example.com")
        other = _join(db, gb, "buyer5@example.com")
        user_id = user.id

        assert client.delete("/auth/me", headers=auth_header(user)).status_code == 200
        db.expire_all()
        assert _gone(db, User, user_id)
        left = (
            db.query(GroupBuyCommit).filter(GroupBuyCommit.group_buy_id == gb.id).all()
        )
        assert [c.user_id for c in left] == [other.id]
        assert db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "open"

    def test_funded_group_reverts_to_open_below_minimum(self, client, db):
        producer, _ = _business(db)
        gb = _group(db, producer, status="funded", min_participants=2)
        user = _join(db, gb, "buyer6@example.com")
        _join(db, gb, "buyer7@example.com")

        assert client.delete("/auth/me", headers=auth_header(user)).status_code == 200
        db.expire_all()
        assert db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "open"

    def test_funded_group_stays_funded_at_minimum(self, client, db):
        producer, _ = _business(db)
        gb = _group(db, producer, status="funded", min_participants=2)
        user = _join(db, gb, "buyer8@example.com")
        _join(db, gb, "buyer9@example.com")
        _join(db, gb, "buyer10@example.com")

        assert client.delete("/auth/me", headers=auth_header(user)).status_code == 200
        db.expire_all()
        assert db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "funded"

    def test_closed_group_keeps_its_status(self, client, db):
        producer, _ = _business(db)
        gb = _group(db, producer, status="fulfilled", min_participants=2)
        user = _join(db, gb, "buyer11@example.com")

        assert client.delete("/auth/me", headers=auth_header(user)).status_code == 200
        db.expire_all()
        assert (
            db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "fulfilled"
        )


def _unsafe_one_to_many():
    """Every one-to-many whose child FK is NOT NULL, with neither an ORM delete
    cascade nor passive_deletes: deleting the parent through the ORM makes
    SQLAlchemy NULL that column → NotNullViolation (MEH-816, MEH-2503)."""
    configure_mappers()
    found = []
    for mapper in Base.registry.mappers:
        for rel in mapper.relationships:
            if rel.direction.name != "ONETOMANY":
                continue
            if "delete" in rel.cascade or rel.passive_deletes:
                continue
            for col in rel.remote_side:
                if col.foreign_keys and not col.nullable:
                    found.append(f"{mapper.class_.__name__}.{rel.key}")
    return sorted(set(found))


# HomeProductWhatsAppClick rows are only ever removed by bulk query delete
# (auth.delete_account), which bypasses ORM cascades — the DB FK handles it.
# The home_products subsystem is being decommissioned (MEH-796).
_KNOWN_SAFE = {"HomeProductWhatsAppClick.rating"}


def test_no_one_to_many_can_null_a_not_null_fk_on_delete():
    assert set(_unsafe_one_to_many()) - _KNOWN_SAFE == set()


def test_guard_sees_a_real_unsafe_relationship():
    """Control: the scan is alive — it reports the known-safe exception, which
    is exactly the shape it exists to catch."""
    assert "HomeProductWhatsAppClick.rating" in _unsafe_one_to_many()
