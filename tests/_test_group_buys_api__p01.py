"""Part 1 of 2 of `tests/test_group_buys_api.py`: TestListAndGet, TestApprovedBusinessOnly, TestMyGroupBuys, TestCreate, TestCommitLifecycle, TestFullLifecycle, TestFundedNotificationPrivacy.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_group_buys_api.py` imports these tests, so
their node ids stay `tests/test_group_buys_api.py::...`. Run them with
`pytest tests/test_group_buys_api.py` (add `-k <ClassName>` to narrow).
"""

from app.config import settings
from app.models.models import GroupBuy
from app.models.models import GroupBuyCommit
from app.services.group_buy_notifications import notify_participant_funded
from app.services.group_buy_notifications import notify_producer_funded
from app.utils.clock import utc_now
from conftest import auth_header
from conftest import make_user
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from unittest import mock
from uuid import uuid4
import pytest
from _test_group_buys_api__common import _FIXED_GB_ID  # noqa: F401
from _test_group_buys_api__common import _FIXED_PRODUCER_ID  # noqa: F401
from _test_group_buys_api__common import _contact_details_in  # noqa: F401
from _test_group_buys_api__common import _make_group_buy  # noqa: F401
from _test_group_buys_api__common import _producer_user  # noqa: F401
from _test_group_buys_api__common import _valid_create_payload  # noqa: F401

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
        assert resp.json()["detail"] == "קבוצת הרכישה לא נמצאה"

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

    def test_units_total_is_the_sum_of_quantities_and_owner_only(self, client, db):
        """MEH-3254 (grill retro D7): the business sees how many units to
        prepare — a number, never a roster (MEH-1651). Public readers keep
        `units_total` null."""
        producer, owner = _producer_user(db, email="mine6@test.com")
        gb = _make_group_buy(db, producer, status="funded")
        empty = _make_group_buy(db, producer)
        for i, qty in enumerate((3, 5)):
            buyer = make_user(db, role="consumer", email=f"units{i}@example.com")
            db.add(GroupBuyCommit(group_buy_id=gb.id, user_id=buyer.id, quantity=qty))
        db.commit()
        resp = client.get(self.URL, headers=auth_header(owner))
        rows = {r["id"]: r for r in resp.json()}
        assert rows[str(gb.id)]["units_total"] == 8
        assert rows[str(empty.id)]["units_total"] == 0
        public = client.get(f"/group-buys/{gb.id}").json()
        assert public.get("units_total") is None
        # Another business's commits never reach this owner's rows.
        other, _ = _producer_user(db, email="other6@test.com")
        theirs = _make_group_buy(db, other, status="funded")
        stranger = make_user(db, role="consumer", email="units9@example.com")
        db.add(GroupBuyCommit(group_buy_id=theirs.id, user_id=stranger.id, quantity=40))
        db.commit()
        rows = {r["id"]: r for r in client.get(self.URL, headers=auth_header(owner)).json()}
        assert set(rows) == {str(gb.id), str(empty.id)}
        assert rows[str(gb.id)]["units_total"] == 8


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
        # MEH-3289: funded is joinable now; fulfilled / cancelled are closed.
        producer, _ = _producer_user(db)
        gb = _make_group_buy(db, producer, status="fulfilled")
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

        def _capture(to, subject, body, html=None, test_cause=False):
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

        def _capture(to, subject, body, html=None, test_cause=False):
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
