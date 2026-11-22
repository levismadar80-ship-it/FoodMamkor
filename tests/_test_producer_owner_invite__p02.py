"""Part 2 of 3 of `tests/test_producer_owner_invite.py`: TestExploits, TestEmailCode, TestAcceptCodeGate.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_producer_owner_invite.py` imports these tests, so
their node ids stay `tests/test_producer_owner_invite.py::...`. Run them with
`pytest tests/test_producer_owner_invite.py` (add `-k <ClassName>` to narrow).
"""

from app.models import Producer
from app.models import User
from app.routers import producer_owner_invite as poi
from conftest import auth_header
from conftest import make_user
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from sqlalchemy import String
from sqlalchemy import Text
from unittest import mock
import ast
import pytest
from _test_producer_owner_invite__common import DUMMY_CODE  # noqa: F401
from _test_producer_owner_invite__common import INVITE_COLUMNS  # noqa: F401
from _test_producer_owner_invite__common import INVITE_EMAIL  # noqa: F401
from _test_producer_owner_invite__common import _ACCEPT_URL  # noqa: F401
from _test_producer_owner_invite__common import _CODE_URL  # noqa: F401
from _test_producer_owner_invite__common import _admin_url  # noqa: F401
from _test_producer_owner_invite__common import _lookup_url  # noqa: F401
from _test_producer_owner_invite__common import _row  # noqa: F401
from _test_producer_owner_invite__common import _sha  # noqa: F401
from _test_producer_owner_invite__common import _snapshot  # noqa: F401
from _test_producer_owner_invite__common import accept_invite  # noqa: F401
from _test_producer_owner_invite__common import approved  # noqa: F401
from _test_producer_owner_invite__common import arm_code  # noqa: F401
from _test_producer_owner_invite__common import invite  # noqa: F401
from _test_producer_owner_invite__common import valid_accept_payload  # noqa: F401
from _test_producer_owner_invite__common import valid_invite_payload  # noqa: F401

# ---------------------------------------------------------------------------
# the eight exploit-proving cases (ADR-032 §2.6)
# ---------------------------------------------------------------------------


class TestExploits:
    def test_a_reused_token_is_404_and_creates_no_second_user(self, client, db):
        """(a) The link is a bearer credential for a LIVE page. If it survived
        its own use, anyone who later saw it — a forwarded email, a screenshot
        in a WhatsApp group — could mint a second owner account."""
        p = approved(db)
        _, token = invite(client, db, p)
        assert accept_invite(client, token).status_code == 200
        # A raw post with a throwaway code, on purpose: the token is already
        # dead, so this must die at the token check BEFORE the code gate. Arming
        # a fresh code here would 404 inside the helper and prove nothing about
        # the second accept.
        second = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert second.status_code == 404, second.text
        assert db.query(User).filter(User.producer_id == p.id).count() == 1

    def test_two_accepts_in_flight_produce_exactly_one_user(self, client, db):
        """(b) The claim must be a CONDITIONAL UPDATE, not SELECT-then-set
        (MEH-1820). Under READ COMMITTED two overlapping accepts would both see
        `owner_invite_accepted_at IS NULL` and both go on to insert.

        THE RACE IS FORCED, not hoped for, and the first version of this test
        did not force it — it had a start-barrier only, so a fast thread could
        finish before the slow one began and the loser would take the SAME 404
        the sequential reuse test already covers. That version passed against a
        SELECT-then-set implementation.

        The harness is `tests/test_otp_confirm_concurrency.py`'s (MEH-2162),
        which exists for exactly this shape. A `get_db` override scoped to this
        one test instruments the session so the two requests MEET at the claim:

            A  issues the claim UPDATE — the row lock is now HELD — signals
               `a_at_claim`; later, at commit, WAITS for `b_at_claim`
            main  ASSERTS A armed, then starts B
            B  reaches its own claim UPDATE, signals `b_at_claim` FIRST (its
               call is about to block on A's row lock, so a signal after it
               would never be sent), then issues it and blocks
            A  wakes immediately, commits, releases
            B  re-evaluates the WHERE against the committed row → 0 rows → 404

        Roles are decided by who claims FIRST, never by which session was built
        first: the request that claims second issues its own first `commit`
        during dependency resolution, well before the other request's claim, so
        keying on "this session's first commit" would arm on the wrong event.
        """
        import itertools
        import threading

        from fastapi.testclient import TestClient

        from app.database import SessionLocal, get_db

        _ARM = 60.0
        _CLAIM = 60.0
        _JOIN = 60.0

        p = approved(db)
        _, token = invite(client, db, p)

        a_at_claim = threading.Event()
        b_at_claim = threading.Event()
        results: dict[str, int] = {}
        claim_seq = itertools.count()
        seq_lock = threading.Lock()
        claim_fired = {"n": 0}

        def _is_invite_claim(stmt) -> bool:
            """True for the conditional UPDATE that claims the invite.

            Matched on the TABLE, not on a substring of the compiled SQL, so
            editing the WHERE clause cannot silently stop it matching — which
            would put the test straight back to being unsynchronised. The
            control after the join asserts it actually fired.
            """
            table = getattr(stmt, "table", None)
            return getattr(table, "name", None) == Producer.__tablename__ and (
                stmt.__class__.__name__ == "Update"
            )

        def barriered_get_db():
            session = SessionLocal()
            real_commit = session.commit
            real_execute = session.execute
            role = {"is_claimer": False}
            armed = {"commit": True}

            def barriered_commit(*a, **kw):
                # Only the winner blocks, and only once: a second commit inside
                # the window would re-enter the barrier and hang the run, which
                # is the least informative outcome a concurrency test has.
                if role["is_claimer"] and armed["commit"]:
                    armed["commit"] = False
                    b_at_claim.wait(_CLAIM)
                return real_commit(*a, **kw)

            seen = {"first": False}

            def barriered_execute(stmt, *a, **kw):
                # Only this request's FIRST producers UPDATE is the meeting
                # point. Since the code-attempt cap moved into the database,
                # an accept issues two: the attempt spend, then the claim. The
                # first is the one that takes the row lock, so it is where the
                # two requests have to meet; counting both would arm B's
                # signal on A's second statement.
                if not _is_invite_claim(stmt) or seen["first"]:
                    return real_execute(stmt, *a, **kw)
                seen["first"] = True
                with seq_lock:
                    first = next(claim_seq) == 0
                    claim_fired["n"] += 1
                if first:
                    role["is_claimer"] = True
                    result = real_execute(stmt, *a, **kw)
                    # Signal AFTER: only now is the row lock actually held,
                    # which is the state main is waiting to observe.
                    a_at_claim.set()
                    return result
                # Signal BEFORE: this call blocks on the winner's row lock.
                b_at_claim.set()
                return real_execute(stmt, *a, **kw)

            session.commit = barriered_commit
            session.execute = barriered_execute
            try:
                yield session
            finally:
                session.close()

        # ONE code, armed before the barrier and shared by both threads. Two
        # arms would be the wrong race: the second mint replaces the first
        # hash, so one thread would fail on its code and the conditional
        # UPDATE this test exists to exercise would never be contended.
        code = arm_code(client, token)
        body = valid_accept_payload(token, code)

        def accept(tag):
            # One TestClient per thread — httpx.Client is not documented as
            # thread-safe, and a test built to detect non-determinism is the
            # last place to lean on an implementation detail.
            results[tag] = (
                TestClient(client.app).post(_ACCEPT_URL, json=body).status_code
            )

        client.app.dependency_overrides[get_db] = barriered_get_db
        try:
            ta = threading.Thread(target=accept, args=("a",))
            tb = threading.Thread(target=accept, args=("b",))
            ta.start()
            # ASSERT the arm rather than discarding it: an unsynchronised run
            # produces the same values a correct one does, so a silent failure
            # to arm would make this test report a pass for the wrong reason.
            assert a_at_claim.wait(_ARM), (
                "thread A never reached its claim — the two requests were not "
                "synchronised, so this run proves nothing about the race"
            )
            tb.start()
            ta.join(timeout=_JOIN)
            tb.join(timeout=_JOIN)
        finally:
            client.app.dependency_overrides.pop(get_db, None)

        assert not ta.is_alive() and not tb.is_alive(), "a thread never finished"
        # The control for the instrument: if the matcher stopped matching, B
        # would never signal and the run above would look like a slow pass.
        assert claim_fired["n"] == 2, (
            f"the claim matcher fired {claim_fired['n']} times, expected 2 — "
            "the two requests did not both reach the conditional UPDATE, so "
            "the assertions below are about something else"
        )
        assert sorted(results.values()) == [200, 404], results
        assert db.query(User).filter(User.producer_id == p.id).count() == 1

    def test_the_email_race_after_the_precheck_rolls_the_claim_back(self, client, db):
        """The ONE window the pre-check cannot close, and the only thing that
        closes it is the unique index on `users.email` plus a rollback that
        takes the CLAIM with it.

        Forced rather than waited for: `_email_taken` is patched to answer
        False once — exactly as it would if the address were registered a
        microsecond after it looked — so the handler walks past the 409, claims
        the token, and only then hits the IntegrityError.

        What must hold afterwards is not just the status code: the claim has to
        be UNDONE, or the invitee is left holding a link the server has already
        marked used and no account to show for it. Deleting the `db.rollback()`
        in that except branch turns the last three assertions red.
        """
        p = approved(db)
        _, token = invite(client, db, p)
        make_user(db, email=INVITE_EMAIL)  # the racer, registered "in between"

        import app.routers.producer_owner_invite as module

        calls = {"n": 0}
        real = module._email_taken

        def blind_once(db_, email):
            calls["n"] += 1
            return False if calls["n"] == 1 else real(db_, email)

        module._email_taken = blind_once
        try:
            r = accept_invite(client, token)
        finally:
            module._email_taken = real

        # The control: the patch has to have been consulted, or this test is
        # the plain pre-check 409 under a different name.
        assert calls["n"] >= 1, "the handler never asked whether the email was taken"
        assert r.status_code == 409, r.text
        row = _row(db, p)
        assert row.owner_invite_token_hash == _sha(token), (
            "the claim was not rolled back"
        )
        assert row.owner_invite_accepted_at is None
        assert row.declared_at is None
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 1
        # And the link is still usable — that is the point of rolling back.
        assert client.get(_lookup_url(token)).status_code == 200

    @pytest.mark.parametrize("kill", ["resend", "cancel", "expire"])
    def test_a_replaced_cancelled_or_expired_token_is_404(self, client, db, kill):
        """(c) Three different ways a link stops being the live one. Each must
        be refused, and refused identically."""
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        if kill == "resend":
            client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        elif kill == "cancel":
            client.delete(_admin_url(p.id), headers=auth_header(admin))
        else:
            db.get(Producer, p.id).owner_invite_expires_at = datetime.now(
                timezone.utc
            ) - timedelta(seconds=1)
            db.commit()

        assert client.get(_lookup_url(token)).status_code == 404
        # Raw post: a dead link cannot be armed with a code either, and the
        # 404 has to come from the token check rather than from the helper.
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 404, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    @pytest.mark.parametrize(
        "over",
        [{"terms_accepted": False}, {"declaration_accepted": False}],
        ids=["no_terms", "no_declaration"],
    )
    def test_accept_without_the_consents_is_422_and_writes_nothing(
        self, client, db, over
    ):
        """(d) The consents are HERS. An admin built the page; nobody at
        Mehamakor may sign for her, and a client that omits a box must not get
        an account whose `terms_accepted_at` is stamped anyway."""
        p = approved(db)
        _, token = invite(client, db, p, **{})
        code = arm_code(client, token)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, code, **over))
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        # And the link is still live — a refused consent must not burn it.
        assert client.get(_lookup_url(token)).status_code == 200

    @pytest.mark.parametrize("status", ["rejected", "pending", "draft"])
    def test_a_business_that_leaves_the_invitable_states_kills_its_link(
        self, client, db, status
    ):
        """The invite hands over a page an admin has finished and stands
        behind. The moment it stops being one — rejected, pushed back to the
        queue, returned to a draft — the link must stop working, or an owner
        could accept her way onto a business an admin has just taken down.

        `inactive` is NOT in this list since v3 and must not be added back: a
        hidden page is the normal starting state of this whole flow, and
        accepting is what publishes it. The case above
        (`test_a_hidden_business_is_invitable_and_accepting_publishes_it`) is
        the other half of this parametrize, written out because its expected
        answer is the opposite one.

        Both halves: the lookup AND the accept, because they evaluate the
        condition separately (the accept's WHERE is the one that counts — the
        lookup's read is already stale by the time it returns)."""
        p = approved(db)
        _, token = invite(client, db, p)
        db.get(Producer, p.id).status = status
        db.commit()
        clean = _snapshot(db, p)

        assert client.get(_lookup_url(token)).status_code == 404
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 404, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_an_accepted_invite_blocks_a_new_one_even_with_no_account_left(
        self, client, db
    ):
        """`_load_invitable` refuses on `owner_invite_accepted_at` as well as on
        `_has_owner`, and the second check is not redundant with the first:
        they read different columns, and an admin who deleted the owner's
        account leaves a row that still reads as handed over. Without this
        branch she could mint a second invite on it."""
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        assert (
            accept_invite(client, token).status_code
            == 200
        )
        owner = db.query(User).filter(User.email == INVITE_EMAIL).one()
        db.delete(owner)
        db.commit()
        # No account points at it any more, so `_has_owner` is False — the
        # accepted stamp is the only thing left refusing.
        assert not db.query(User.id).filter(User.producer_id == p.id).first()
        r = client.post(
            _admin_url(p.id),
            json=valid_invite_payload(email="someone-else@example.com"),
            headers=auth_header(admin),
        )
        assert r.status_code == 409, r.text

    def test_non_admins_are_403_on_all_three_admin_endpoints(self, client, db):
        """(e) Vertical privilege. The three admin endpoints mint a credential
        that takes over a live business, so a producer or consumer reaching any
        of them is the whole attack."""
        p = approved(db)
        clean = _snapshot(db, p)
        for actor in (make_user(db), make_user(db, role="producer")):
            h = auth_header(actor)
            assert (
                client.post(
                    _admin_url(p.id), json=valid_invite_payload(), headers=h
                ).status_code
                == 403
            )
            assert (
                client.post(_admin_url(p.id, "/resend"), headers=h).status_code == 403
            )
            assert client.delete(_admin_url(p.id), headers=h).status_code == 403
        # Anonymous too — no header at all.
        assert client.post(
            _admin_url(p.id), json=valid_invite_payload()
        ).status_code in (401, 403)
        assert _snapshot(db, p) == clean

    def test_raw_token_is_nowhere_in_the_database_or_our_own_logs(
        self, client, db, capfd
    ):
        """(f) The token's only store is its sha256. A restored dump, a support
        query or the admin's own MCP reader must not be able to accept an
        invite on someone's behalf — and neither must a log line THIS CODE
        writes.

        Reads EVERY text-ish column of the row, not the one we expect to be
        clean: the failure this guards against is a NEW column that starts
        carrying the token.

        SCOPE, stated rather than quietly assumed. This asserts our own
        loggers. It does NOT — and cannot — assert that the token stays out of
        the HTTP ACCESS log, because the public lookup is
        `GET /auth/owner-invite/{token}` (card acceptance_criteria), so the
        token is in the request line by construction. That exposure is real,
        it is recorded as the PR's top residual risk, and the test below pins
        it as a FACT so it cannot quietly stop being true in either
        direction."""
        p = approved(db)
        _, token = invite(client, db, p)
        client.get(_lookup_url(token))
        accept_invite(client, token)

        row = _row(db, p)
        textish = [
            c.name for c in Producer.__table__.c if isinstance(c.type, (String, Text))
        ]
        assert textish, "the column filter matched nothing — this guard is void"
        for name in textish:
            value = getattr(row, name, None)
            if isinstance(value, str):
                assert token not in value, f"raw token leaked into producers.{name}"
        assert row.owner_invite_token_hash is None  # cleared by the accept

        user = db.query(User).filter(User.email == INVITE_EMAIL).one()
        for c in User.__table__.c:
            value = getattr(user, c.name, None)
            if isinstance(value, str):
                assert token not in value, f"raw token leaked into users.{c.name}"

        # structlog writes to stdout (`PrintLoggerFactory(sys.stdout)`,
        # logging_config.py:84), so the lines this module emits are captured
        # at the file descriptor — NOT by `caplog`, which only sees stdlib
        # records. Selecting them by their own event prefix is what keeps this
        # about OUR lines: `httpx` logs the request line, which carries the
        # token because the endpoint takes it in the path, and that documented
        # exposure is pinned by the next test instead of being folded in here.
        captured = capfd.readouterr()
        ours = [
            line
            for line in (captured.out + captured.err).splitlines()
            if "owner_invite." in line
        ]
        # The control, stated before the assertion it guards: this run has to
        # have produced our log lines at all, or "the token is not in them"
        # is a fact about an empty list.
        assert len(ours) >= 2, (
            f"expected the created + accepted log lines, captured {len(ours)}: "
            f"{ours} — the token assertion below would pass against a dead logger"
        )
        assert str(p.id) in "\n".join(ours), "our log lines are about another row"
        for line in ours:
            assert token not in line, f"raw token reached a log line we write: {line}"

    def test_the_token_is_in_the_request_line_and_that_is_a_known_exposure(
        self, client, db, caplog
    ):
        """Not a guard — a PIN on a known, accepted exposure, so that it shows
        up in a diff the day it changes.

        `GET /auth/owner-invite/{token}` is prescribed by the card, and it puts
        a credential in every HTTP access log and in Sentry's request context.
        `producer_claim.py` made the OPPOSITE call for its own (weaker) token —
        «DO NOT turn the preview back into a GET ?token=» — after the review of
        record on PR #3579. Both precedents are live: `admin_outreach.get_prefill`
        is a GET-with-token-in-path in production today.

        If someone moves this endpoint to a POST-with-body (the recommended
        follow-up), this test goes red and SHOULD be deleted in that change.
        Until then it stops the exposure being rediscovered as a surprise."""
        import logging

        p = approved(db)
        _, token = invite(client, db, p)
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="httpx"):
            client.get(_lookup_url(token))
        request_lines = "\n".join(
            r.getMessage() for r in caplog.records if r.name.startswith("httpx")
        )
        assert token in request_lines, (
            "the token is no longer in the request line — if the lookup moved "
            "to a POST body, delete this test in the same change"
        )

    def test_the_admin_put_cannot_write_any_invite_column(self, client, db):
        """(g) `admin_update_producer` applies its payload with a bulk setattr
        (admin.py:1012). If these columns ever joined `ProducerAdminUpdate`, an
        ordinary edit form could mint an invite — or forge an accepted one."""
        admin = make_user(db, role="admin")
        p = approved(db)
        clean = _snapshot(db, p)
        forged = {
            "owner_invite_email": "attacker@example.com",
            "owner_invite_token_hash": _sha("anything"),
            "owner_invite_expires_at": "2030-01-01T00:00:00+00:00",
            "owner_invite_accepted_at": "2030-01-01T00:00:00+00:00",
            "owner_invite_consent_note": "forged",
            "owner_invite_name": "forged",
        }
        r = client.put(
            f"/admin/producers/{p.id}",
            json={"name": p.name} | forged,
            headers=auth_header(admin),
        )
        assert r.status_code in (200, 422), r.text
        assert _snapshot(db, p) == clean
        from app.schemas.schemas import ProducerAdminUpdate

        for name in INVITE_COLUMNS:
            assert name not in ProducerAdminUpdate.model_fields, name

    def test_forgot_password_for_an_invited_email_creates_nothing(self, client, db):
        """(h) Closed decision 2 — no `users` row until acceptance — is what
        keeps forgot-password from becoming a way AROUND the declaration step.
        If an invite created a user, the invitee could reset its password and
        land in the dashboard having signed nothing."""
        sent: list = []
        import app.routers.auth as auth_router

        original = auth_router._send_reset_email
        auth_router._send_reset_email = lambda *a, **k: sent.append(a)
        try:
            p = approved(db)
            invite(client, db, p)
            r = client.post("/auth/forgot-password", json={"email": INVITE_EMAIL})
        finally:
            auth_router._send_reset_email = original

        assert r.status_code == 200, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        assert sent == [], "a reset email was dispatched for an address with no account"

        # THE CONTROL, and it is the whole value of the assertion above: a
        # patch point that no longer fires would make `sent == []` true for a
        # user who DOES exist, i.e. true for every input. So prove the capture
        # works, with a real account, in the same patched window.
        real_user = make_user(db, email="has-an-account@example.com")
        auth_router._send_reset_email = lambda *a, **k: sent.append(a)
        try:
            client.post("/auth/forgot-password", json={"email": real_user.email})
        finally:
            auth_router._send_reset_email = original
        assert len(sent) == 1, (
            "the patch point did not fire for an account that exists — the "
            "assertion above was vacuous"
        )


# ---------------------------------------------------------------------------
# v3 — the email code (the card's revision of 12/11)
# ---------------------------------------------------------------------------


class TestEmailCode:
    """She types an address on the page and proves it with a 6-digit code.

    This is the gate that makes an invite safe to hand over through WhatsApp
    with no address on it at all: whoever holds the link still cannot create an
    account on an address she does not read mail for.
    """

    def test_a_code_is_sent_and_only_its_hash_is_stored(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        assert len(code) == 6 and code.isdigit(), code
        row = _row(db, p)
        assert row.owner_invite_code_hash == _sha(code)
        assert row.owner_invite_code_attempts == 0
        assert row.owner_invite_code_expires_at > datetime.now(timezone.utc)
        # Ten minutes, not seven days: the link's own TTL is for a person who
        # opens her mail tomorrow, this one is for a person reading it now.
        assert row.owner_invite_code_expires_at < datetime.now(
            timezone.utc
        ) + timedelta(minutes=11)
        # The plaintext is in no column of the row — asserted over every
        # text-ish column rather than the three we expect, so a future column
        # that starts carrying it reds. Same filter as the token guard above,
        # and the same emptiness check, because a filter that matched nothing
        # would make this loop vacuous.
        textish = [
            c.name for c in Producer.__table__.c if isinstance(c.type, (String, Text))
        ]
        assert textish, "the column filter matched nothing — this guard is void"
        for name in textish:
            value = getattr(row, name, None)
            if isinstance(value, str):
                assert code not in value, f"the code reached producers.{name}"

    def test_the_answer_is_byte_identical_for_a_free_and_a_taken_address(
        self, client, db
    ):
        """An account-existence oracle is the thing this endpoint would be if
        it answered differently — and it takes an arbitrary address from
        anyone holding the link, so that oracle would be free to query."""
        p1 = approved(db)
        _, t1 = invite(client, db, p1)
        free = client.post(_CODE_URL, json={"token": t1, "email": "nobody@example.com"})

        p2 = approved(db)
        _, t2 = invite(client, db, p2, email="other@example.com")
        make_user(db, email="taken@example.com")
        taken = client.post(_CODE_URL, json={"token": t2, "email": "taken@example.com"})

        assert free.status_code == taken.status_code == 200
        assert free.content == taken.content

    def test_a_taken_address_is_never_mailed(self, client, db):
        """The invisible half of the uniform answer: nothing is mailed, so the
        acceptance it would lead to dies at the 409 it was always going to die
        at. A code IS stored — see the next test for why."""
        p = approved(db)
        _, token = invite(client, db, p)
        make_user(db, email="taken@example.com")
        sent = []
        with mock.patch.object(
            poi, "send_owner_invite_code_email", side_effect=lambda *a, **k: sent.append(a)
        ):
            r = client.post(_CODE_URL, json={"token": token, "email": "taken@example.com"})
        assert r.status_code == 200, r.text
        assert sent == []
        # The address IS recorded — the page shows it back, and an acceptance
        # has to match what was recorded.
        assert _row(db, p).owner_invite_email == "taken@example.com"

    def test_accept_cannot_tell_a_taken_address_from_a_free_one_either(
        self, client, db
    ):
        """THE ORACLE THIS CLOSES, which lived one request to the right of the
        uniform ack and was invisible to the test above.

        `/email-code` answers identically for both. `/accept` did not: with no
        code stored it said «צריך לבקש קוד» and with one stored it said «הקוד
        לא תואם» — so anyone holding one link could ask about any address
        here, then read the answer off the next request. The fix is that a
        taken address gets a code minted and simply never mailed.

        This test is the pair, which is the only level the property exists at:
        the two endpoints are compared TOGETHER, byte for byte.
        """
        free, taken = "free@example.com", "taken@example.com"
        make_user(db, email=taken)

        answers = []
        for address in (free, taken):
            p = approved(db)
            _, token = invite(client, db, p, email=f"inv-{address}")
            ack = client.post(_CODE_URL, json={"token": token, "email": address})
            acc = client.post(
                _ACCEPT_URL, json=valid_accept_payload(token, DUMMY_CODE, address)
            )
            answers.append((ack.status_code, ack.content, acc.status_code, acc.content))

        assert answers[0] == answers[1], (
            "the free address and the registered one are distinguishable across "
            f"the pair: {answers}"
        )
        # And the assertion discriminates only if the pair SAYS something —
        # a 404 on both (a dead link) would satisfy equality while testing
        # nothing.
        assert answers[0][0] == 200 and answers[0][2] == 422, answers[0]

    def test_a_second_send_replaces_the_first_code(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        first = arm_code(client, token)
        second = arm_code(client, token)
        assert first != second
        assert _row(db, p).owner_invite_code_hash == _sha(second)
        # And the old one is dead, not merely superseded.
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, first))
        assert r.status_code == 422, r.text

    def test_a_dead_link_is_404_and_stores_nothing(self, client, db):
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        client.delete(_admin_url(p.id), headers=auth_header(admin))
        clean = _snapshot(db, p)
        r = client.post(_CODE_URL, json={"token": token, "email": INVITE_EMAIL})
        assert r.status_code == 404, r.text
        assert r.json()["detail"] == client.get(_lookup_url(token)).json()["detail"]
        assert _snapshot(db, p) == clean

    def test_the_code_is_in_no_log_line_of_ours(self, client, db, capfd):
        """Same posture as the token: our own structlog output may name the
        producer and nothing else. Read through `capfd` rather than `caplog`
        because structlog writes to the stream, not through the stdlib
        handler."""
        p = approved(db)
        _, token = invite(client, db, p)
        capfd.readouterr()
        code = arm_code(client, token)
        out, err = capfd.readouterr()
        assert "owner_invite.code_sent" in out + err, (
            "the log line we are asserting about did not appear — this guard "
            "would pass for an endpoint that logs nothing at all"
        )
        assert code not in out + err


class TestAcceptCodeGate:
    """Every one of these asserts the same second thing: a failed accept
    writes NOTHING but the attempts counter. The card's «בלי קוד תקף: אפס
    כתיבות מלבד המונה»."""

    def test_no_code_at_all_is_422_and_writes_nothing(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        # Still live: a missing code must not burn the link.
        assert client.get(_lookup_url(token)).status_code == 200

    def test_a_wrong_code_is_422_and_bumps_only_the_counter(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        before = _snapshot(db, p)
        wrong = "000000" if code != "000000" else "111111"
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, wrong))
        assert r.status_code == 422, r.text
        after = _snapshot(db, p)
        assert after["owner_invite_code_attempts"] == 1
        # Everything else, column by column — including the token, which must
        # survive so she can try again.
        assert {k: v for k, v in after.items() if k != "owner_invite_code_attempts"} == {
            k: v for k, v in before.items() if k != "owner_invite_code_attempts"
        }
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_a_right_code_on_the_wrong_address_is_422_and_counts(self, client, db):
        """A code issued to one address may not be spent on another. The
        comparison is against the ROW, not against the body — if it were
        against the body, this would pass with any address."""
        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        r = client.post(
            _ACCEPT_URL,
            json=valid_accept_payload(token, code, email="someone-else@example.com"),
        )
        assert r.status_code == 422, r.text
        assert _row(db, p).owner_invite_code_attempts == 1
        assert db.query(User).count() == 1  # the admin who invited, and nobody else

    def test_five_wrong_guesses_kill_the_code_even_for_the_right_one(
        self, client, db
    ):
        """A six-digit secret is 10^6 wide; without a cap, a link holder walks
        it. The cap is on the CODE, not on the link — a new code revives the
        flow, which is the next test."""
        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        wrong = "000000" if code != "000000" else "111111"
        for i in range(poi.OWNER_INVITE_CODE_MAX_ATTEMPTS):
            r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, wrong))
            assert r.status_code == 422, (i, r.text)
        assert _row(db, p).owner_invite_code_attempts == (
            poi.OWNER_INVITE_CODE_MAX_ATTEMPTS
        )
        # The RIGHT code, now dead. This is the assertion that discriminates:
        # without the cap it answers 200.
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, code))
        assert r.status_code == 422, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        # And the counter did not keep climbing past the cap — the gate
        # answers
        # before it writes.
        assert _row(db, p).owner_invite_code_attempts == (
            poi.OWNER_INVITE_CODE_MAX_ATTEMPTS
        )

    def test_a_fresh_code_revives_a_walked_out_invite(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        arm_code(client, token)
        for _ in range(poi.OWNER_INVITE_CODE_MAX_ATTEMPTS):
            client.post(_ACCEPT_URL, json=valid_accept_payload(token, "000000"))
        assert accept_invite(client, token).status_code == 200

    def test_an_expired_code_is_422(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        row = db.get(Producer, p.id)
        row.owner_invite_code_expires_at = datetime.now(timezone.utc) - timedelta(
            seconds=1
        )
        db.commit()
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, code))
        assert r.status_code == 422, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_a_successful_accept_clears_the_code_columns(self, client, db):
        """The code is spent with the token. A code left behind would outlive
        the invite it belonged to."""
        p = approved(db)
        _, token = invite(client, db, p)
        assert accept_invite(client, token).status_code == 200
        row = _row(db, p)
        assert row.owner_invite_code_hash is None
        assert row.owner_invite_code_expires_at is None
        assert row.owner_invite_code_attempts is None

    def test_the_counter_is_computed_in_the_database(self, client, db):
        """`attempts + 1` has to be the ROW's arithmetic, not this process's.

        A read-modify-write in Python lets N parallel guesses all read the
        same value and all write value+1 — the counter then advances once per
        ROUND instead of once per guess, and the five-attempt cap becomes
        something a client beats with concurrency rather than patience.

        Asserted structurally rather than by racing threads: the race is real
        but probabilistic, and what makes it impossible is that the increment
        is an UPDATE expression. So this reads the statement the handler
        issues — a test that passes for a `producer.x = attempts + 1` version
        would not be evidence for the change.
        """
        import ast
        import inspect

        src = inspect.getsource(poi._verify_email_code)
        tree = ast.parse(src.lstrip())
        assigns = [
            n
            for n in ast.walk(tree)
            if isinstance(n, ast.Attribute)
            and n.attr == "owner_invite_code_attempts"
            and isinstance(n.ctx, ast.Store)
        ]
        assert not assigns, (
            "the attempts counter is assigned in Python — it must be an UPDATE "
            "expression, or parallel guesses collapse into one"
        )
        assert "func.coalesce" in src, (
            "no SQL expression found for the increment — this guard is void"
        )

        # And the behaviour the structure is for, still asserted end to end.
        p = approved(db)
        _, token = invite(client, db, p)
        arm_code(client, token)
        for expected in (1, 2, 3):
            client.post(_ACCEPT_URL, json=valid_accept_payload(token, "000000"))
            assert _row(db, p).owner_invite_code_attempts == expected

    def test_the_cap_is_decided_by_the_row_not_by_a_stale_read(self, client, db):
        """The cap must hold against a request that READ the row before the
        counter reached it.

        N parallel guesses all load the row with `attempts < MAX`. If the gate
        is only that in-memory read, every one of them gets a comparison and
        the cap bounds rounds, not guesses. So the attempt is spent by a
        conditional UPDATE that matches only while the row itself is under the
        cap.

        Staged deterministically instead of raced: the object is loaded, the
        counter is walked to the cap behind its back (the write another request
        would have made), and the verifier is then handed the stale object with
        the RIGHT code. A gate that trusts the object lets it through.
        """
        from fastapi import HTTPException

        p = approved(db)
        _, token = invite(client, db, p)
        code = arm_code(client, token)
        stale = db.get(Producer, p.id)
        db.refresh(stale)
        assert (stale.owner_invite_code_attempts or 0) == 0
        db.query(Producer).filter(Producer.id == p.id).update(
            {Producer.owner_invite_code_attempts: poi.OWNER_INVITE_CODE_MAX_ATTEMPTS},
            synchronize_session=False,
        )
        db.flush()
        # The control: the object really is stale, or this proves nothing.
        assert (stale.owner_invite_code_attempts or 0) == 0

        with pytest.raises(HTTPException) as exc:
            poi._verify_email_code(
                db, stale, INVITE_EMAIL, code, datetime.now(timezone.utc)
            )
        assert exc.value.status_code == 422

    def test_a_resend_and_a_cancel_each_clear_the_code(self, client, db):
        for action in ("resend", "cancel"):
            db.query(User).delete()
            db.commit()
            p = approved(db)
            admin = make_user(db, role="admin")
            _, token = invite(client, db, p, admin=admin, email=f"{action}@example.com")
            arm_code(client, token, f"{action}@example.com")
            assert _row(db, p).owner_invite_code_hash is not None
            if action == "resend":
                client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
            else:
                client.delete(_admin_url(p.id), headers=auth_header(admin))
            assert _row(db, p).owner_invite_code_hash is None, action
