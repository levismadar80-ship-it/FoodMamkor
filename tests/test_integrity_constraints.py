"""MEH-773 (Chunk B): integrity-constraint behaviour at the API + ORM layer.

Covers the constraints/relationships added in Chunk A (migration 382128b23383)
and the Chunk B handling:
  - uq_report_reporter_producer  → duplicate report returns 409 (not 500)
  - users.producer_id ON DELETE SET NULL + passive_deletes on the producer
    otp/kashrut relationships → deleting a producer with children + a linked
    user does not 500; children cascade, the user is nullified.
  - group-buy capacity counts correctly under the with_for_update row lock.

True concurrency (the race the constraints/lock actually backstop) is not
unit-testable; the DB-level constraint tests prove the guard exists, and the
API tests prove the surfaced behaviour. Mirrors the IntegrityError-recovery
precedent in app/routers/reviews.py.
"""

from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from conftest import auth_header, make_producer, make_user

from app.models.models import (
    GroupBuy,
    KashrutBadgeRequest,
    PhoneOtpToken,
    Report,
)
from app.utils.clock import utc_now


# ---------- reports: uq_report_reporter_producer ----------
class TestReportUnique:
    def test_duplicate_report_returns_409(self, client, db):
        user = make_user(db, email="reporter@example.com")
        producer = make_producer(db)
        headers = auth_header(user)
        payload = {"reason": "תוכן לא ראוי לפרסום"}

        first = client.post(
            f"/producers/{producer.id}/report", json=payload, headers=headers
        )
        assert first.status_code == 201

        second = client.post(
            f"/producers/{producer.id}/report", json=payload, headers=headers
        )
        assert second.status_code == 409
        assert second.json()["detail"] == "כבר דיווחת על בית עסק זה"

    def test_report_unique_constraint_enforced_at_db(self, db):
        reporter = make_user(db, email="dbrep@example.com")
        producer = make_producer(db)
        db.add(Report(reporter_id=reporter.id, producer_id=producer.id, reason="a"))
        db.commit()

        db.add(Report(reporter_id=reporter.id, producer_id=producer.id, reason="b"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


# ---------- producer delete: passive_deletes + SET NULL ----------
class TestProducerDeleteIntegrity:
    def test_delete_cascades_otp_and_kashrut_no_500(self, db):
        producer = make_producer(db)
        db.add(
            PhoneOtpToken(
                producer_id=producer.id,
                phone="0501234567",
                code="123456",
                expires_at=utc_now() + timedelta(minutes=10),
            )
        )
        db.add(KashrutBadgeRequest(producer_id=producer.id, badge_code="MEHADRIN"))
        db.commit()
        pid = producer.id

        # passive_deletes defers to DB ON DELETE CASCADE — no NotNullViolation
        # from the ORM trying to nullify the NOT NULL producer_id.
        db.delete(producer)
        db.commit()

        assert db.query(PhoneOtpToken).filter_by(producer_id=pid).count() == 0
        assert db.query(KashrutBadgeRequest).filter_by(producer_id=pid).count() == 0

    def test_delete_nullifies_linked_user(self, db):
        producer = make_producer(db)
        owner = make_user(db, role="producer", email="owner@example.com")
        owner.producer_id = producer.id
        db.commit()

        db.delete(producer)
        db.commit()

        db.refresh(owner)
        assert owner.producer_id is None


# ---------- group-buy capacity under the row lock ----------
class TestGroupBuyCapacity:
    def _make_gb(self, db, producer, *, max_participants):
        gb = GroupBuy(
            producer_id=producer.id,
            title="רכש קמח",
            description="שק",
            product_name="קמח",
            unit="שק",
            price_per_unit_regular=120,
            price_per_unit_group=90,
            min_participants=5,
            max_participants=max_participants,
            deadline=utc_now() + timedelta(days=3),
            city="תל אביב",
            status="open",
        )
        db.add(gb)
        db.commit()
        db.refresh(gb)
        return gb

    def test_capacity_counts_correctly_then_rejects_overflow(self, client, db):
        producer = make_producer(db, name="GB cap")
        gb = self._make_gb(db, producer, max_participants=2)

        for i in range(2):
            u = make_user(db, email=f"cap{i}@example.com")
            r = client.post(
                f"/group-buys/{gb.id}/commit",
                json={"quantity": 1},
                headers=auth_header(u),
            )
            assert r.status_code == 201

        # Third commit exceeds max_participants — the fresh count under the
        # row lock must reflect the two existing commits.
        u3 = make_user(db, email="cap3@example.com")
        r3 = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(u3),
        )
        assert r3.status_code == 400
