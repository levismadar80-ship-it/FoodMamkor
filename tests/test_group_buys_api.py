"""Integration tests for the group-buys router (app/routers/group_buys.py).

Exercises the public list/detail endpoints, the producer create flow with
its guards, and the consumer commit/cancel lifecycle (auto-fund at
min_participants, revert-to-open on cancel, duplicate/closed/full/deadline
error paths). Uses the shared conftest fixtures + a producer-user helper
mirroring test_producer_recipes.py.
"""
import pytest
import re
from datetime import datetime, timedelta, timezone
from unittest import mock
from uuid import uuid4

from conftest import auth_header, make_producer, make_user

from app.config import settings
from app.models.models import GroupBuy, GroupBuyCommit
from app.services.group_buy_notifications import (
    notify_participant_cancelled,
    notify_participant_funded,
    notify_producer_funded,
)
from app.utils.clock import utc_now


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
        description="שק 25 ק\"ג",
        product_name="קמח מלא",
        unit="שק",
        price_per_unit_regular=120,
        price_per_unit_group=90,
        min_participants=min_participants,
        max_participants=max_participants,
        deadline=deadline or (utc_now() + timedelta(days=7)),
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
        "deadline": (utc_now() + timedelta(days=10)).isoformat(),
        "city": "חיפה",
        # MEH-2453: required. Participants read it before they join.
        "fulfillment_note": "איסוף מהמשק ביום שישי",
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

    def test_open_list_hides_a_group_past_its_deadline(self, client, db):
        """MEH-2540: nothing closes an open group buy after its deadline
        (OWNER_TRANSITIONS note), so the «פתוחות» tab showed it with «פג התוקף»
        next to a join button. The live control on the same path shows the
        filter is the deadline, not the fixture."""
        producer, _ = _producer_user(db)
        live = _make_group_buy(db, producer, deadline=utc_now() + timedelta(days=1))
        past = _make_group_buy(db, producer, deadline=utc_now() - timedelta(hours=1))
        ids = {g["id"] for g in client.get("/group-buys").json()}
        assert str(live.id) in ids
        assert str(past.id) not in ids

    def test_funded_list_keeps_a_group_past_its_deadline(self, client, db):
        """MEH-2540: a funded group is waiting to be delivered after its
        deadline — the deadline filter is for «open» only."""
        producer, _ = _producer_user(db)
        gb = _make_group_buy(
            db, producer, status="funded", deadline=utc_now() - timedelta(days=1)
        )
        ids = {g["id"] for g in client.get("/group-buys", params={"status": "funded"}).json()}
        assert str(gb.id) in ids

    def test_expired_open_group_page_still_resolves(self, client, db):
        """MEH-2540: the filter is the list's; a shared link to an expired group
        still opens (its page already says the deadline passed)."""
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, deadline=utc_now() - timedelta(hours=1))
        resp = client.get(f"/group-buys/{gb.id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == str(gb.id)

    def test_card_carries_the_business_first_photo(self, client, db):
        """MEH-2544: the list card and the page lead with the business's first
        photo (same pick as ProducerCard, images[0]); none → null, so the
        client draws its own placeholder."""
        producer, _ = _producer_user(db)
        producer.images = ["https://res.cloudinary.com/x/a.jpg", "https://res.cloudinary.com/x/b.jpg"]
        db.commit()
        gb = _make_group_buy(db, producer)
        bare, _ = _producer_user(db, email="gb-bare@test.com")
        gb_bare = _make_group_buy(db, bare)

        listed = {g["id"]: g for g in client.get("/group-buys").json()}
        assert listed[str(gb.id)]["producer_image_url"] == "https://res.cloudinary.com/x/a.jpg"
        assert listed[str(gb_bare.id)]["producer_image_url"] is None
        detail = client.get(f"/group-buys/{gb.id}").json()
        assert detail["producer_image_url"] == "https://res.cloudinary.com/x/a.jpg"

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


# ---------- MEH-2484: only an approved business's group buys are public ----------
#
# LOCK «בתי עסק מאושרים בלבד». A group buy whose business was rejected or is
# still pending must not reach the public list (and through it the sitemap),
# its public page, or a stranger's join. Each case carries an approved-business
# control on the same path, so a red names the gate and not the fixture.
class TestApprovedBusinessOnly:
    def test_list_hides_a_non_approved_business(self, client, db):
        approved, _ = _producer_user(db, email="gb-ok@test.com")
        _make_group_buy(db, approved, city="approved-city")
        # "inactive" is what the admin suspend action writes (admin.py).
        for i, status in enumerate(("pending", "rejected", "inactive")):
            hidden, _ = _producer_user(
                db, email=f"gb-hidden{i}@test.com", status=status
            )
            _make_group_buy(db, hidden, city=f"{status}-city")
        cities = {g["city"] for g in client.get("/group-buys").json()}
        assert "approved-city" in cities
        assert "pending-city" not in cities
        assert "rejected-city" not in cities
        assert "inactive-city" not in cities

    def test_detail_is_404_for_a_stranger_when_the_business_is_not_approved(
        self, client, db
    ):
        producer, _ = _producer_user(db, email="gb-pend@test.com", status="pending")
        gb = _make_group_buy(db, producer)
        stranger = make_user(db, email="gb-stranger@test.com")
        assert client.get(f"/group-buys/{gb.id}").status_code == 404
        resp = client.get(f"/group-buys/{gb.id}", headers=auth_header(stranger))
        assert resp.status_code == 404
        assert resp.json()["detail"] == "קבוצת הרכש לא נמצאה"

    def test_detail_stays_visible_to_its_owner_and_to_admin(self, client, db):
        producer, owner = _producer_user(db, email="gb-own@test.com", status="pending")
        gb = _make_group_buy(db, producer)
        admin = make_user(db, email="gb-admin@test.com", role="admin")
        assert (
            client.get(f"/group-buys/{gb.id}", headers=auth_header(owner)).status_code
            == 200
        )
        assert (
            client.get(f"/group-buys/{gb.id}", headers=auth_header(admin)).status_code
            == 200
        )

    def test_stranger_cannot_join_when_the_business_is_not_approved(self, client, db):
        producer, _ = _producer_user(db, email="gb-rej@test.com", status="rejected")
        gb = _make_group_buy(db, producer)
        buyer = make_user(db, email="gb-buyer@test.com")
        resp = client.post(
            f"/group-buys/{gb.id}/commit",
            json={"quantity": 1},
            headers=auth_header(buyer),
        )
        assert resp.status_code == 404
        assert db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).count() == 0

    def test_another_business_owner_does_not_get_the_owner_carve_out(self, client, db):
        hidden, _ = _producer_user(db, email="gb-a@test.com", status="inactive")
        gb = _make_group_buy(db, hidden)
        _, other_owner = _producer_user(db, email="gb-b@test.com")
        resp = client.get(f"/group-buys/{gb.id}", headers=auth_header(other_owner))
        assert resp.status_code == 404

    def test_a_participant_can_still_leave_after_the_business_is_hidden(self, client, db):
        # Guard against over-gating: leaving is never blocked by the visibility
        # rule, only joining is.
        producer, _ = _producer_user(db, email="gb-leave@test.com")
        gb = _make_group_buy(db, producer, min_participants=5)
        buyer = make_user(db, email="gb-leaver@test.com")
        joined = client.post(
            f"/group-buys/{gb.id}/commit", json={"quantity": 1}, headers=auth_header(buyer)
        )
        assert joined.status_code == 201
        producer.status = "inactive"
        db.commit()
        left = client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(buyer))
        assert left.status_code == 200
        assert db.query(GroupBuyCommit).filter_by(group_buy_id=gb.id).count() == 0


# ---------- the owner's own list (MEH-2437) ----------
class TestMyGroupBuys:
    """GET /producers/me/group-buys — the business's own group buys, every
    status, newest first, in one call (the dashboard used to fetch the whole
    site four times and filter in the browser)."""

    URL = "/producers/me/group-buys"

    def test_returns_only_mine_in_every_status(self, client, db):
        producer, owner = _producer_user(db, email="mine1@test.com")
        other, _ = _producer_user(db, email="theirs1@test.com")
        mine = {
            s: _make_group_buy(db, producer, status=s)
            for s in ("open", "funded", "cancelled", "fulfilled")
        }
        theirs = _make_group_buy(db, other)
        resp = client.get(self.URL, headers=auth_header(owner))
        assert resp.status_code == 200
        ids = [row["id"] for row in resp.json()]
        assert sorted(ids) == sorted(str(gb.id) for gb in mine.values())
        assert str(theirs.id) not in ids
        statuses = {row["status"] for row in resp.json()}
        assert statuses == {"open", "funded", "cancelled", "fulfilled"}

    def test_newest_first(self, client, db):
        producer, owner = _producer_user(db, email="mine2@test.com")
        older = _make_group_buy(db, producer)
        older.created_at = utc_now() - timedelta(days=3)
        newer = _make_group_buy(db, producer)
        db.commit()
        resp = client.get(self.URL, headers=auth_header(owner))
        assert [row["id"] for row in resp.json()] == [str(newer.id), str(older.id)]

    def test_empty_for_a_business_with_none(self, client, db):
        _, owner = _producer_user(db, email="mine3@test.com")
        other, _ = _producer_user(db, email="theirs3@test.com")
        _make_group_buy(db, other)
        resp = client.get(self.URL, headers=auth_header(owner))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_consumer_is_403(self, client, db):
        producer, _ = _producer_user(db, email="mine4@test.com")
        _make_group_buy(db, producer)
        consumer = make_user(db, role="consumer", email="c4mine@test.com")
        # Even pointed at a business, a consumer is not its owner.
        consumer.producer_id = producer.id
        db.commit()
        resp = client.get(self.URL, headers=auth_header(consumer))
        assert resp.status_code == 403

    def test_producer_without_business_is_403(self, client, db):
        user = make_user(db, role="producer", email="nobiz5@test.com")
        resp = client.get(self.URL, headers=auth_header(user))
        assert resp.status_code == 403

    def test_anonymous_is_401(self, client, db):
        resp = client.get(self.URL)
        assert resp.status_code == 401


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
                deadline=(utc_now() - timedelta(days=1)).isoformat()
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
                deadline=(utc_now() + timedelta(days=10)).isoformat()
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

    # ---- MEH-2453: fulfillment_note is required ----
    # Each case is a body a participant would have read as "no idea how I get
    # this". Missing, empty, whitespace and null are four different payloads
    # the form or another client can send; all four must be refused and none
    # may create a row.
    @staticmethod
    def _blank_note_payloads():
        missing = _valid_create_payload()
        del missing["fulfillment_note"]
        return [
            ("missing", missing),
            ("empty", _valid_create_payload(fulfillment_note="")),
            ("whitespace", _valid_create_payload(fulfillment_note="   \n ")),
            ("null", _valid_create_payload(fulfillment_note=None)),
            # Not blank, still no answer: the free-text letter floor (MEH-555).
            ("punctuation", _valid_create_payload(fulfillment_note=". - ?")),
            ("two letters", _valid_create_payload(fulfillment_note="כן")),
        ]

    def test_create_without_fulfillment_note_is_422_and_creates_nothing(
        self, client, db
    ):
        producer, user = _producer_user(db)
        ran = []
        for label, payload in self._blank_note_payloads():
            resp = client.post("/group-buys", json=payload, headers=auth_header(user))
            assert resp.status_code == 422, (label, resp.text)
            ran.append(label)
        assert len(ran) == len(self._blank_note_payloads())
        assert (
            db.query(GroupBuy).filter(GroupBuy.producer_id == producer.id).count()
            == 0
        )

    def test_blank_fulfillment_note_error_is_hebrew(self, client, db):
        # MEH-2621: blank is now "not given", and with neither pickup nor
        # delivery the refusal names the two fields the form now shows.
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(fulfillment_note="   "),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert "יש למלא איסוף או משלוח" in resp.text

    def test_wordless_fulfillment_note_keeps_its_own_message(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(fulfillment_note=". - ?"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422
        assert "יש לכתוב מתי ואיך מקבלים את המוצרים" in resp.text

    # ---- MEH-2621: pickup_note / delivery_note ----
    @staticmethod
    def _split_payload(**over):
        body = _valid_create_payload(**over)
        if "fulfillment_note" not in over:
            del body["fulfillment_note"]
        return body

    @pytest.mark.parametrize(
        "fields",
        [
            {"pickup_note": "  מהמשק ביום שישי בין 8 ל-12 "},
            {"delivery_note": "לזכרון יעקב ובנימינה ביום ראשון, 20 ש״ח"},
            {
                "pickup_note": "מהמשק ביום שישי",
                "delivery_note": "לזכרון יעקב ביום ראשון",
            },
        ],
        ids=["pickup-only", "delivery-only", "both"],
    )
    def test_split_fields_alone_are_enough_and_round_trip(self, client, db, fields):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys", json=self._split_payload(**fields), headers=auth_header(user)
        )
        assert resp.status_code == 201, resp.text
        detail = client.get(f"/group-buys/{resp.json()['id']}").json()
        for key in ("pickup_note", "delivery_note"):
            expected = fields.get(key)
            assert detail[key] == (expected.strip() if expected else None), key
        assert detail["fulfillment_note"] is None

    @pytest.mark.parametrize(
        "fields",
        [
            {},
            {"pickup_note": "", "delivery_note": "   "},
            {"pickup_note": None, "delivery_note": None},
        ],
        ids=["none", "blank", "null"],
    )
    def test_neither_pickup_nor_delivery_is_422_and_creates_nothing(
        self, client, db, fields
    ):
        producer, user = _producer_user(db)
        resp = client.post(
            "/group-buys", json=self._split_payload(**fields), headers=auth_header(user)
        )
        assert resp.status_code == 422, resp.text
        assert "יש למלא איסוף או משלוח" in resp.text
        assert (
            db.query(GroupBuy).filter(GroupBuy.producer_id == producer.id).count()
            == 0
        )

    def test_wordless_pickup_is_refused_even_with_a_delivery(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=self._split_payload(pickup_note="כן", delivery_note="לחדרה ביום שני"),
            headers=auth_header(user),
        )
        assert resp.status_code == 422, resp.text
        # The refusal is the pickup field's, not some other 422 (review #3905).
        locs = [err["loc"] for err in resp.json()["detail"]]
        assert ["body", "pickup_note"] in locs, locs

    def test_three_letter_note_is_accepted(self, client, db):
        # The floor's edge, so a stricter floor shows up here.
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(fulfillment_note="משק"),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text

    def test_fulfillment_note_is_stored_stripped(self, client, db):
        _, user = _producer_user(db)
        resp = client.post(
            "/group-buys",
            json=_valid_create_payload(fulfillment_note="  משלוח לחדרה ולפרדס חנה \n"),
            headers=auth_header(user),
        )
        assert resp.status_code == 201, resp.text
        detail = client.get(f"/group-buys/{resp.json()['id']}").json()
        assert detail["fulfillment_note"] == "משלוח לחדרה ולפרדס חנה"

    def test_create_past_aware_deadline_is_400_not_500(self, client, db):
        """A past aware deadline → Hebrew 400, never a 500."""
        _, user = _producer_user(db)
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace(
            "+00:00", "Z"
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
            db, producer, deadline=utc_now() - timedelta(hours=1)
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
        gb = _make_group_buy(
            db, producer, min_participants=5, max_participants=1
        )
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
        resp = client.delete(
            f"/group-buys/{gb.id}/commit", headers=auth_header(user)
        )
        assert resp.status_code == 200

    def test_cancel_without_commit_404(self, client, db):
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer)
        user = make_user(db, email="nocommit@test.com")
        resp = client.delete(
            f"/group-buys/{gb.id}/commit", headers=auth_header(user)
        )
        assert resp.status_code == 404

    def test_commit_and_cancel_after_aware_create(self, client, db):
        """MEH-1454 consistency: a group created via the API with an aware
        ISO-Z deadline stores a naive-UTC deadline, so the commit and cancel
        deadline comparisons (`gb.deadline < utc_now()`) still work."""
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
        cancel = client.delete(
            f"/group-buys/{gb_id}/commit", headers=auth_header(c2)
        )
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
_FIXED_PRODUCER_ID = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee"


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

        with mock.patch(
            "app.services.group_buy_notifications.send_email", _capture
        ):
            notify_producer_funded(
                "owner@test.com", "רכש קמח מלא", 7, _FIXED_GB_ID
            )

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

        with mock.patch(
            "app.services.group_buy_notifications.send_email", _capture
        ):
            notify_participant_funded(
                "buyer@test.com",
                "רכש קמח מלא",
                "מאפיית הגליל",
                _FIXED_GB_ID,
                _FIXED_PRODUCER_ID,
            )

        assert _contact_details_in(sent["body"]) == []
        # The business NAME is the call to action (MEH-1650 wording), and the
        # name is not a contact detail.
        assert "מאפיית הגליל" in sent["body"]
        assert f"/group-buys/{_FIXED_GB_ID}" in sent["body"]
        # MEH-2453: the business page is where its delivery areas and pickup
        # points live. A link, never the business's contact details.
        business_line = f"לדף העסק: {settings.frontend_url}/producer/{_FIXED_PRODUCER_ID}"
        assert business_line in sent["body"]


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
            scrubbed = s["body"].replace(str(gb.id), "").replace(str(producer.id), "")
            assert _contact_details_in(scrubbed) == [], s["body"]

        # MEH-2453: each participant gets a link to THIS business's page.
        for m in participant_msgs:
            assert f"/producer/{producer.id}" in m["body"], m["body"]
        assert f"/producer/{producer.id}" not in owner_msg["body"]

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

        # The latch held: zero additional messages.
        assert len(sends) == first_round

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
    is owner-only: an admin gets 403 here and keeps the override the IDOR rule
    grants (security.md) on PATCH /admin/group-buys/{id}/status.
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
        return [
            ("open", "fulfilled"),  # never delivered a group that never filled
            ("open", "funded"),  # funding is the participants' doing
            ("open", "open"),
            ("funded", "open"),
            ("funded", "funded"),
            ("cancelled", "open"),  # final
            ("cancelled", "fulfilled"),
            ("fulfilled", "cancelled"),  # final
            ("fulfilled", "open"),
        ]

    def test_transitions_outside_the_table_are_409(self, client, db):
        producer, owner = _producer_user(db, email="own11@test.com")
        for current, requested in self._forbidden_pairs():
            gb = _make_group_buy(db, producer, status=current)
            resp = self._patch(client, gb, requested, owner)
            assert resp.status_code == 409, (current, requested, resp.json())
            assert self._status_in_db(db, gb) == current, (current, requested)

    def test_admin_uses_the_admin_route_not_this_one(self, client, db):
        # This route is the business's, held to the transition table. An admin
        # keeps the full override on PATCH /admin/group-buys/{id}/status, so
        # there is no second, unchecked path to the same state here.
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
        assert resp.status_code == 200
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
        assert resp.json()["detail"] == "אי אפשר לשנות את קבוצת הרכש למצב הזה"
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
            lambda to, subject, body, html=None: sends.append(
                {"to": to, "subject": subject, "body": body}
            ),
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

        def _capture(to, subject, body, html=None):
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

    def test_admin_cancel_through_the_admin_route_sends_nothing(self, client, db, monkeypatch):
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
        assert sends == []
