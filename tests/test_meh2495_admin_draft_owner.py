"""MEH-2495 (MEH-2494 sub-card A) — `has_owner` on the admin producer rows.

The drafts list tells the admin, per draft, whether its owner has already
claimed it («נקלט, בהשלמה») or is still to be sent the link («מחכה לבעלים»).
"Claimed" = at least one `users` row with `producer_id` = the draft
(producer_claim.py `_has_owner`, the same predicate the claim-link 409 uses).

Each test is named for the input it covers. The guards were shown red against
a construction that removes exactly that guard — see the PR body.
"""

from contextlib import contextmanager

from sqlalchemy import event

from conftest import auth_header, make_producer, make_user
from app.database import engine
from app.schemas.schemas import (
    ProducerAdminOut,
    ProducerDetailOut,
    ProducerListOut,
    ProducerOwnerOut,
)

LIST = "/admin/producers"


def _own(db, producer, **kw):
    """An account whose `producer_id` points at `producer` — a claimed page."""
    u = make_user(db, role="producer", **kw)
    u.producer_id = producer.id
    db.commit()
    return u


def _drafts(client, admin):
    r = client.get(LIST, params={"status": "draft"}, headers=auth_header(admin))
    assert r.status_code == 200, r.text
    return {row["id"]: row for row in r.json()}


@contextmanager
def _count_selects():
    seen = []

    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            seen.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", _capture)


def _owner_lookups(statements):
    return [
        s for s in statements if "DISTINCT users.producer_id" in s and "FROM users" in s
    ]


class TestDraftsListHasOwner:
    def test_zero_drafts_returns_an_empty_list(self, client, db):
        admin = make_user(db, role="admin")
        make_producer(db, status="approved")
        assert _drafts(client, admin) == {}

    def test_one_ownerless_draft_reads_false(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        rows = _drafts(client, admin)
        assert rows[str(d.id)]["has_owner"] is False

    def test_one_claimed_draft_reads_true(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        _own(db, d)
        rows = _drafts(client, admin)
        assert rows[str(d.id)]["has_owner"] is True

    def test_many_drafts_mixed_each_row_reads_its_own_owner(self, client, db):
        admin = make_user(db, role="admin")
        claimed = [
            make_producer(db, status="draft", name=f"נקלט {i}") for i in range(2)
        ]
        waiting = [
            make_producer(db, status="draft", name=f"מחכה {i}") for i in range(3)
        ]
        for d in claimed:
            _own(db, d)
        rows = _drafts(client, admin)
        assert {pid for pid, r in rows.items() if r["has_owner"]} == {
            str(d.id) for d in claimed
        }
        assert {pid for pid, r in rows.items() if not r["has_owner"]} == {
            str(d.id) for d in waiting
        }

    def test_two_accounts_on_one_draft_do_not_duplicate_the_row(self, client, db):
        # users.producer_id has no unique index — a JOIN would return the
        # draft twice; the batched DISTINCT lookup must not.
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        _own(db, d)
        _own(db, d)
        r = client.get(LIST, params={"status": "draft"}, headers=auth_header(admin))
        ids = [row["id"] for row in r.json()]
        assert ids.count(str(d.id)) == 1
        assert r.json()[0]["has_owner"] is True

    def test_owner_of_another_producer_does_not_mark_this_draft(self, client, db):
        admin = make_user(db, role="admin")
        d = make_producer(db, status="draft")
        other = make_producer(db, status="draft", name="אחר")
        _own(db, other)
        rows = _drafts(client, admin)
        assert rows[str(d.id)]["has_owner"] is False
        assert rows[str(other.id)]["has_owner"] is True

    def test_owner_lookup_is_one_query_at_one_draft_and_at_six(self, client, db):
        # No N+1: the owner lookup is ONE query for the whole page. Counted on
        # the lookup's own statement (DISTINCT users.producer_id), not on the
        # total — attach_badge_fields already issues one producer_offers
        # SELECT per row (pre-existing, not this change), which would make a
        # total-count assertion fail for a reason unrelated to has_owner.
        admin = make_user(db, role="admin")
        first = make_producer(db, status="draft")
        _own(db, first)
        with _count_selects() as one:
            _drafts(client, admin)
        for i in range(5):
            d = make_producer(db, status="draft", name=f"עוד {i}")
            _own(db, d)
        with _count_selects() as six:
            assert len(_drafts(client, admin)) == 6
        assert len(_owner_lookups(one)) == 1
        assert len(_owner_lookups(six)) == 1


class TestEveryAdminOutRouteHydratesIt:
    """`has_owner` defaults to False, so a route that skipped the hydrate
    would report a claimed page as ownerless. Each route that returns
    ProducerAdminOut is asked about a claimed producer."""

    def test_default_list_view(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="pending")
        _own(db, p)
        r = client.get(LIST, headers=auth_header(admin))
        assert {row["id"]: row for row in r.json()}[str(p.id)]["has_owner"] is True

    def test_pending_route(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="pending")
        _own(db, p)
        r = client.get(f"{LIST}/pending", headers=auth_header(admin))
        assert {row["id"]: row for row in r.json()}[str(p.id)]["has_owner"] is True

    def test_single_get(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="draft")
        _own(db, p)
        r = client.get(f"{LIST}/{p.id}", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["has_owner"] is True

    def test_put(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="draft")
        _own(db, p)
        r = client.put(
            f"{LIST}/{p.id}", json={"name": "שם חדש"}, headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        assert r.json()["has_owner"] is True


class TestAdminOnly:
    def test_field_is_declared_on_the_admin_shape(self):
        assert "has_owner" in ProducerAdminOut.model_fields

    def test_field_is_absent_from_every_public_and_owner_shape(self):
        for shape in (ProducerListOut, ProducerDetailOut, ProducerOwnerOut):
            assert "has_owner" not in shape.model_fields, shape.__name__

    def test_public_detail_response_does_not_carry_it(self, client, db):
        p = make_producer(db, status="approved")
        _own(db, p)
        r = client.get(f"/producers/{p.id}")
        assert r.status_code == 200, r.text
        assert "has_owner" not in r.json()

    def test_non_admin_cannot_list(self, client, db):
        consumer = make_user(db)
        r = client.get(LIST, params={"status": "draft"}, headers=auth_header(consumer))
        assert r.status_code == 403
