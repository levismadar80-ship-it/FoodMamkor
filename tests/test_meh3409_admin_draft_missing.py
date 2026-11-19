"""MEH-3409 — `draft_missing` on the admin drafts list.

For a draft its owner has claimed («נקלט, בהשלמה»), the admin sees what is
still missing before she can send it for review — the same codes the submit
gate returns (services/submission_gate.py). An unclaimed draft, or a row that
is not a draft, carries None: there is nothing to chase her about.

Each test is named for the input it covers.
"""

from datetime import timedelta

from conftest import auth_header, make_producer, make_user
from app.models.models import Event
from app.utils.clock import israel_today
from test_meh2495_admin_draft_owner import _count_selects, _drafts, _own

LIST = "/admin/producers"


def _event_counts(statements):
    """The batched upcoming-events COUNT, recognised by its GROUP BY."""
    return [s for s in statements if "FROM events" in s and "GROUP BY" in s]


def _organizer_event_selects(statements):
    return [s for s in statements if "FROM events" in s]


class TestDraftMissingOnTheDraftsList:
    def test_claimed_bare_draft_lists_every_unmet_requirement(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        _own(db, d)
        missing = _drafts(client, admin)[str(d.id)]["draft_missing"]
        assert "image" in missing
        assert "product" in missing
        assert "phone_verified" in missing

    def test_claimed_draft_with_image_and_verified_phone_drops_those_two(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(
            db, status="draft", images=["https://x/a.jpg"], phone_verified=True
        )
        _own(db, d)
        missing = _drafts(client, admin)[str(d.id)]["draft_missing"]
        assert "image" not in missing
        assert "phone_verified" not in missing
        assert "product" in missing

    def test_unclaimed_draft_reads_none(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        assert _drafts(client, admin)[str(d.id)]["draft_missing"] is None

    def test_claimed_pending_business_reads_none(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="pending")
        _own(db, p)
        r = client.get(LIST, headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert {row["id"]: row for row in r.json()}[str(p.id)]["draft_missing"] is None

    def test_organizer_draft_with_an_upcoming_event_does_not_ask_for_one(self, client, db):
        admin = make_user(db, role="admin")
        with_event = make_producer(db, status="draft", name="מארגנת עם אירוע")
        without = make_producer(db, status="draft", name="מארגנת בלי אירוע")
        for o in (with_event, without):
            o.kind = "organizer"
            _own(db, o)
        db.add(
            Event(
                producer_id=with_event.id,
                title="שוק איכרים",
                event_date=israel_today() + timedelta(days=7),
                category="שוק",
                is_active=True,
            )
        )
        db.commit()
        rows = _drafts(client, admin)
        assert "upcoming_event" not in rows[str(with_event.id)]["draft_missing"]
        assert "upcoming_event" in rows[str(without.id)]["draft_missing"]

    def test_organizer_draft_with_only_a_past_or_an_inactive_event_still_asks_for_one(
        self, client, db
    ):
        admin = make_user(db, role="admin")
        past = make_producer(db, status="draft", name="מארגנת עם אירוע שעבר")
        inactive = make_producer(db, status="draft", name="מארגנת עם אירוע כבוי")
        for o in (past, inactive):
            o.kind = "organizer"
            _own(db, o)
        db.add_all(
            [
                Event(
                    producer_id=past.id,
                    title="שוק שהיה",
                    event_date=israel_today() - timedelta(days=1),
                    category="שוק",
                    is_active=True,
                ),
                Event(
                    producer_id=inactive.id,
                    title="שוק שבוטל",
                    event_date=israel_today() + timedelta(days=7),
                    category="שוק",
                    is_active=False,
                ),
            ]
        )
        db.commit()
        rows = _drafts(client, admin)
        assert "upcoming_event" in rows[str(past.id)]["draft_missing"]
        assert "upcoming_event" in rows[str(inactive.id)]["draft_missing"]

    def test_organizer_event_lookup_is_one_query_at_one_draft_and_at_four(self, client, db):
        admin = make_user(db, role="admin")
        first = make_producer(db, status="draft", name="מארגנת 0")
        first.kind = "organizer"
        _own(db, first)
        with _count_selects() as one:
            _drafts(client, admin)
        for i in range(3):
            o = make_producer(db, status="draft", name=f"מארגנת {i + 1}")
            o.kind = "organizer"
            _own(db, o)
        with _count_selects() as four:
            assert len(_drafts(client, admin)) == 4
        assert len(_event_counts(one)) == 1
        assert len(_event_counts(four)) == 1
        # And no per-row fallback query beside the batched one.
        assert len(_organizer_event_selects(four)) == len(_organizer_event_selects(one))


class TestTheFieldIsAdminOnly:
    def test_public_detail_does_not_carry_it(self, client, db):
        p = make_producer(db, status="approved")
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200, r.text
        assert "draft_missing" not in r.json()
