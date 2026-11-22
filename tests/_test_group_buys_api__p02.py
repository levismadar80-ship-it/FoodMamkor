"""Part 2 of 2 of `tests/test_group_buys_api.py`: TestFundedNotificationDispatch, TestOwnerStatusChange, TestExpectedStatus, TestCancelNotification.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_group_buys_api.py` imports these tests, so
their node ids stay `tests/test_group_buys_api.py::...`. Run them with
`pytest tests/test_group_buys_api.py` (add `-k <ClassName>` to narrow).
"""

from app.models.models import GroupBuy
from app.models.models import GroupBuyCommit
from app.services.group_buy_notifications import notify_participant_cancelled
from app.utils.clock import utc_now
from conftest import auth_header
from conftest import make_user
from datetime import timedelta
from unittest import mock
from uuid import uuid4
from _test_group_buys_api__common import _contact_details_in  # noqa: F401
from _test_group_buys_api__common import _make_group_buy  # noqa: F401
from _test_group_buys_api__common import _producer_user  # noqa: F401
JOIN_SUBJECT_PREFIX = "מהמקור — הצטרפת לקבוצה"


class TestFundedNotificationDispatch:
    """Idempotency, recipient fan-out, and the best-effort contract."""

    @staticmethod
    def _capture_sends(monkeypatch):
        sends = []
        def capture(to, subject, body, html=None, test_cause=False):
            # MEH-3591: the join confirmation is its own email with its own
            # tests (test_meh3591_missing_emails.py); these count funded mail.
            if subject.startswith(JOIN_SUBJECT_PREFIX):
                return
            sends.append({"to": to, "subject": subject, "body": body})

        monkeypatch.setattr("app.services.group_buy_notifications.send_email", capture)
        # MEH-3311: the below-goal email has its own module.
        monkeypatch.setattr("app.services.group_buy_goal_flap.send_email", capture)
        return sends

    def test_funded_notifies_both_sides_with_matching_count(
        self, client, db, monkeypatch
    ):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="gbowner_notify@test.com")
        gb = _make_group_buy(db, producer, min_participants=2)

        b1 = make_user(db, email="notify_b1@test.com")
        b2 = make_user(db, email="notify_b2@test.com")

        r1 = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b1),
        )
        assert r1.status_code == 201, r1.text
        # Below min → still open → nothing sent.
        assert r1.json()["status"] == "open"
        assert sends == []

        r2 = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b2),
        )
        assert r2.status_code == 201, r2.text
        assert r2.json()["status"] == "funded"

        # Exactly 2 message KINDS: one to the business, one per participant.
        recipients = sorted(s["to"] for s in sends)
        assert recipients == [
            "gbowner_notify@test.com",
            "notify_b1@test.com",
            "notify_b2@test.com",
        ]
        owner_msg = next(s for s in sends if s["to"] == owner.email)
        participant_msgs = [s for s in sends if s["to"] != owner.email]
        assert len({m["subject"] for m in participant_msgs}) == 1
        assert owner_msg["subject"] != participant_msgs[0]["subject"]

        # The count in the business's body matches the real commit count.
        commit_count = (
            db.query(GroupBuyCommit)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            .count()
        )
        assert commit_count == 2
        assert f"מספר הצטרפויות: {commit_count}" in owner_msg["body"]

        # And no body of either kind carries a contact detail. The group URL is
        # stripped first — a random uuid4 can contain a phone-shaped digit run,
        # which would be a false positive about the URL, not about a leak.
        for s in sends:
            scrubbed = s["body"].replace(str(gb.id), "").replace(str(producer.id), "")
            assert _contact_details_in(scrubbed) == [], s["body"]

        # MEH-2453: each participant gets a link to THIS business's page.
        for m in participant_msgs:
            assert f"/producer/{producer.id}" in m["body"], m["body"]
        assert f"/producer/{producer.id}" not in owner_msg["body"]

    def test_flap_around_threshold_is_told_once_and_never_again(
        self, client, db, monkeypatch
    ):
        sends = self._capture_sends(monkeypatch)
        producer, _ = _producer_user(db, email="gbowner_flap@test.com")
        gb = _make_group_buy(db, producer, min_participants=2)
        b1 = make_user(db, email="flap_b1@test.com")
        b2 = make_user(db, email="flap_b2@test.com")

        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b1),
        )
        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b2),
        )
        first_round = len(sends)
        assert first_round == 3  # 1 business + 2 participants

        # funded -> cancel -> open
        cancel = client.delete(
            f"/group-buys/{gb.id}/commit", headers=auth_header(b2)
        )
        assert cancel.status_code == 200, cancel.text
        assert client.get(f"/group-buys/{gb.id}").json()["status"] == "open"

        # rejoin -> funded a SECOND time
        rejoin = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b2),
        )
        assert rejoin.status_code == 201, rejoin.text
        assert rejoin.json()["status"] == "funded"

        # MEH-3311: the flap is told once each way — b1 (who stayed) hears it
        # dropped, then both participants hear it is back. Never the business,
        # never the funded email's own latch (MEH-1651) re-armed.
        extra = sends[first_round:]
        below = 'מהמקור — הקבוצה "רכש קמח מלא" ירדה מתחת ליעד'
        back = next(m["subject"] for m in sends if m["to"] == "flap_b1@test.com")
        assert sorted((m["to"], m["subject"]) for m in extra) == sorted(
            [
                ("flap_b1@test.com", below),
                ("flap_b1@test.com", back),
                ("flap_b2@test.com", back),
            ]
        )

        # A second flap sends nothing at all: every stamp is one-way.
        after_one_flap = len(sends)
        client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b2))
        again = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(b2),
        )
        assert again.json()["status"] == "funded"
        assert len(sends) == after_one_flap

        db.expire_all()
        refreshed = db.query(GroupBuy).filter(GroupBuy.id == gb.id).first()
        assert refreshed.funded_notified_at is not None

    def test_email_failure_never_fails_the_commit(self, client, db, monkeypatch):
        def _boom(*args, **kwargs):
            raise RuntimeError("Resend is down")

        monkeypatch.setattr(
            "app.services.group_buy_notifications.send_email", _boom
        )
        producer, _ = _producer_user(db, email="gbowner_boom@test.com")
        gb = _make_group_buy(db, producer, min_participants=1)
        buyer = make_user(db, email="boom_b1@test.com")

        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(buyer),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "funded"

    def test_commit_no_longer_persists_a_phone(self, client, db):
        """MEH-1651 removal guard — the column must stay NULL on write."""
        producer, _ = _producer_user(db, email="gbowner_nophone@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        buyer = make_user(db, email="nophone_b1@test.com")

        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            # An extra `phone` is ignored by the schema, not persisted — this
            # is the shape a stale client would still send.
            json={"quantity": 1, "phone": "0501234567"},
            headers=auth_header(buyer),
        )
        assert resp.status_code == 201, resp.text

        stored = (
            db.query(GroupBuyCommit)
            .filter(GroupBuyCommit.group_buy_id == gb.id)
            .first()
        )
        assert stored.phone is None

        # And the field is gone from the API contract entirely.
        detail = client.get(
            f"/group-buys/{gb.id}", headers=auth_header(buyer)
        ).json()
        assert detail["user_commit"] is not None
        assert "phone" not in detail["user_commit"]


# ---------- owner status change (MEH-2436) ----------
class TestOwnerStatusChange:
    """PATCH /group-buys/{id}/status — the business closes its own group buy.

    The owner gets exactly three transitions: open→cancelled (before or after
    the deadline), funded→fulfilled, funded→cancelled. Everything else is a
    409; someone else's group buy is a 403 whatever the transition. The route
    is owner-only: an admin gets 403 here and uses PATCH
    /admin/group-buys/{id}/status, which since MEH-2866 is held to the same
    table (no override).
    """

    def _patch(self, client, gb, status, user=None):
        headers = auth_header(user) if user else {}
        return client.patch(
            f"/group-buys/{gb.id}/status", json={"status": status}, headers=headers
        )

    def _status_in_db(self, db, gb):
        db.expire_all()
        return db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status

    def test_owner_cancels_open(self, client, db):
        producer, owner = _producer_user(db, email="own1@test.com")
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
        assert self._status_in_db(db, gb) == "cancelled"

    def test_owner_closes_open_after_deadline(self, client, db):
        producer, owner = _producer_user(db, email="own2@test.com")
        gb = _make_group_buy(db, producer, deadline=utc_now() - timedelta(days=1))
        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "cancelled"

    def test_owner_marks_funded_fulfilled(self, client, db):
        producer, owner = _producer_user(db, email="own3@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = self._patch(client, gb, "fulfilled", owner)
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "fulfilled"

    def test_owner_cancels_funded(self, client, db):
        producer, owner = _producer_user(db, email="own4@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "cancelled"

    def test_other_business_is_403_and_nothing_changes(self, client, db):
        producer, _ = _producer_user(db, email="own5@test.com")
        _, other = _producer_user(db, email="other5@test.com")
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "cancelled", other)
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "open"

    def test_consumer_is_403(self, client, db):
        producer, _ = _producer_user(db, email="own6@test.com")
        gb = _make_group_buy(db, producer)
        consumer = make_user(db, role="consumer", email="c6@test.com")
        # A demoted owner keeps producer_id (admin_extra.py role change does not
        # clear it), so the ownership check alone would let this through: only
        # the role gate stops it.
        consumer.producer_id = producer.id
        db.commit()
        resp = self._patch(client, gb, "cancelled", consumer)
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "open"

    def test_producer_without_a_business_is_403(self, client, db):
        producer, _ = _producer_user(db, email="own14@test.com")
        gb = _make_group_buy(db, producer)
        orphan = make_user(db, role="producer", email="orphan14@test.com")
        assert orphan.producer_id is None
        resp = self._patch(client, gb, "cancelled", orphan)
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "open"

    def test_unverified_owner_is_403(self, client, db):
        producer, owner = _producer_user(db, email="own7@test.com")
        owner.email_verified = False
        db.commit()
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "open"

    def test_anonymous_is_401(self, client, db):
        producer, _ = _producer_user(db, email="own8@test.com")
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "cancelled")
        assert resp.status_code == 401
        assert self._status_in_db(db, gb) == "open"

    def test_unknown_group_buy_is_404(self, client, db):
        _, owner = _producer_user(db, email="own9@test.com")
        resp = client.patch(
            f"/group-buys/{uuid4()}/status",
            json={"status": "cancelled"},
            headers=auth_header(owner),
        )
        assert resp.status_code == 404

    def test_invalid_value_is_422(self, client, db):
        producer, owner = _producer_user(db, email="own10@test.com")
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "deleted", owner)
        assert resp.status_code == 422
        assert self._status_in_db(db, gb) == "open"

    # Each pair is (current, requested): outside the owner's table → 409.
    @staticmethod
    def _forbidden_pairs():
        # Every (current, requested) pair over the four statuses, minus the
        # table: derived, not listed, so no pair can be forgotten (13 today,
        # incl. cancelled→cancelled, the repeat cancel that would email twice).
        from app.routers.group_buys import OWNER_TRANSITIONS

        statuses = ("open", "funded", "cancelled", "fulfilled")
        pairs = [
            (a, b) for a in statuses for b in statuses if (a, b) not in OWNER_TRANSITIONS
        ]
        assert len(pairs) == 13, pairs
        return pairs

    def test_transitions_outside_the_table_are_409(self, client, db):
        producer, owner = _producer_user(db, email="own11@test.com")
        for current, requested in self._forbidden_pairs():
            gb = _make_group_buy(db, producer, status=current)
            resp = self._patch(client, gb, requested, owner)
            assert resp.status_code == 409, (current, requested, resp.json())
            assert self._status_in_db(db, gb) == current, (current, requested)

    def test_admin_uses_the_admin_route_not_this_one(self, client, db):
        # This route is the business's. An admin goes through
        # PATCH /admin/group-buys/{id}/status — which, since MEH-2866 (Sapir
        # 10/11), is held to the SAME transition table: it used to be a full
        # override, and a cancelled group could be reopened after its
        # participants were emailed that it was cancelled.
        producer, _ = _producer_user(db, email="own12@test.com")
        admin = make_user(db, role="admin", email="adm12@test.com")
        gb = _make_group_buy(db, producer, status="cancelled")
        resp = self._patch(client, gb, "open", admin)
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "cancelled"
        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "open"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 409, resp.text
        assert self._status_in_db(db, gb) == "cancelled"

    def test_admin_route_refuses_every_pair_the_owner_route_refuses(self, client, db):
        """MEH-2866: one table for both routes — the forbidden pairs are 409 for
        an admin too, and the row does not move."""
        producer, _ = _producer_user(db, email="own13@test.com")
        admin = make_user(db, role="admin", email="adm13@test.com")
        for current, requested in self._forbidden_pairs():
            gb = _make_group_buy(db, producer, status=current)
            resp = client.patch(
                f"/admin/group-buys/{gb.id}/status",
                params={"status": requested},
                headers=auth_header(admin),
            )
            assert resp.status_code == 409, (current, requested, resp.text)
            assert self._status_in_db(db, gb) == current, (current, requested)

    def test_admin_route_honours_expected_status(self, client, db):
        """The state the admin saw must still hold under the lock (MEH-2489 for
        the admin route): a group that filled meanwhile is not cancelled blind."""
        producer, _ = _producer_user(db, email="own14@test.com")
        admin = make_user(db, role="admin", email="adm14@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "cancelled", "expected_status": "open"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 409, resp.text
        assert self._status_in_db(db, gb) == "funded"

    def test_admin_route_unknown_status_is_400_not_409(self, client, db):
        """A status outside the four is a bad request, checked before the
        transition table (which would otherwise answer 409)."""
        producer, _ = _producer_user(db, email="own14b@test.com")
        admin = make_user(db, role="admin", email="adm14b@test.com")
        gb = _make_group_buy(db, producer, status="open")
        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status",
            params={"status": "archived"},
            headers=auth_header(admin),
        )
        assert resp.status_code == 400, resp.text
        assert self._status_in_db(db, gb) == "open"

    def test_owner_of_a_no_longer_approved_business_can_still_cancel(
        self, client, db
    ):
        # Creating needs an approved business; closing does not, on purpose: a
        # business that was suspended must still be able to close what it opened.
        producer, owner = _producer_user(db, email="own15@test.com", status="pending")
        gb = _make_group_buy(db, producer)
        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "cancelled"

    def test_participant_cannot_leave_a_closed_group_buy(self, client, db):
        # Once the owner has cancelled or fulfilled, leaving would rewrite the
        # record of who took part, and on a funded→fulfilled group the old
        # revert path would even reopen it.
        producer, owner = _producer_user(db, email="own13@test.com")
        for final in ("cancelled", "fulfilled"):
            gb = _make_group_buy(db, producer, status="funded", min_participants=1)
            buyer = make_user(db, email=f"leaver-{final}@test.com")
            db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=buyer.id, quantity=1))
            db.commit()
            assert self._patch(client, gb, final, owner).status_code == 200
            resp = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(buyer))
            assert resp.status_code == 400, (final, resp.json())
            assert self._status_in_db(db, gb) == final
            assert db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).count() == 1


# ---------- stale dashboard: expected_status (MEH-2489) ----------
class TestExpectedStatus:
    """The dashboard sends the status it showed; a row that moved on is a 409.

    The race: the owner opens «ביטול» on an open group, a last participant
    joins (open → funded), and the cancel still lands — funded → cancelled is
    in the owner's table — on a group whose funded double-confirm she never saw.
    """

    def _patch(self, client, gb, body, user):
        return client.patch(
            f"/group-buys/{gb.id}/status", json=body, headers=auth_header(user)
        )

    def _status_in_db(self, db, gb):
        db.expire_all()
        return db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status

    def test_dashboard_saw_open_but_group_funded_meanwhile_is_409(self, client, db):
        producer, owner = _producer_user(db, email="exp1@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        with mock.patch("app.routers.group_buys.send_cancelled_notifications") as send:
            resp = self._patch(
                client, gb, {"status": "cancelled", "expected_status": "open"}, owner
            )
        assert resp.status_code == 409, resp.json()
        assert resp.json()["detail"] == "אי אפשר לשנות את קבוצת הרכישה למצב הזה"
        assert self._status_in_db(db, gb) == "funded"
        send.assert_not_called()

    def test_matching_expected_status_goes_through(self, client, db):
        producer, owner = _producer_user(db, email="exp2@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = self._patch(
            client, gb, {"status": "cancelled", "expected_status": "funded"}, owner
        )
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "cancelled"

    def test_without_expected_status_behaviour_is_unchanged(self, client, db):
        # Control: the same funded row and the same request minus the field is
        # the pre-MEH-2489 behaviour — the cancel lands.
        producer, owner = _producer_user(db, email="exp3@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = self._patch(client, gb, {"status": "cancelled"}, owner)
        assert resp.status_code == 200
        assert self._status_in_db(db, gb) == "cancelled"

    def test_a_stranger_gets_403_not_409(self, client, db):
        # The ownership check runs first: a mismatched expected_status must not
        # let someone else's caller probe the row's state.
        producer, _ = _producer_user(db, email="exp4@test.com")
        _, other = _producer_user(db, email="exp4other@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        resp = self._patch(
            client, gb, {"status": "cancelled", "expected_status": "open"}, other
        )
        assert resp.status_code == 403
        assert self._status_in_db(db, gb) == "funded"

    def test_invalid_expected_status_is_422(self, client, db):
        producer, owner = _producer_user(db, email="exp5@test.com")
        gb = _make_group_buy(db, producer)
        resp = self._patch(
            client, gb, {"status": "cancelled", "expected_status": "deleted"}, owner
        )
        assert resp.status_code == 422
        assert self._status_in_db(db, gb) == "open"


# ---------- cancel email to participants (MEH-2435 chunk 4) ----------
class TestCancelNotification:
    """The business cancels (or closes) its group buy → each participant hears.

    Wording approved by Sapir 27/10 16:42Z. Same best-effort shape as the
    funded email: background task, a failed send never fails the cancel. Sent
    once by construction: cancelled is final for the owner (OWNER_TRANSITIONS),
    and the transition check runs under the row lock, so a second cancel is a
    409 that sends nothing.
    """

    SUBJECT_TAIL = "בוטלה"

    @staticmethod
    def _capture_sends(monkeypatch):
        sends = []
        monkeypatch.setattr(
            "app.services.group_buy_notifications.send_email",
            # MEH-3591: skip the join confirmation, as in the class above.
            lambda to, subject, body, html=None, test_cause=False: None
            if subject.startswith(JOIN_SUBJECT_PREFIX)
            else sends.append({"to": to, "subject": subject, "body": body}),
        )
        return sends

    def _cancel_sends(self, sends):
        return [s for s in sends if s["subject"].endswith(self.SUBJECT_TAIL)]

    @staticmethod
    def _join(client, db, gb, *emails):
        for email in emails:
            buyer = make_user(db, email=email)
            resp = client.post(
                f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
            )
            assert resp.status_code == 201, resp.text

    @staticmethod
    def _patch(client, gb, status, user):
        return client.patch(
            f"/group-buys/{gb.id}/status", json={"status": status}, headers=auth_header(user)
        )

    def test_template_wording_and_no_contact_details(self):
        sent = {}

        def _capture(to, subject, body, html=None, test_cause=False):
            sent.update(to=to, subject=subject, body=body)

        with mock.patch("app.services.group_buy_notifications.send_email", _capture):
            notify_participant_cancelled("buyer@test.com", "רכש קמח מלא", "מאפיית הגליל")

        assert sent["to"] == "buyer@test.com"
        assert sent["subject"] == 'מהמקור — הקבוצה "רכש קמח מלא" בוטלה'
        assert sent["body"] == (
            "שלום,\n\n"
            'הקבוצה שהצטרפת אליה, "רכש קמח מלא", בוטלה על ידי מאפיית הגליל.\n'
            "לשאלות צרו קשר עם מאפיית הגליל.\n\n"
            "בברכה,\nצוות מהמקור"
        )
        assert _contact_details_in(sent["body"]) == []

    def test_owner_cancels_open_group_every_participant_is_told(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own1@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_b1@test.com", "cn_b2@test.com")

        assert self._patch(client, gb, "cancelled", owner).status_code == 200

        cancels = self._cancel_sends(sends)
        assert sorted(s["to"] for s in cancels) == ["cn_b1@test.com", "cn_b2@test.com"]
        # The business is not a participant and gets nothing.
        assert all(s["to"] != owner.email for s in sends)
        for s in cancels:
            assert producer.name in s["body"]
            assert "רכש קמח מלא" in s["subject"]

    def test_owner_cancels_funded_group(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own2@test.com")
        gb = _make_group_buy(db, producer, min_participants=2)
        self._join(client, db, gb, "cn_f1@test.com", "cn_f2@test.com")
        assert len(sends) == 3  # the funded emails: business + 2 participants

        assert self._patch(client, gb, "cancelled", owner).status_code == 200
        assert sorted(s["to"] for s in self._cancel_sends(sends)) == [
            "cn_f1@test.com",
            "cn_f2@test.com",
        ]

    def test_closing_after_the_deadline_also_tells_participants(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own3@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_c1@test.com")
        gb.deadline = utc_now() - timedelta(days=1)
        db.commit()

        assert self._patch(client, gb, "cancelled", owner).status_code == 200
        assert [s["to"] for s in self._cancel_sends(sends)] == ["cn_c1@test.com"]

    def test_no_participants_no_email(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own4@test.com")
        gb = _make_group_buy(db, producer)
        assert self._patch(client, gb, "cancelled", owner).status_code == 200
        assert sends == []

    def test_marking_delivered_sends_no_cancel_email(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own5@test.com")
        gb = _make_group_buy(db, producer, min_participants=1)
        self._join(client, db, gb, "cn_d1@test.com")
        before = len(sends)

        assert self._patch(client, gb, "fulfilled", owner).status_code == 200
        assert len(sends) == before
        assert self._cancel_sends(sends) == []

    def test_second_cancel_is_409_and_sends_nothing_more(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own6@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_r1@test.com")

        assert self._patch(client, gb, "cancelled", owner).status_code == 200
        assert len(self._cancel_sends(sends)) == 1
        assert self._patch(client, gb, "cancelled", owner).status_code == 409
        assert len(self._cancel_sends(sends)) == 1

    def test_refused_cancel_sends_nothing(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, _ = _producer_user(db, email="cn_own7@test.com")
        _, other = _producer_user(db, email="cn_other7@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_x1@test.com")

        assert self._patch(client, gb, "cancelled", other).status_code == 403
        assert sends == []

    def test_email_failure_never_fails_the_cancel(self, client, db, monkeypatch):
        def _boom(*args, **kwargs):
            raise RuntimeError("Resend is down")

        producer, owner = _producer_user(db, email="cn_own8@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_e1@test.com", "cn_e2@test.com")
        monkeypatch.setattr("app.services.group_buy_notifications.send_email", _boom)

        resp = self._patch(client, gb, "cancelled", owner)
        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "cancelled"

    def test_owner_who_joined_her_own_group_is_not_emailed(self, client, db, monkeypatch):
        sends = self._capture_sends(monkeypatch)
        producer, owner = _producer_user(db, email="cn_own9@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_o1@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(owner)
        )
        assert resp.status_code == 201, resp.text

        assert self._patch(client, gb, "cancelled", owner).status_code == 200
        assert [s["to"] for s in self._cancel_sends(sends)] == ["cn_o1@test.com"]

    def test_admin_cancel_through_the_admin_route_emails_every_participant(
        self, client, db, monkeypatch
    ):
        # MEH-2866 (Sapir 10/11): an admin's cancel sends the same email as the
        # business's. It used to send nothing — participants of a group an
        # admin cancelled were never told.
        sends = self._capture_sends(monkeypatch)
        producer, _ = _producer_user(db, email="cn_own10@test.com")
        admin = make_user(db, role="admin", email="cn_adm10@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_a1@test.com")

        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status?status=cancelled", headers=auth_header(admin)
        )
        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert db.query(GroupBuy).filter(GroupBuy.id == gb.id).one().status == "cancelled"
        assert [x["to"] for x in self._cancel_sends(sends)] == ["cn_a1@test.com"]

    def test_admin_who_joined_the_group_is_not_emailed_about_her_own_cancel(
        self, client, db, monkeypatch
    ):
        # The admin is the actor, like the owner on the owner route: she is
        # left out of the recipients even when she committed to the group.
        sends = self._capture_sends(monkeypatch)
        producer, _ = _producer_user(db, email="cn_own11@test.com")
        admin = make_user(db, role="admin", email="cn_adm11@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        self._join(client, db, gb, "cn_b1@test.com")
        db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=admin.id, quantity=1))
        db.commit()

        resp = client.patch(
            f"/admin/group-buys/{gb.id}/status?status=cancelled", headers=auth_header(admin)
        )
        assert resp.status_code == 200, resp.text
        assert [x["to"] for x in self._cancel_sends(sends)] == ["cn_b1@test.com"]
