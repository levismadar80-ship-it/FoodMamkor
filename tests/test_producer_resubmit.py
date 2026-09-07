"""
Module:   test_producer_resubmit
Purpose:  MEH-2210 chunk A — the rejected → resubmit loop on
          POST /producers/me/request-review, the structured rejection code on
          POST /admin/producers/{id}/reject, and the symmetric clearing on
          approve. Every case asserts BEHAVIOUR through the endpoints
          (ADR-032 §3.6), never that a prescribed line was applied.
Touches:  nothing on disk — DB rows only, through the conftest fixtures.
Does NOT: test the dashboard banner (chunk B, vitest) or the admin queue
          badge / rejection email (chunk C).
Related:  tests/test_api.py::TestMeh1236RequestReview (the pending path this
          extends — unchanged, and re-asserted here as the control),
          tests/test_api.py::TestMeh2120RequestReviewGate (the completeness
          gate the rejected branch reuses, incl. the unverified-phone 422).
History:  MEH-2210 (creation). Phase 0 (03/09) refuted two premises of the
          card's spec: `pending_whatsapp` no longer exists (MEH-2124) so an
          unverified phone is a 422 from the shared gate, not a status; and
          the reason vocabulary is the existing `preset_key`, not a second
          enum. Both rulings accepted 04/09 (MEH-2227 BRIEF drain-26).
"""

import pytest
from conftest import auth_header, make_producer, make_submit_ready_producer, make_user

from app.constants import MAX_PRODUCER_RESUBMISSIONS
from app.models.models import Producer

REVIEW = "/producers/me/request-review"


def _admin(db, email="admin-2210@example.com"):
    return make_user(db, email=email, role="admin")


def _rejected_owner(db, *, count=0, code=None, reason="חסר רישיון"):
    """A COMPLETE producer already rejected `count` times — the resubmit
    baseline. Complete, so the shared gate cannot decide the outcome."""
    producer, user = make_submit_ready_producer(db, status="rejected")
    producer.rejection_reason = reason
    producer.rejection_reason_code = code
    producer.resubmission_count = count
    db.commit()
    return producer, user


def _fresh(db, producer):
    db.expire_all()
    return db.query(Producer).filter(Producer.id == producer.id).one()


# --- 1. admin reject stores the structured code -------------------------------


class TestRejectStoresCode:
    def test_reject_with_preset_stores_code_and_text(self, client, db):
        producer = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={"preset_key": "missing_image", "reason": "רק לוגו"},
            headers=auth_header(_admin(db)),
        )
        assert resp.status_code == 200
        row = _fresh(db, producer)
        assert row.status == "rejected"
        assert row.rejection_reason_code == "missing_image"
        # The composed text is unchanged from MEH-226 — the code rides beside
        # it, it does not replace it.
        assert row.rejection_reason == "תמונה ראשית חסרה — רק לוגו"

    def test_unknown_preset_is_refused_before_mutating(self, client, db):
        producer = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={"preset_key": "documents_missing", "reason": "x"},
            headers=auth_header(_admin(db)),
        )
        # 400 is the EXISTING contract (MEH-226); the card's spec said 422 for
        # its own enum, and that enum was dropped for the preset vocabulary —
        # so the existing status stays. The producer is untouched.
        assert resp.status_code == 400
        row = _fresh(db, producer)
        assert row.status == "pending"
        assert row.rejection_reason_code is None

    def test_legacy_free_text_reject_leaves_code_null(self, client, db):
        producer = make_producer(db, status="pending")
        resp = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={"reason": "טקסט חופשי בלבד"},
            headers=auth_header(_admin(db)),
        )
        assert resp.status_code == 200
        row = _fresh(db, producer)
        assert row.rejection_reason == "טקסט חופשי בלבד"
        assert row.rejection_reason_code is None


# --- 2. the rejected → pending transition ------------------------------------


class TestResubmitFromRejected:
    def test_first_resubmit_moves_to_pending_and_counts(self, client, db, monkeypatch):
        called = []
        import app.services.auth_notifications as an

        monkeypatch.setattr(
            an,
            "notify_admin_producer_resubmit",
            lambda *a, **kw: called.append((a, kw)),
        )
        producer, user = _rejected_owner(db, code="missing_image")

        resp = client.post(REVIEW, headers=auth_header(user))

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "pending"
        assert body["resubmission_count"] == 1
        row = _fresh(db, producer)
        assert row.status == "pending"
        assert row.resubmission_count == 1
        assert row.resubmitted_at is not None
        assert row.resubmitted_at.tzinfo is not None, "tz-aware (MEH-762)"
        # The admin's history is KEPT on resubmit — only approve clears it.
        assert row.rejection_reason == "חסר רישיון"
        assert row.rejection_reason_code == "missing_image"
        # The admin ping carries the count, so the queue reads "שליחה חוזרת #1".
        assert called == [((producer.name, producer.city), {"resubmission_count": 1})]

    def test_unverified_phone_is_422_from_the_shared_gate(
        self, client, db, monkeypatch
    ):
        """Ruling 1 (04/09): no `pending_whatsapp` — the unverified phone is
        answered by the same gate as the front door, and nothing moves."""
        called = []
        import app.services.auth_notifications as an

        monkeypatch.setattr(
            an, "notify_admin_producer_resubmit", lambda *a, **kw: called.append(a)
        )
        producer, user = _rejected_owner(db)
        producer.phone_verified = False
        db.commit()

        resp = client.post(REVIEW, headers=auth_header(user))

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["code"] == "submit_gate_incomplete"
        assert detail["params"]["missing"] == ["phone_verified"]
        row = _fresh(db, producer)
        assert row.status == "rejected"
        assert row.resubmission_count == 0
        assert called == []

    def test_third_resubmit_ok_fourth_is_409(self, client, db):
        """The cap, exercised end to end: the endpoint itself increments the
        count, so the 4th attempt is refused by state the 3 earlier calls wrote."""
        from app.rate_limit import limiter

        producer, user = _rejected_owner(db)
        admin = _admin(db)
        headers = auth_header(user)
        seen = []
        for n in range(1, MAX_PRODUCER_RESUBMISSIONS + 1):
            # The endpoint's OWN 3/hour limit (MEH-1236) would answer the 4th
            # call with 429 before the cap could; the two are independent and
            # this test is about the cap, so the limiter is reset per attempt
            # (same reset the autouse conftest fixture performs per test).
            limiter._storage.reset()
            resp = client.post(REVIEW, headers=headers)
            seen.append(resp.status_code)
            assert _fresh(db, producer).resubmission_count == n
            # The admin rejects again between attempts (a real loop, not a
            # count edited by hand).
            rej = client.post(
                f"/admin/producers/{producer.id}/reject",
                json={"preset_key": "other", "reason": f"סבב {n}"},
                headers=auth_header(admin),
            )
            assert rej.status_code == 200
        assert seen == [200] * MAX_PRODUCER_RESUBMISSIONS

        limiter._storage.reset()
        fourth = client.post(REVIEW, headers=headers)
        assert fourth.status_code == 409
        assert fourth.json()["detail"] == "הגעתן למספר השליחות המקסימלי — צרו איתנו קשר"
        row = _fresh(db, producer)
        assert row.status == "rejected"
        assert row.resubmission_count == MAX_PRODUCER_RESUBMISSIONS

    def test_resubmit_lookup_locks_the_producer_row(self, client, db):
        """Guard for the cap race (CI reviewer on #3343/#3373): the check and
        the `+ 1` are two ORM steps, so the producer lookup that precedes them
        must carry FOR UPDATE. A concurrency test cannot run on the per-test
        fixture; this captures the SQL the endpoint actually emits and asserts
        the lock is on the producers SELECT. Drop `.with_for_update()` and the
        captured statement has no FOR UPDATE — red by construction."""
        from sqlalchemy import event

        from app.database import engine

        producer, user = _rejected_owner(db)
        seen: list[str] = []

        def _capture(conn, cursor, statement, parameters, context, executemany):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", _capture)
        try:
            resp = client.post(REVIEW, headers=auth_header(user))
        finally:
            event.remove(engine, "before_cursor_execute", _capture)

        assert resp.status_code == 200, resp.text
        producer_selects = [
            s
            for s in seen
            if s.lstrip().upper().startswith("SELECT") and "FROM producers" in s
        ]
        assert producer_selects, (
            "no SELECT on producers captured — the listener saw nothing"
        )
        assert any("FOR UPDATE" in s.upper() for s in producer_selects), (
            "the producer lookup in request_producer_review is not row-locked"
        )

    def test_cap_wins_over_the_completeness_gate(self, client, db):
        """A capped business with a gap gets the cap message, not a fix-it
        list for a submission it cannot make."""
        producer, user = _rejected_owner(db, count=MAX_PRODUCER_RESUBMISSIONS)
        producer.images = []
        db.commit()
        resp = client.post(REVIEW, headers=auth_header(user))
        assert resp.status_code == 409
        assert "המקסימלי" in resp.json()["detail"]

    @pytest.mark.parametrize("status", ["approved", "inactive", "draft"])
    def test_other_statuses_stay_409(self, client, db, status):
        _, user = make_submit_ready_producer(db, status=status)
        resp = client.post(REVIEW, headers=auth_header(user))
        assert resp.status_code == 409
        assert resp.json()["detail"] == (
            "ניתן לשלוח לבדיקה חוזרת רק כשבית העסק בהמתנה לאישור"
        )

    def test_pending_path_leaves_count_at_zero(self, client, db, monkeypatch):
        """The control: MEH-1236's notification-only ping is unchanged — same
        two-argument call, no count, no status write."""
        called = []
        import app.services.auth_notifications as an

        monkeypatch.setattr(
            an,
            "notify_admin_producer_resubmit",
            lambda *a, **kw: called.append((a, kw)),
        )
        producer, user = make_submit_ready_producer(db, status="pending")
        resp = client.post(REVIEW, headers=auth_header(user))
        assert resp.status_code == 200
        assert resp.json() == {"detail": "נשלח לבדיקה חוזרת"}
        row = _fresh(db, producer)
        assert row.status == "pending"
        assert row.resubmission_count == 0
        assert row.resubmitted_at is None
        assert called == [((producer.name, producer.city), {})]


# --- 3. approve clears the trail, keeps the history --------------------------


class TestApproveClearsRejectionTrail:
    def test_approve_clears_reason_and_code_keeps_count(self, client, db):
        producer, owner = _rejected_owner(db, count=2, code="missing_docs")
        resp = client.post(REVIEW, headers=auth_header(owner))
        assert resp.status_code == 200  # rejected → pending, count 3

        approve = client.post(
            f"/admin/producers/{producer.id}/approve",
            headers=auth_header(_admin(db)),
        )
        assert approve.status_code == 200, approve.json()
        row = _fresh(db, producer)
        assert row.status == "approved"
        assert row.rejection_reason is None
        assert row.rejection_reason_code is None
        assert row.resubmission_count == 3, "history is not reset by approve"


# --- 4. the fields reach the three readers ------------------------------------


class TestFieldsAreExposed:
    def test_auth_me_carries_code_and_count(self, client, db):
        producer, user = _rejected_owner(db, count=1, code="incomplete_info")
        resp = client.get("/auth/me", headers=auth_header(user))
        assert resp.status_code == 200
        body = resp.json()
        assert body["producer_status"] == "rejected"
        assert body["producer_rejection_reason"] == "חסר רישיון"
        assert body["producer_rejection_reason_code"] == "incomplete_info"
        assert body["producer_resubmission_count"] == 1

    def test_admin_and_owner_reads_carry_the_trail(self, client, db):
        producer, user = _rejected_owner(db, count=2, code="not_eligible")
        admin_resp = client.get(
            f"/admin/producers/{producer.id}", headers=auth_header(_admin(db))
        )
        assert admin_resp.status_code == 200
        admin_body = admin_resp.json()
        assert admin_body["rejection_reason_code"] == "not_eligible"
        assert admin_body["resubmission_count"] == 2

        owner_resp = client.get("/producers/me", headers=auth_header(user))
        assert owner_resp.status_code == 200
        owner_body = owner_resp.json()
        assert owner_body["rejection_reason_code"] == "not_eligible"
        assert owner_body["resubmission_count"] == 2


# --- 5. the rejection email points at the loop (chunk C) ----------------------


class TestRejectionEmailPointsAtTheLoop:
    def test_reject_sends_both_parts_with_the_dashboard_link(
        self, client, db, monkeypatch
    ):
        from app.routers import admin as admin_module

        sent = {}

        def _capture(to_email, subject, body, html=None):
            sent.update(to=to_email, subject=subject, body=body, html=html)

        monkeypatch.setattr(admin_module, "_send_notification_email", _capture)
        producer = make_producer(db, status="pending")
        owner = make_user(db, email="rejected-owner@example.com", role="producer")
        owner.producer_id = producer.id
        db.commit()

        resp = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={"preset_key": "missing_image", "reason": "רק לוגו"},
            headers=auth_header(_admin(db)),
        )
        assert resp.status_code == 200
        assert sent["to"] == "rejected-owner@example.com"
        link = "/producer/dashboard"
        # Text part: the composed reason (label + free text) and the link line.
        assert "הסיבה: תמונה ראשית חסרה — רק לוגו" in sent["body"]
        assert "אפשר לתקן ולשלוח שוב מלוח הבקרה: " in sent["body"]
        assert link in sent["body"]
        # HTML part: RTL document, same reason, the link as an anchor.
        html = sent["html"]
        assert html is not None and html.startswith("<!DOCTYPE html>")
        assert '<html dir="rtl" lang="he">' in html
        assert "תמונה ראשית חסרה — רק לוגו" in html
        assert 'href="' in html and link in html

    def test_reason_free_reject_has_no_dangling_reason_line_in_either_part(
        self, client, db, monkeypatch
    ):
        from app.routers import admin as admin_module

        sent = {}
        monkeypatch.setattr(
            admin_module,
            "_send_notification_email",
            lambda to, subject, body, html=None: sent.update(body=body, html=html),
        )
        producer = make_producer(db, status="pending")
        owner = make_user(db, email="rejected-owner-2@example.com", role="producer")
        owner.producer_id = producer.id
        db.commit()
        resp = client.post(
            f"/admin/producers/{producer.id}/reject",
            json={},
            headers=auth_header(_admin(db)),
        )
        assert resp.status_code == 200
        assert "הסיבה:" not in sent["body"]
        assert "הסיבה:" not in sent["html"]
        assert "/producer/dashboard" in sent["html"]

    def test_html_escapes_a_crafted_business_name(self):
        from app.routers import admin as admin_module

        html = admin_module._producer_rejected_html("<b>x</b> & co", "r", "https://x/d")
        assert "<b>x</b>" not in html
        assert "&lt;b&gt;x&lt;/b&gt; &amp; co" in html
