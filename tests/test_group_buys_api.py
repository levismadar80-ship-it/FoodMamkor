"""Integration tests for the group-buys router (app/routers/group_buys.py).

Exercises the public list/detail endpoints, the producer create flow with
its guards, and the consumer commit/cancel lifecycle (auto-fund at
min_participants, revert-to-open on cancel, duplicate/closed/full/deadline
error paths). Uses the shared conftest fixtures + a producer-user helper
mirroring test_producer_recipes.py.
"""

import re
from datetime import datetime, timedelta, timezone
from unittest import mock
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.models.models import GroupBuy, GroupBuyCommit
from app.services.group_buy_notifications import (
    notify_participant_funded,
    notify_producer_funded,
)


def _producer_user(db, *, email="gbprod@test.com", status="approved"):
    producer = make_producer(db, name=f"GB Producer {uuid4().hex[:6]}", status=status)
    user = make_user(db, role="producer", email=email)
    user.producer_id = producer.id
    db.commit()
    db.refresh(user)
    return producer, user


def _make_group_buy(
    db,
    producer,
    *,
    status="open",
    deadline=None,
    min_participants=2,
    max_participants=None,
    city="תל אביב",
):
    gb = GroupBuy(
        producer_id=producer.id,
        title="רכש קמח מלא",
        description='שק 25 ק"ג',
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=min_participants,
        max_participants=max_participants,
        deadline=deadline or (datetime.utcnow() + timedelta(days=7)),
        city=city,
        status=status,
    )
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return gb


def _valid_create_payload(**overrides):
    payload = {
        "title": "רכש שמן זית",
        "product_name": "שמן זית כתית",
        "unit": "ליטר",
        "price_per_unit_regular": 80,
        "price_per_unit_group": 60,
        "min_participants": 3,
        "deadline": (datetime.utcnow() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
    }
    payload.update(overrides)
    return payload


# ---------- list / detail ----------
class TestListAndGet:
    def test_list_returns_open_by_default(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, status="open")
        _make_group_buy(db, producer, status="funded")
        resp = client.get("/group-buys")
        assert resp.status_code == 200
        statuses = {g["status"] for g in resp.json()}
        assert statuses == {"open"}

    def test_list_filters_by_city(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, city="חיפה")
        _make_group_buy(db, producer, city="אילת")
        resp = client.get("/group-buys", params={"city": "אילת"})
        assert resp.status_code == 200
        assert all(g["city"] == "אילת" for g in resp.json())

    def test_list_status_filter(self, client, db):
        producer, _ = _producer_user(db)
        _make_group_buy(db, producer, status="funded")
        resp = client.get("/group-buys", params={"status": "funded"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_detail_happy(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        resp = client.get(f"/group-buys/{gb.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["producer_name"] == producer.name
        assert body["commits_count"] == 0
        assert body["user_committed"] is False

    def test_get_detail_404(self, client, db):
        resp = client.get(f"/group-buys/{uuid4()}")
        assert resp.status_code == 404


# ---------- create ----------
class TestCreate:
    def test_create_happy(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys", json=_valid_create_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 201
        assert "id" in resp.json()

    def test_create_requires_auth(self, client, db):
        resp = client.post("/group-buys", json=_valid_create_payload())
        assert resp.status_code in (401, 403)

    def test_create_rejected_for_consumer(self, client, db):
        consumer = make_user(db, role="consumer", email="c@test.com")
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(),
            headers=auth_header(consumer),
        )
        assert resp.status_code == 403

    def test_create_blocked_for_unapproved_producer(self, client, db):
        _, user = _producer_user(db, email="pend@test.com", status="pending")
        resp = client.post(
            "/group-buys", json=_valid_create_payload(), headers=auth_header(user)
        )
        assert resp.status_code == 403

    def test_group_price_must_be_below_regular(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(
                price_per_unit_regular=50, price_per_unit_group=60
            ),
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_deadline_must_be_future(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(
                deadline=(datetime.utcnow() - timedelta(days=1)).isoformat()
            ),
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    # ---- MEH-1454: aware/naive deadline regression ----
    # The dashboard form sends `new Date(form.deadline).toISOString()` — an ISO
    # string with a trailing `Z`, which Pydantic parses to a timezone-AWARE
    # datetime. The route compared it against `datetime.utcnow()` (naive), which
    # raised `TypeError: can't compare offset-naive and offset-aware datetimes`
    # → 500 on every real create. These tests pin the aware path to 201.

    def _future_aware_iso(self, days=10):
        """Mirror the frontend's toISOString(): UTC with a trailing 'Z'."""
        dt = datetime.now(timezone.utc) + timedelta(days=days)
        return dt.isoformat().replace("+00:00", "Z")

    def test_create_aware_deadline_z_suffix(self, client, db):
        """Phase 0 repro: aware ISO-Z deadline must persist (was 500)."""
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(deadline=self._future_aware_iso()),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        gb_id = resp.json()["id"]
        # Appears in the public open list
        listed = client.get("/group-buys").json()
        assert any(g["id"] == gb_id for g in listed)

    def test_create_naive_deadline_still_works(self, client, db):
        """Naive ISO (no offset) must keep working — unchanged behavior."""
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(
                deadline=(datetime.utcnow() + timedelta(days=10)).isoformat()
            ),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text

    # ---- MEH-1457: fulfillment_note ----
    def test_create_with_fulfillment_note_returned_in_get(self, client, db):
        _, user = _producer_user(db)
        note = "איסוף מהמשק ביום שישי אחרי סגירת הקבוצה"
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(fulfillment_note=note),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        gb_id = resp.json()["id"]
        detail = client.get(f"/group-buys/{gb_id}")
        assert detail.status_code == 200
        assert detail.json()["fulfillment_note"] == note

    def test_create_without_fulfillment_note_is_null(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        gb_id = resp.json()["id"]
        detail = client.get(f"/group-buys/{gb_id}")
        assert detail.status_code == 200
        assert detail.json()["fulfillment_note"] is None

    def test_create_past_aware_deadline_is_400_not_500(self, client, db):
        """A past aware deadline → Hebrew 400, never a 500."""
        _, user = _producer_user(db)
        past = (
            (datetime.now(timezone.utc) - timedelta(days=1))
            .isoformat()
            .replace("+00:00", "Z")
        )
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(deadline=past),
            headers=auth_header(user),
        )
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == "המועד האחרון חייב להיות בעתיד"


# ---------- commit / cancel lifecycle ----------
class TestCommitLifecycle:
    def test_commit_happy_and_auto_fund(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=1)
        user = make_user(db, email="buyer1@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 2},
            headers=auth_header(user),
        )
        assert resp.status_code == 201
        body = resp.json()
        # min_participants=1 → first commit funds the buy
        assert body["status"] == "funded"
        assert body["commits_count"] == 1

    def test_commit_requires_auth(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        resp = client.post(f"/group-buys/{gb.id}/commit", json={"quantity": 1})
        assert resp.status_code in (401, 403)

    def test_commit_404(self, client, db):
        user = make_user(db, email="buyer404@test.com")
        resp = client.post(
            f"/group-buys/{uuid4()}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 404

    def test_commit_rejected_when_closed(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, status="funded")
        user = make_user(db, email="buyer2@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_commit_rejected_after_deadline(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(
            db, producer, deadline=datetime.utcnow() - timedelta(hours=1)
        )
        user = make_user(db, email="buyer3@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert resp.status_code == 400

    def test_duplicate_commit_rejected(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=5)
        user = make_user(db, email="buyer4@test.com")
        first = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert first.status_code == 201
        second = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        assert second.status_code == 400

    def test_commit_rejected_when_full(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=5, max_participants=1)
        first_user = make_user(db, email="full1@test.com")
        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(first_user),
        )
        second_user = make_user(db, email="full2@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(second_user),
        )
        assert resp.status_code == 400

    def test_cancel_commit_happy(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, min_participants=5)
        user = make_user(db, email="canceller@test.com")
        client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(user),
        )
        resp = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(user))
        assert resp.status_code == 200

    def test_cancel_without_commit_404(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        user = make_user(db, email="nocommit@test.com")
        resp = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(user))
        assert resp.status_code == 404

    def test_commit_and_cancel_after_aware_create(self, client, db):
        """MEH-1454 consistency: a group created via the API with an aware
        ISO-Z deadline stores a naive-UTC deadline, so the commit and cancel
        deadline comparisons (`gb.deadline < datetime.utcnow()`) still work."""
        _, producer_user = _producer_user(db)
        aware = (
            (datetime.now(timezone.utc) + timedelta(days=10))
            .isoformat()
            .replace("+00:00", "Z")
        )
        created = client.post(
            "/group-buys",
            json=_valid_create_payload(deadline=aware, min_participants=2),
            headers=auth_header(producer_user),
        )
        assert created.status_code == 201, created.text
        gb_id = created.json()["id"]

        buyer = make_user(db, email="awarebuyer@test.com")
        commit = client.post(
            f"/group-buys/{gb_id}/commit",
            json={"quantity": 1},
            headers=auth_header(buyer),
        )
        assert commit.status_code == 201, commit.text
        cancel = client.delete(
            f"/group-buys/{gb_id}/commit", headers=auth_header(buyer)
        )
        assert cancel.status_code == 200, cancel.text


# ---------- full lifecycle (MEH-1458) ----------
class TestFullLifecycle:
    """MEH-1458 — one integration test covering the whole group-buy lifecycle:
    create (approved producer) → appears open in the public list + under its
    city filter → two distinct consumers commit → auto-fund at min_participants
    → a consumer cancels → drops below min → reverts to open.

    Chosen (Sapir, 22/07) over a Playwright E2E because the CI E2E job has no
    authentication wired (localhost target → global-setup skips storageState;
    DEMO_*/SMOKE_ADMIN secrets absent; only one seeded consumer; no-mocks rule)
    — so a browser lifecycle spec cannot run green in CI without out-of-scope
    `.github/workflows` + secret changes (CC-deny, MEH-671). This backend test
    gives the same regression coverage — the MEH-1454 bug was a create-500 —
    and runs in the required CI pytest gate today.
    """

    def _future_aware_iso(self, days=7):
        # Mirror the dashboard's `new Date(...).toISOString()` (aware, 'Z').
        return (
            (datetime.now(timezone.utc) + timedelta(days=days))
            .isoformat()
            .replace("+00:00", "Z")
        )

    def test_create_join_fund_cancel_reopen(self, client, db):
        _, producer_user = _producer_user(db)

        # 1. Producer creates a group buy (min=2, canonical city, fulfillment).
        note = "איסוף מהמשק ביום שישי אחרי סגירת הקבוצה"
        created = client.post(
            "/group-buys",
            json=_valid_create_payload(
                deadline=self._future_aware_iso(),
                min_participants=2,
                city="חיפה",
                fulfillment_note=note,
            ),
            headers=auth_header(producer_user),
        )
        assert created.status_code == 201, created.text
        gb_id = created.json()["id"]

        # 2. It appears in the public open list, status "open".
        open_list = client.get("/group-buys", params={"status": "open"}).json()
        listed = next((g for g in open_list if g["id"] == gb_id), None)
        assert listed is not None
        assert listed["status"] == "open"

        # 3. It appears under its city filter (MEH-1455 — canonical city).
        city_list = client.get("/group-buys", params={"city": "חיפה"}).json()
        assert any(g["id"] == gb_id for g in city_list)

        # 3b. The detail carries the fulfillment note (MEH-1457).
        detail = client.get(f"/group-buys/{gb_id}").json()
        assert detail["fulfillment_note"] == note

        # 4. Consumer #1 joins → still open (1 < min 2), count 1.
        c1 = make_user(db, email="lifecycle_c1@test.com")
        r1 = client.post(
            f"/group-buys/{gb_id}/commit",
            json={"quantity": 1},
            headers=auth_header(c1),
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["status"] == "open"
        assert r1.json()["commits_count"] == 1

        # 5. Consumer #2 joins → reaches min → auto-funded, count 2.
        c2 = make_user(db, email="lifecycle_c2@test.com")
        r2 = client.post(
            f"/group-buys/{gb_id}/commit",
            json={"quantity": 1},
            headers=auth_header(c2),
        )
        assert r2.status_code == 201, r2.text
        assert r2.json()["status"] == "funded"
        assert r2.json()["commits_count"] == 2
        funded = client.get(f"/group-buys/{gb_id}").json()
        assert funded["status"] == "funded"
        assert funded["commits_count"] == 2

        # 6. Consumer #2 cancels → drops below min → reverts to open, count 1.
        cancel = client.delete(f"/group-buys/{gb_id}/commit", headers=auth_header(c2))
        assert cancel.status_code == 200, cancel.text
        reopened = client.get(f"/group-buys/{gb_id}").json()
        assert reopened["status"] == "open"
        assert reopened["commits_count"] == 1


# ---------------------------------------------------------------------------
# MEH-1651 — funded notifications (both sides, zero contact details)
# ---------------------------------------------------------------------------

# The privacy guarantee is an ABSENCE claim, and a presence-only check cannot
# detect a removal that never happened (MEH-1578). So the detector below is
# exercised against synthetic inputs FIRST (test_contact_detector_self_test) —
# if it cannot tell a leaking body from a clean one, nothing it reports about
# the real templates is worth reading (MEH-1619).
_PHONE_RE = re.compile(r"(?<!\d)0\d{1,2}-?\d{7}(?!\d)")


def _contact_details_in(text: str) -> list[str]:
    """Return every phone-shaped run and every email-shaped token in `text`."""
    return _PHONE_RE.findall(text) + [tok for tok in text.split() if "@" in tok]


# A fixed id keeps the absence assertion deterministic: a random uuid4 can
# contain an all-digit run that trips a phone regex, which would make this
# test flaky for a reason unrelated to what it guards.
_FIXED_GB_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


class TestFundedNotificationPrivacy:
    """Absence + presence assertions over the two rendered templates."""

    def test_contact_detector_self_test(self):
        # Regression-shaped inputs — MUST be caught.
        assert _contact_details_in("צרו קשר ב-0501234567") == ["0501234567"]
        assert _contact_details_in("טלפון: 050-1234567") == ["050-1234567"]
        assert _contact_details_in("dana@example.com הצטרפה") == ["dana@example.com"]
        # Correct-shaped input — MUST NOT be caught. Digits that are not a
        # phone (a count, a price, a date) stay clean.
        assert _contact_details_in("מספר משתתפות: 12\nמחיר: 90 שח 2026-07-27") == []

    def test_producer_body_has_no_contact_details_and_pins_content(self):
        sent = {}

        def _capture(to, subject, body, html=None):
            sent.update(to=to, subject=subject, body=body)

        with mock.patch("app.services.group_buy_notifications.send_email", _capture):
            notify_producer_funded("owner@test.com", "רכש קמח מלא", 7, _FIXED_GB_ID)

        # Absence: zero phone numbers, zero email addresses in the body.
        assert _contact_details_in(sent["body"]) == []
        # Presence (MEH-1592): a body that dropped its content also has no
        # phone number — pin what BELONGS, not only what doesn't.
        assert "7" in sent["body"]
        assert f"/group-buys/{_FIXED_GB_ID}" in sent["body"]
        assert "רכש קמח מלא" in sent["body"]

    def test_participant_body_has_no_contact_details_and_pins_content(self):
        sent = {}

        def _capture(to, subject, body, html=None):
            sent.update(to=to, subject=subject, body=body)

        with mock.patch("app.services.group_buy_notifications.send_email", _capture):
            notify_participant_funded(
                "buyer@test.com", "רכש קמח מלא", "מאפיית הגליל", _FIXED_GB_ID
            )

        assert _contact_details_in(sent["body"]) == []
        # The business NAME is the call to action (MEH-1650 wording), and the
        # name is not a contact detail.
        assert "מאפיית הגליל" in sent["body"]
        assert f"/group-buys/{_FIXED_GB_ID}" in sent["body"]


class TestFundedNotificationDispatch:
    """Idempotency, recipient fan-out, and the best-effort contract."""

    @staticmethod
    def _capture_sends(monkeypatch):
        sends = []
        monkeypatch.setattr(
            "app.services.group_buy_notifications.send_email",
            lambda to, subject, body, html=None: sends.append(
                {"to": to, "subject": subject, "body": body}
            ),
        )
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
        assert f"מספר משתתפות: {commit_count}" in owner_msg["body"]

        # And no body of either kind carries a contact detail. The group URL is
        # stripped first — a random uuid4 can contain a phone-shaped digit run,
        # which would be a false positive about the URL, not about a leak.
        for s in sends:
            scrubbed = s["body"].replace(str(gb.id), "")
            assert _contact_details_in(scrubbed) == [], s["body"]

    def test_flap_around_threshold_sends_nothing_the_second_time(
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
        cancel = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(b2))
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

        # The latch held: zero additional messages.
        assert len(sends) == first_round

        db.expire_all()
        refreshed = db.query(GroupBuy).filter(GroupBuy.id == gb.id).first()
        assert refreshed.funded_notified_at is not None

    def test_email_failure_never_fails_the_commit(self, client, db, monkeypatch):
        def _boom(*args, **kwargs):
            raise RuntimeError("Resend is down")

        monkeypatch.setattr("app.services.group_buy_notifications.send_email", _boom)
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
        detail = client.get(f"/group-buys/{gb.id}", headers=auth_header(buyer)).json()
        assert detail["user_commit"] is not None
        assert "phone" not in detail["user_commit"]
