"""
Module:   test_meh2943_group_buy_commit_scoping
Purpose:  Leaving a group buy touches exactly one person's commitment — the
          caller's. One participant leaving does not remove another's, and a
          caller who never joined gets 404 without changing any row.
Touches:  group_buys / group_buy_commits rows through the real routes.
Does NOT: re-test the commit lifecycle. Auto-fund at `min_participants`,
          revert-to-open below it, the duplicate / closed / full / deadline
          refusals and the funded-notification latch are all covered in
          `tests/test_group_buys_api.py`.
Related:  backend/app/routers/group_buys.py::cancel_commit (:303-346; the
          `(group_buy_id, user_id)` filter at :324-331 is the subject)
History:  MEH-2943 (creation; area 8 of MEH-2899, group-buy half)

WHY THIS IS A SCOPING TEST AND NOT AN IDOR TEST. Row 8 of the top-20 action
map scored `DELETE /group-buys/{id}/commit` on «deletion, money, object id in
the path». Measured against the source, the route has **no IDOR surface**: the
id in the path is the GROUP BUY, which is public, and the commitment it
deletes is looked up by `(group_buy_id, user_id == current_user.id)`. There is
no id a caller can pass that names someone else's commitment.

So "a stranger gets 403" is not a test that can exist here, and writing one
would have been writing a test for a guard the route does not have. What CAN
regress is the scoping itself: drop `GroupBuyCommit.user_id == current_user.id`
from that filter — a plausible refactor, since the other filter term is
already the path id — and `.first()` starts returning an arbitrary
participant's row, so whoever leaves deletes somebody else's place in the
group buy. These tests are what names that when it happens.

Not the only thing that would notice, and the distinction is worth keeping
honest: measured with the scoping removed and these files excluded,
`test_group_buys_api.py` goes 1 failed / 95 passed — the funded-notification
latch test trips over it incidentally while asserting something else. No
test there is ABOUT the scoping, which is the gap; but "nothing would catch
it" would have been an overstatement. Contrast the four rescue routes, where
the 160 pre-existing tests stay green under every ownership break.

Row 18 of the map, `PATCH /group-buys/{id}/status`, is NOT in this file —
recorded as covered rather than rewritten, with the shape of that coverage
stated precisely rather than waved at:

* `test_group_buys_api.py::TestOwnerStatusChange::test_other_business_is_403_and_nothing_changes`
  (:1121-1127) asserts 403 and that the `status` COLUMN is unchanged. That is
  one column, not the derived whole-row snapshot this card asks for elsewhere
  — and it is sufficient here for a reason worth writing down: `gb.status =
  data.status` (`group_buys.py:538`) is the route's only row write, so one
  column IS the surface. If that route ever writes a second field, the
  assertion stops covering it.
* The same class adds consumer, producer-without-a-business, unverified-owner
  and anonymous cases.
* `test_refused_cancel_sends_nothing` (:1497) covers the no-side-effect half
  for that route — 403 and no mail — with a live control at :1428.

So it is better covered than a first reading suggests, and an earlier draft
of this paragraph claimed it asserts "the exact pair the card asks for",
which a reviewer measured as not quite true in either direction.
"""

from datetime import timedelta

from app.models.models import GroupBuy, GroupBuyCommit
from app.utils.clock import utc_now

from tests.conftest import auth_header, make_user
from tests.test_group_buys_api import _make_group_buy, _producer_user


def _join(client, gb, user, qty=1):
    resp = client.post(
        f"/group-buys/{gb.id}/commit",
        json={"quantity": qty},
        headers=auth_header(user),
    )
    assert resp.status_code == 201, resp.text
    return resp


def _leave(client, gb, user):
    return client.delete(f"/group-buys/{gb.id}/commit", headers=auth_header(user))


def _commits(db, gb):
    return (
        db.query(GroupBuyCommit)
        .filter(GroupBuyCommit.group_buy_id == gb.id)
        .order_by(GroupBuyCommit.created_at)
        .all()
    )


def _open_group_buy(db):
    """An open group buy with room for several participants.

    `min_participants=3` deliberately: with the default 2, the second join
    funds the group buy and the first leave flips it back to open, which drags
    the status machine into a test that is about row ownership. Three keeps it
    `open` throughout, so a changed status would be a real finding rather than
    the fixture's own doing.
    """
    producer, _owner = _producer_user(db, email="gbscope@example.com")
    return _make_group_buy(
        db,
        producer,
        status="open",
        min_participants=3,
        deadline=utc_now() + timedelta(days=5),
    )


class TestLeavingDeletesOnlyYourOwnPlace:
    def test_one_participant_leaving_keeps_the_others(self, client, db):
        """Two participants, one leaves: exactly the right row disappears.

        This is the assertion that reds if the `user_id` term is dropped from
        the lookup — `.first()` would then return whichever row the database
        hands back, and B leaving could delete A's place.

        Counts are derived (`len`), and identity is asserted by `user_id`, not
        by count alone: a scoping bug that deleted A instead of B leaves the
        count at 1 and would satisfy a count-only test.
        """
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        bob = make_user(db, email="bob@example.com")
        db.commit()
        _join(client, gb, alice)
        _join(client, gb, bob)
        assert len(_commits(db, gb)) == 2, "setup: both joined"

        resp = _leave(client, gb, bob)

        assert resp.status_code == 200, resp.text
        db.expire_all()
        left = _commits(db, gb)
        assert len(left) == 1
        assert left[0].user_id == alice.id, (
            "the wrong participant's commitment was deleted — the lookup is "
            "not scoped to the caller"
        )

    def test_a_caller_who_never_joined_gets_404_and_deletes_nothing(self, client, db):
        """404, and both existing commitments survive untouched.

        The group buy is real and open and the caller is signed in, so the
        only reason to refuse is that this person has no commitment in it.
        Without the `user_id` term the lookup would find somebody else's row
        and delete it, which is the same bug seen from the other side.
        """
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        bob = make_user(db, email="bob@example.com")
        outsider = make_user(db, email="outsider@example.com")
        db.commit()
        _join(client, gb, alice)
        _join(client, gb, bob)
        before = {(c.user_id, c.quantity) for c in _commits(db, gb)}

        resp = _leave(client, gb, outsider)

        assert resp.status_code == 404, resp.text
        db.expire_all()
        after = {(c.user_id, c.quantity) for c in _commits(db, gb)}
        assert after == before, "a non-participant's DELETE removed a real commitment"

    def test_leaving_really_does_delete_the_callers_own_row(self, client, db):
        """The liveness control for the two assertions above.

        Both of them are satisfied by a route that deletes nothing at all —
        a `DELETE` reduced to a no-op keeps every other participant and
        refuses the outsider. This is what proves the route still works, so
        the absences above mean "only the right row went" and not "nothing
        happens here any more".
        """
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        db.commit()
        _join(client, gb, alice)
        assert len(_commits(db, gb)) == 1

        resp = _leave(client, gb, alice)

        assert resp.status_code == 200, resp.text
        db.expire_all()
        assert len(_commits(db, gb)) == 0

    def test_leaving_twice_is_404_the_second_time(self, client, db):
        """The caller's own row, once gone, is gone — no second deletion.

        Not a duplicate of the lifecycle tests: those assert the status
        machine around a cancel. This asserts that the second call cannot
        reach ANOTHER row now that the caller's own is missing, which is the
        scoping question again in its most likely shape — the second call is
        the one that has nothing of its own left to find.
        """
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        bob = make_user(db, email="bob@example.com")
        db.commit()
        _join(client, gb, alice)
        _join(client, gb, bob)

        first = _leave(client, gb, bob)
        second = _leave(client, gb, bob)

        assert first.status_code == 200, first.text
        assert second.status_code == 404, second.text
        db.expire_all()
        remaining = _commits(db, gb)
        assert len(remaining) == 1
        assert remaining[0].user_id == alice.id

    def test_anonymous_cannot_leave(self, client, db):
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        db.commit()
        _join(client, gb, alice)

        resp = client.delete(f"/group-buys/{gb.id}/commit")

        # `== 401`, not `in (401, 403)`: the route answers a deterministic 401
        # and its four siblings in the rescue file all pin that exactly. The
        # loose form would stay green if this consumer-facing route were ever
        # moved behind a producer/role gate answering 403 — which is a
        # regression, not an implementation detail.
        assert resp.status_code == 401, resp.text
        db.expire_all()
        assert len(_commits(db, gb)) == 1

    def test_the_group_buy_row_itself_is_untouched_by_a_refused_leave(self, client, db):
        """A refused leave changes no column on the group buy.

        `cancel_commit` locks the group-buy row and may rewrite `status`
        (funded → open) on the success path, so the refused path running that
        far would be a real defect, not a cosmetic one.
        """
        gb = _open_group_buy(db)
        alice = make_user(db, email="alice@example.com")
        outsider = make_user(db, email="outsider@example.com")
        db.commit()
        _join(client, gb, alice)
        db.expire_all()
        row = db.get(GroupBuy, gb.id)
        before = {c.key: getattr(row, c.key) for c in GroupBuy.__mapper__.column_attrs}

        resp = _leave(client, gb, outsider)

        assert resp.status_code == 404, resp.text
        db.expire_all()
        row = db.get(GroupBuy, gb.id)
        after = {c.key: getattr(row, c.key) for c in GroupBuy.__mapper__.column_attrs}
        assert after == before, "a refused leave modified the group buy row"
