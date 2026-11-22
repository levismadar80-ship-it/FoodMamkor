"""Part 1 of 3 of `tests/test_producer_owner_invite.py`: TestModelColumns, TestAdminCreate, TestAdminResend, TestAdminCancel, TestPublicLookup, TestAccept, TestInviteEmail.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_producer_owner_invite.py` imports these tests, so
their node ids stay `tests/test_producer_owner_invite.py::...`. Run them with
`pytest tests/test_producer_owner_invite.py` (add `-k <ClassName>` to narrow).
"""

from app.models import Producer
from app.models import User
from conftest import auth_header
from conftest import make_producer
from conftest import make_user
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from sqlalchemy import DateTime
from sqlalchemy import String
from sqlalchemy import Text
import pytest
from _test_producer_owner_invite__common import CONSENT_NOTE  # noqa: F401
from _test_producer_owner_invite__common import GOOD_PASSWORD  # noqa: F401
from _test_producer_owner_invite__common import INVITE_COLUMNS  # noqa: F401
from _test_producer_owner_invite__common import INVITE_EMAIL  # noqa: F401
from _test_producer_owner_invite__common import _ACCEPT_URL  # noqa: F401
from _test_producer_owner_invite__common import _PHOTO  # noqa: F401
from _test_producer_owner_invite__common import _admin_url  # noqa: F401
from _test_producer_owner_invite__common import _lookup_url  # noqa: F401
from _test_producer_owner_invite__common import _row  # noqa: F401
from _test_producer_owner_invite__common import _sha  # noqa: F401
from _test_producer_owner_invite__common import _snapshot  # noqa: F401
from _test_producer_owner_invite__common import _token_of  # noqa: F401
from _test_producer_owner_invite__common import accept_invite  # noqa: F401
from _test_producer_owner_invite__common import approved  # noqa: F401
from _test_producer_owner_invite__common import arm_code  # noqa: F401
from _test_producer_owner_invite__common import invite  # noqa: F401
from _test_producer_owner_invite__common import own  # noqa: F401
from _test_producer_owner_invite__common import valid_accept_payload  # noqa: F401
from _test_producer_owner_invite__common import valid_invite_payload  # noqa: F401

# ---------------------------------------------------------------------------
# the model columns
# ---------------------------------------------------------------------------


class TestModelColumns:
    def test_all_eleven_exist_nullable_without_server_default(self):
        cols = Producer.__table__.c
        for name in INVITE_COLUMNS:
            assert name in cols, name
            assert cols[name].nullable is True, name
            assert cols[name].server_default is None, name

    def test_types_are_what_the_card_asked_for(self):
        cols = Producer.__table__.c
        for name in ("owner_invite_email", "owner_invite_name"):
            assert isinstance(cols[name].type, String)
            assert cols[name].type.length == 200, name
        assert isinstance(cols["owner_invite_token_hash"].type, String)
        assert cols["owner_invite_token_hash"].type.length == 64
        assert isinstance(cols["owner_invite_consent_note"].type, Text)
        for name in (
            "owner_invite_expires_at",
            "owner_invite_sent_at",
            "owner_invite_accepted_at",
        ):
            assert isinstance(cols[name].type, DateTime), name
            assert cols[name].type.timezone is True, name

    def test_token_hash_is_indexed(self):
        assert Producer.__table__.c.owner_invite_token_hash.index is True

    def test_created_by_fk_names_itself_and_uses_alter(self):
        # Both halves are load-bearing: users.producer_id already points at
        # producers, so this closes a cycle and an UNNAMED constraint makes
        # SQLAlchemy's drop_all raise CircularDependencyError — which breaks
        # conftest._bootstrap_schema and therefore the WHOLE suite, not this
        # feature. Measured during MEH-2974; see the model comment.
        fk = next(f for f in Producer.__table__.c.owner_invite_created_by.foreign_keys)
        assert fk.target_fullname == "users.id"
        assert fk.ondelete == "SET NULL"
        assert fk.constraint.name == "fk_producers_owner_invite_created_by_users"
        assert fk.constraint.use_alter is True


# ---------------------------------------------------------------------------
# admin: create
# ---------------------------------------------------------------------------


class TestAdminCreate:
    def test_happy_path_returns_the_link_once_and_stamps_the_row(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        before = datetime.now(timezone.utc)
        r, token = invite(client, db, p, admin=admin)
        after = datetime.now(timezone.utc)
        assert r.status_code == 200, r.text
        body = r.json()
        assert token and len(token) >= 32
        assert body["invite_url"].endswith(f"/owner-invite/{token}")
        assert body["email"] == INVITE_EMAIL

        row = _row(db, p)
        assert row.owner_invite_email == INVITE_EMAIL
        assert row.owner_invite_name == "דנה כהן"
        assert row.owner_invite_consent_note == CONSENT_NOTE
        assert row.owner_invite_created_by == admin.id
        assert row.owner_invite_accepted_at is None
        assert before <= row.owner_invite_sent_at <= after
        # 7 days, fixed in code. Asserted as a window so a second of clock
        # drift between the two reads cannot flake it.
        assert (
            before + timedelta(days=7)
            <= row.owner_invite_expires_at
            <= after + timedelta(days=7)
        )
        assert row.owner_invite_token_hash == _sha(token)

    def test_email_is_normalised_lower_and_trimmed(self, client, db):
        p = approved(db)
        r, _ = invite(client, db, p, email="  Owner-Invite-Target@Example.COM ")
        assert r.status_code == 200, r.text
        assert _row(db, p).owner_invite_email == INVITE_EMAIL

    def test_a_second_create_replaces_the_first_token(self, client, db):
        p = approved(db)
        _, first = invite(client, db, p)
        _, second = invite(client, db, p)
        assert first and second and first != second
        assert _row(db, p).owner_invite_token_hash == _sha(second)

    @pytest.mark.parametrize(
        "over",
        [
            {"consent_confirmed": False},
            {"consent_note": ""},
            {"consent_note": "   "},
            {"email": "not-an-email"},
        ],
        ids=["consent_unchecked", "note_empty", "note_whitespace", "email_invalid"],
    )
    def test_422_writes_nothing(self, client, db, over):
        p = approved(db)
        clean = _snapshot(db, p)
        r, _ = invite(client, db, p, **over)
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean

    def test_409_when_the_business_already_has_an_owner(self, client, db):
        p = approved(db)
        own(db, p)
        clean = _snapshot(db, p)
        r, _ = invite(client, db, p)
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean

    def test_409_when_the_email_already_belongs_to_a_user(self, client, db):
        make_user(db, email=INVITE_EMAIL)
        p = approved(db)
        clean = _snapshot(db, p)
        r, _ = invite(client, db, p)
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean

    def test_409_on_a_taken_email_ignores_case_and_padding(self, client, db):
        make_user(db, email=INVITE_EMAIL)
        p = approved(db)
        r, _ = invite(client, db, p, email="  OWNER-INVITE-TARGET@example.com  ")
        assert r.status_code == 409, r.text

    @pytest.mark.parametrize("status", ["draft", "pending", "rejected"])
    def test_409_when_the_business_is_neither_approved_nor_hidden(
        self, client, db, status
    ):
        p = make_producer(db, status=status, images=_PHOTO)
        clean = _snapshot(db, p)
        r, _ = invite(client, db, p)
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean

    def test_a_hidden_business_is_invitable_and_accepting_publishes_it(
        self, client, db
    ):
        """(v3) The card's own flow: the admin builds the page HIDDEN, hands it
        over, and the owner's acceptance is what puts it in front of anyone.
        `inactive` was a 409 until v3 — this is the test that says it is not."""
        p = make_producer(db, status="inactive", images=_PHOTO)
        r, token = invite(client, db, p)
        assert r.status_code == 200, r.text
        assert client.get(_lookup_url(token)).json()["will_publish"] is True
        assert accept_invite(client, token).status_code == 200
        assert _row(db, p).status == "approved"

    def test_404_for_an_unknown_business(self, client, db):
        admin = make_user(db, role="admin")
        r = client.post(
            _admin_url("00000000-0000-0000-0000-000000000000"),
            json=valid_invite_payload(),
            headers=auth_header(admin),
        )
        assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# admin: resend + cancel
# ---------------------------------------------------------------------------


class TestAdminResend:
    def test_resend_mints_a_new_token_and_kills_the_old_one(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, first = invite(client, db, p, admin=admin)
        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        second = _token_of(r)
        assert second and second != first
        assert _row(db, p).owner_invite_token_hash == _sha(second)
        assert client.get(_lookup_url(first)).status_code == 404
        assert client.get(_lookup_url(second)).status_code == 200

    def test_resend_keeps_the_email_name_and_consent_note(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        invite(client, db, p, admin=admin)
        client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        row = _row(db, p)
        assert row.owner_invite_email == INVITE_EMAIL
        assert row.owner_invite_name == "דנה כהן"
        assert row.owner_invite_consent_note == CONSENT_NOTE

    def test_404_resending_a_business_with_no_invite(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 404, r.text

    def test_409_resending_an_accepted_invite(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        assert (
            accept_invite(client, token).status_code
            == 200
        )
        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 409, r.text


class TestAdminCancel:
    def test_cancel_clears_the_invite_and_kills_the_link(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        r = client.delete(_admin_url(p.id), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        row = _row(db, p)
        assert row.owner_invite_token_hash is None
        assert row.owner_invite_expires_at is None
        assert row.owner_invite_sent_at is None
        assert row.owner_invite_email is None
        assert client.get(_lookup_url(token)).status_code == 404

    def test_cancel_keeps_the_audit_trail(self, client, db):
        """Cancel clears the invitee's PII and the token. It must NOT clear the
        record that an invite was ever sent — `owner_invite_created_by` and the
        consent note are the only evidence that a human approved it, and an
        audit trail a cancel can erase is not an audit trail."""
        admin = make_user(db, role="admin")
        p = approved(db)
        invite(client, db, p, admin=admin)
        assert (
            client.delete(_admin_url(p.id), headers=auth_header(admin)).status_code
            == 200
        )
        row = _row(db, p)
        assert row.owner_invite_consent_note == CONSENT_NOTE
        assert row.owner_invite_created_by == admin.id

    @pytest.mark.parametrize("status", ["inactive", "rejected", "pending"])
    def test_an_invite_can_be_revoked_after_the_business_leaves_approved(
        self, client, db, status
    ):
        """Withdrawing a credential must never be gated on the state of the
        thing it protects.

        The first version shared ONE loader with create and resend, so
        suspending a business also locked its outstanding invite in place: the
        admin got a 409 and could not revoke the link, and re-approving the
        business brought the same link back to life. Found in review.
        """
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        db.get(Producer, p.id).status = status
        db.commit()

        r = client.delete(_admin_url(p.id), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert _row(db, p).owner_invite_token_hash is None
        # And re-approving does not revive it — the hash is gone, not hidden.
        db.get(Producer, p.id).status = "approved"
        db.commit()
        assert client.get(_lookup_url(token)).status_code == 404

    def test_404_cancelling_when_there_is_nothing_to_cancel(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        assert (
            client.delete(_admin_url(p.id), headers=auth_header(admin)).status_code
            == 404
        )

    def test_409_cancelling_an_accepted_invite(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        accept_invite(client, token)
        r = client.delete(_admin_url(p.id), headers=auth_header(admin))
        assert r.status_code == 409, r.text
        assert _row(db, p).owner_invite_accepted_at is not None


# ---------------------------------------------------------------------------
# public: lookup
# ---------------------------------------------------------------------------


class TestPublicLookup:
    def test_returns_the_business_name_and_the_invited_email(self, client, db):
        p = approved(db, name="מחלבת העמק")
        _, token = invite(client, db, p)
        r = client.get(_lookup_url(token))
        assert r.status_code == 200, r.text
        assert r.json() == {
            "producer_name": "מחלבת העמק",
            "email": INVITE_EMAIL,
            "requires_farmer_declaration": False,
            # Already approved, so accepting changes who controls the page,
            # not whether anyone can see it. The button copy follows this.
            "will_publish": False,
            # The same five public fields the claim page carries, built from
            # the invite rather than from /producers/* so a HIDDEN business
            # does not become reachable before its owner accepts.
            "preview": {
                "name": "מחלבת העמק",
                "city": p.city,
                "short_description": p.short_description,
                "image": (p.images or [None])[0],
                "category_names": [],
            },
        }

    def test_requires_farmer_declaration_for_an_agricultural_category(self, client, db):
        from conftest import make_category

        from app.models import ProducerCategory

        p = approved(db)
        cat = make_category(db, name="ירקות")
        db.add(ProducerCategory(producer_id=p.id, category_id=cat.id))
        db.commit()
        _, token = invite(client, db, p)
        assert (
            client.get(_lookup_url(token)).json()["requires_farmer_declaration"] is True
        )

    def test_the_response_carries_no_token_and_no_hash(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        raw = client.get(_lookup_url(token)).text
        assert token not in raw
        assert _sha(token) not in raw
        assert "token" not in client.get(_lookup_url(token)).json()


# ---------------------------------------------------------------------------
# public: accept
# ---------------------------------------------------------------------------


class TestAccept:
    def test_signs_every_field_and_logs_her_in(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        before = datetime.now(timezone.utc)
        r = accept_invite(client, token)
        after = datetime.now(timezone.utc)
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

        user = db.query(User).filter(User.email == INVITE_EMAIL).one()
        assert user.role == "producer"
        assert user.producer_id == p.id
        assert user.is_producer is True
        assert user.email_verified is True
        assert user.password_hash
        assert before <= user.password_changed_at <= after
        assert before <= user.terms_accepted_at <= after
        assert user.terms_version
        assert user.name == "דנה כהן"

        row = _row(db, p)
        assert before <= row.declared_at <= after
        assert row.declaration_version
        assert before <= row.owner_invite_accepted_at <= after
        assert row.owner_invite_token_hash is None
        # She owns a page that is already live — that is the whole feature.
        assert row.status == "approved"

    def test_she_can_log_in_with_the_password_she_chose(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        accept_invite(client, token)
        r = client.post(
            "/auth/login", json={"email": INVITE_EMAIL, "password": GOOD_PASSWORD}
        )
        assert r.status_code == 200, r.text

    def test_auth_me_reports_an_approved_business(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        assert (
            accept_invite(client, token).status_code
            == 200
        )
        user = db.query(User).filter(User.email == INVITE_EMAIL).one()
        # `auth_header` and NOT the access token the accept returned, on
        # purpose. That token carries the MEH-327 `userFingerprint` claim, and
        # `get_current_user` 401s unless the matching `__Secure-Fgp` cookie
        # comes back with the request — which it cannot here, because the
        # cookie is `Secure` and TestClient speaks http://testserver. A login
        # token behaves identically; the binding is covered by
        # `test_sets_the_refresh_and_fingerprint_cookies_like_login` above.
        # What THIS test is about is the shape of the row that was created.
        me = client.get("/auth/me", headers=auth_header(user))
        assert me.status_code == 200, me.text
        assert me.json()["producer_status"] == "approved"
        assert me.json()["role"] == "producer"

    def test_sets_the_refresh_and_fingerprint_cookies_like_login(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        r = accept_invite(client, token)
        names = {c.split("=")[0] for c in r.headers.get_list("set-cookie")}
        assert "refresh_token" in names
        assert "__Secure-Fgp" in names

    def test_422_on_a_password_that_fails_the_policy(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        # Armed BEFORE the snapshot: asking for a code is a legitimate write
        # (the hash, its expiry, a zeroed counter), so a snapshot taken before
        # it would red on the arm rather than on anything the refused accept
        # did. What must not move is everything else — and the counter, which
        # a correct code does not touch.
        code = arm_code(client, token)
        clean = _snapshot(db, p)
        r = client.post(
            _ACCEPT_URL, json=valid_accept_payload(token, code, password="short")
        )
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_409_when_the_business_gained_an_owner_between_invite_and_accept(
        self, client, db
    ):
        """`_load_invitable` makes this check at create / resend / cancel time;
        `accept` makes it too. Not exploitable today — nothing attaches an
        owner to an APPROVED row — but `users.producer_id` carries no unique
        index, so the invariant has no backstop in the database and this is
        the line that would stop a future transfer tool minting a second
        owner. Removing it turns this red."""
        p = approved(db)
        _, token = invite(client, db, p)
        own(db, p, email="someone-already@example.com")
        code = arm_code(client, token)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, code))
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_409_when_the_email_was_taken_between_invite_and_accept(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        # Arming first, then taking the address — which is the real sequence
        # anyway: she asked for a code, and someone registered meanwhile.
        # Arming AFTER would record the address but mint NO code (it is
        # already taken — the uniform-ack branch), so the accept would die at
        # the code gate with a 422 instead of reaching the 409 this test is
        # about.
        code = arm_code(client, token)
        make_user(db, email=INVITE_EMAIL)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, code))
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 1


# ---------------------------------------------------------------------------
# the email — what is dispatched, and what is in it
# ---------------------------------------------------------------------------


class TestInviteEmail:
    """`send_email` is fail-open with no RESEND_API_KEY (services/email.py), so
    EVERY test above passes whether or not an email was ever queued. These are
    the ones that would notice.

    What they cannot cover is the wire: tests/CLAUDE.md records that router-level
    mocks hide Resend-side bugs (encoding, MIME — MEH-325), and that a live
    "Show original" inspection is mandatory before closing an email ticket. That
    is stated in the PR body as deferred, not claimed here.
    """

    def _capture(self, monkeypatch):
        sent: list = []
        import app.routers.producer_owner_invite as module

        monkeypatch.setattr(
            module,
            "send_owner_invite_email",
            lambda *a, **k: sent.append((a, k)),
        )
        return sent

    def test_create_queues_the_email_with_the_link_it_returned(
        self, client, db, monkeypatch
    ):
        sent = self._capture(monkeypatch)
        p = approved(db, name="מחלבת העמק")
        r, token = invite(client, db, p)
        assert r.status_code == 200, r.text
        assert len(sent) == 1, sent
        (email, first_name, business, link), kwargs = sent[0]
        assert email == INVITE_EMAIL
        assert first_name == "דנה"  # first word only, as the backend's _first_name
        assert business == "מחלבת העמק"
        # The link the owner receives IS the link the admin was shown. Two
        # builders for one URL is how they drift.
        assert link == r.json()["invite_url"]
        assert link.endswith(f"/owner-invite/{token}")
        assert kwargs["test_cause"] is False

    def test_resend_queues_it_again_with_the_new_link(self, client, db, monkeypatch):
        sent = self._capture(monkeypatch)
        admin = make_user(db, role="admin")
        p = approved(db)
        invite(client, db, p, admin=admin)
        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert len(sent) == 2, sent
        assert sent[1][0][3] == r.json()["invite_url"]
        assert sent[0][0][3] != sent[1][0][3], "the resend reused the dead link"

    def test_a_test_business_passes_test_cause_so_nothing_is_sent(
        self, client, db, monkeypatch
    ):
        """MEH-2952: a seeded test row must not email a real address. The flag
        is the BUSINESS's — there is no account yet to read one from."""
        sent = self._capture(monkeypatch)
        p = approved(db)
        db.get(Producer, p.id).is_test = True
        db.commit()
        invite(client, db, p)
        assert sent[0][1]["test_cause"] is True

    def test_a_refused_invite_queues_nothing(self, client, db, monkeypatch):
        sent = self._capture(monkeypatch)
        p = make_producer(db, status="draft")
        assert invite(client, db, p)[0].status_code == 409
        assert sent == []
        # The control: this capture DOES fire for an invite that succeeds, so
        # the empty list above is a refusal and not a dead patch point.
        invite(client, db, approved(db))
        assert len(sent) == 1

    def test_the_body_carries_the_locked_copy_and_escapes_the_name(self):
        """The copy is approved verbatim (card <hebrew_copy>), and the HTML part
        interpolates an admin-entered business name into raw markup."""
        from app.services.auth_emails import send_owner_invite_email

        captured: dict = {}

        import app.services.auth_emails as emails

        real = emails.send_email
        emails.send_email = lambda *a, **k: captured.update(args=a, kwargs=k)
        try:
            send_owner_invite_email(
                INVITE_EMAIL,
                "דנה",
                "<script>מחלבה",
                "https://example.com/owner-invite/abc",
            )
        finally:
            emails.send_email = real

        _to, subject, body = captured["args"]
        html = captured["kwargs"]["html"]
        assert subject == "הדף של <script>מחלבה במהמקור מוכן, נשאר רק לאשר"
        assert body.startswith("היי דנה,")
        assert "הקישור תקף ל-7 ימים" in body
        assert "https://example.com/owner-invite/abc" in body
        assert "/privacy" in body
        assert "צוות מהמקור" in body
        # The plain-text part keeps the raw value (text renders no markup); the
        # HTML part must not.
        assert "<script>מחלבה" in body
        assert "<script>מחלבה" not in html
        assert "&lt;script&gt;מחלבה" in html
        assert "https://example.com/owner-invite/abc" in html

    def test_the_greeting_degrades_without_a_first_name(self):
        """An admin can record a business contact with no personal name. «היי ,»
        is the failure this avoids — the same fallback shape
        `onboarding_followup._greeting` uses."""
        from app.services.auth_emails import send_owner_invite_email

        import app.services.auth_emails as emails

        captured: dict = {}
        real = emails.send_email
        emails.send_email = lambda *a, **k: captured.update(args=a)
        try:
            send_owner_invite_email(
                INVITE_EMAIL, "   ", "מחלבה", "https://example.com/x"
            )
        finally:
            emails.send_email = real
        assert captured["args"][2].startswith("היי,\n")
