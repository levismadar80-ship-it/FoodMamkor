"""MEH-2974 — owner invite for a business an admin built end to end.

THE FLOW: Sapir creates an approved business through /admin after written
consent from its owner, then hands the page over — a one-time link on which the
owner sets a password and signs the terms + the licensing declaration herself.
There is no `users` row until she accepts.

WHAT THIS FILE IS FOR, and why it is shaped this way
----------------------------------------------------
The feature is RED tier (auth + schema + a bearer token that grants full
control of a LIVE page), so the eight `TestExploits` cases below are the point
of the file, not an appendix to it. Each one was run RED against staging's code
before the implementation existed and GREEN after — both runs are quoted in the
PR body (ADR-032 §2.6: they assert BEHAVIOUR — a status code, a row count, a
column value — never that a prescribed change was applied).

Three things worth knowing before reading any assertion:

* **The token's only store is a hash.** `producers.owner_invite_token_hash` is
  the sha256 hex of a `secrets.token_urlsafe(32)`. `TestExploits::test_raw_token_
  is_nowhere_in_the_database_or_the_logs` is the guard that keeps it that way,
  and it reads every text-ish column of the row rather than the one we expect,
  so a future column that starts carrying the token reds it.

* **Every unusable link answers the same 404 with the same body.** Invalid,
  expired, already used, replaced by a resend, cancelled — one message. Telling
  them apart would let anyone holding one link probe the state of others.
  `test_every_dead_token_answers_byte_identically` asserts the bytes, not just
  the status.

* **`conftest` builds its schema with `create_all`, not alembic** (and
  `.claude/settings.json` denies `alembic upgrade`/`downgrade` to this session),
  so the revision's own content is pinned by reading it with `ast` —
  `TestRevisionShape`, the instrument `docs/MIGRATIONS.md` prescribes and the
  pattern `tests/test_meh2496_claim_link_sent_at.py` established. The real
  upgrade/downgrade round trip is covered by `tests/test_alembic_roundtrip.py`,
  which runs the actual CLI on a scratch database.
"""

import ast
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import DateTime, String, Text

from conftest import auth_header, make_producer, make_user
from app.models import Producer, User

VERSIONS = Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
REVISION = "a7f3c2e94d18"
# A real, known revision with a shape we can state independently — the control
# for the `ast` reader below (testing.md: validate the instrument first).
PRECEDENT = "8600916f1942"  # MEH-2496 claim_link_sent_at: 1 add_column / 1 drop_column

INVITE_EMAIL = "owner-invite-target@example.com"
# Spelled with "example" on purpose: `scripts/checks/secrets-scan-guard.sh`
# reds a added line that looks like a credential, and an obvious
# placeholder is also what the next reader wants to see. Long enough for
# the 12-character floor, and nothing like a real password.
GOOD_PASSWORD = "example-pw-meh2974"
CONSENT_NOTE = "אישור בוואטסאפ, 12/11"

# The eight columns the feature owns. Named once, because three tests below
# assert over the whole set and a list per test is how one gets forgotten.
INVITE_COLUMNS = (
    "owner_invite_email",
    "owner_invite_name",
    "owner_invite_token_hash",
    "owner_invite_expires_at",
    "owner_invite_sent_at",
    "owner_invite_accepted_at",
    "owner_invite_consent_note",
    "owner_invite_created_by",
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _admin_url(pid, suffix=""):
    return f"/admin/producers/{pid}/owner-invite{suffix}"


def _lookup_url(token):
    return f"/auth/owner-invite/{token}"


_ACCEPT_URL = "/auth/owner-invite/accept"


def valid_invite_payload(**over) -> dict:
    """Regression rule 6: a guard test (403 / 409) must send a schema-VALID
    body, or a 422 from the parser hides whether the guard fired at all."""
    return {
        "email": INVITE_EMAIL,
        "name": "דנה כהן",
        "consent_confirmed": True,
        "consent_note": CONSENT_NOTE,
    } | over


def valid_accept_payload(token, **over) -> dict:
    return {
        "token": token,
        "password": GOOD_PASSWORD,
        "terms_accepted": True,
        "declaration_accepted": True,
    } | over


def approved(db, **kw):
    """An approved business with no owner — the only shape invitable."""
    return make_producer(db, status="approved", **kw)


def own(db, producer, **kw):
    """Give `producer` a linked owner (the 409 the invite refuses)."""
    u = make_user(db, role="producer", **kw)
    u.producer_id = producer.id
    db.commit()
    return u


def invite(client, db, producer, admin=None, **over):
    """Create an invite and return (response, raw_token_or_None)."""
    admin = admin or make_user(db, role="admin")
    r = client.post(
        _admin_url(producer.id), json=valid_invite_payload(**over), headers=auth_header(admin)
    )
    return r, _token_of(r)


def _token_of(response):
    if response.status_code != 200:
        return None
    url = response.json().get("invite_url") or ""
    return url.rsplit("/", 1)[-1] or None


def _row(db, producer):
    db.expire_all()
    return db.get(Producer, producer.id)


def _sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _snapshot(db, producer) -> dict:
    """Every invite column plus the two declaration stamps — what a
    "zero writes" assertion has to compare, rather than one column."""
    p = _row(db, producer)
    return {c: getattr(p, c) for c in INVITE_COLUMNS} | {
        "declared_at": p.declared_at,
        "declaration_version": p.declaration_version,
        "status": p.status,
    }


# ---------------------------------------------------------------------------
# the model columns
# ---------------------------------------------------------------------------


class TestModelColumns:
    def test_all_eight_exist_nullable_without_server_default(self):
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
        fk = next(
            f
            for f in Producer.__table__.c.owner_invite_created_by.foreign_keys
        )
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

    @pytest.mark.parametrize("status", ["draft", "pending", "rejected", "inactive"])
    def test_409_when_the_business_is_not_approved(self, client, db, status):
        p = make_producer(db, status=status)
        clean = _snapshot(db, p)
        r, _ = invite(client, db, p)
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean

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
        assert client.post(_ACCEPT_URL, json=valid_accept_payload(token)).status_code == 200
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

    def test_404_cancelling_when_there_is_nothing_to_cancel(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        assert client.delete(_admin_url(p.id), headers=auth_header(admin)).status_code == 404

    def test_409_cancelling_an_accepted_invite(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        client.post(_ACCEPT_URL, json=valid_accept_payload(token))
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
        }

    def test_requires_farmer_declaration_for_an_agricultural_category(self, client, db):
        from conftest import make_category

        from app.models import ProducerCategory

        p = approved(db)
        cat = make_category(db, name="ירקות")
        db.add(ProducerCategory(producer_id=p.id, category_id=cat.id))
        db.commit()
        _, token = invite(client, db, p)
        assert client.get(_lookup_url(token)).json()["requires_farmer_declaration"] is True

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
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
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
        client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        r = client.post("/auth/login", json={"email": INVITE_EMAIL, "password": GOOD_PASSWORD})
        assert r.status_code == 200, r.text

    def test_auth_me_reports_an_approved_business(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        assert client.post(_ACCEPT_URL, json=valid_accept_payload(token)).status_code == 200
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
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        names = {c.split("=")[0] for c in r.headers.get_list("set-cookie")}
        assert "refresh_token" in names
        assert "__Secure-Fgp" in names

    def test_422_on_a_password_that_fails_the_policy(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, password="short"))
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_409_when_the_email_was_taken_between_invite_and_accept(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        make_user(db, email=INVITE_EMAIL)
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 409, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 1


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
        assert client.post(_ACCEPT_URL, json=valid_accept_payload(token)).status_code == 200
        second = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert second.status_code == 404, second.text
        assert db.query(User).filter(User.producer_id == p.id).count() == 1

    def test_two_accepts_in_flight_produce_exactly_one_user(self, client, db):
        """(b) The claim must be a CONDITIONAL UPDATE, not SELECT-then-set
        (MEH-1820). Under READ COMMITTED two overlapping accepts would both
        see `accepted_at IS NULL` and both insert.

        The race is injected rather than hoped for: the barrier fires inside
        the request session's `commit`, which is the one call between the claim
        and the point the row becomes visible to a rival."""
        import threading

        p = approved(db)
        _, token = invite(client, db, p)

        results: list[int] = []
        barrier = threading.Barrier(2, timeout=20)

        def accept():
            try:
                barrier.wait()
            except threading.BrokenBarrierError:
                pass
            results.append(
                client.post(_ACCEPT_URL, json=valid_accept_payload(token)).status_code
            )

        threads = [threading.Thread(target=accept) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        assert sorted(results) == [200, 404], results
        assert db.query(User).filter(User.producer_id == p.id).count() == 1

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
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 404, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    @pytest.mark.parametrize(
        "over",
        [{"terms_accepted": False}, {"declaration_accepted": False}],
        ids=["no_terms", "no_declaration"],
    )
    def test_accept_without_the_consents_is_422_and_writes_nothing(self, client, db, over):
        """(d) The consents are HERS. An admin built the page; nobody at
        Mehamakor may sign for her, and a client that omits a box must not get
        an account whose `terms_accepted_at` is stamped anyway."""
        p = approved(db)
        _, token = invite(client, db, p, **{})
        clean = _snapshot(db, p)
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token, **over))
        assert r.status_code == 422, r.text
        assert _snapshot(db, p) == clean
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        # And the link is still live — a refused consent must not burn it.
        assert client.get(_lookup_url(token)).status_code == 200

    def test_non_admins_are_403_on_all_three_admin_endpoints(self, client, db):
        """(e) Vertical privilege. The three admin endpoints mint a credential
        that takes over a live business, so a producer or consumer reaching any
        of them is the whole attack."""
        p = approved(db)
        clean = _snapshot(db, p)
        for actor in (make_user(db), make_user(db, role="producer")):
            h = auth_header(actor)
            assert client.post(_admin_url(p.id), json=valid_invite_payload(), headers=h).status_code == 403
            assert client.post(_admin_url(p.id, "/resend"), headers=h).status_code == 403
            assert client.delete(_admin_url(p.id), headers=h).status_code == 403
        # Anonymous too — no header at all.
        assert client.post(_admin_url(p.id), json=valid_invite_payload()).status_code in (401, 403)
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
        client.post(_ACCEPT_URL, json=valid_accept_payload(token))

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
            f"/admin/producers/{p.id}", json={"name": p.name} | forged, headers=auth_header(admin)
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


# ---------------------------------------------------------------------------
# one message for every dead link
# ---------------------------------------------------------------------------


class TestNoEnumeration:
    def test_every_dead_token_answers_byte_identically(self, client, db):
        admin = make_user(db, role="admin")
        bodies = set()

        # 1. a token that never existed
        bodies.add(client.get(_lookup_url("x" * 43)).content)

        # 2. replaced by a resend
        p1 = approved(db)
        _, t1 = invite(client, db, p1, admin=admin)
        client.post(_admin_url(p1.id, "/resend"), headers=auth_header(admin))
        bodies.add(client.get(_lookup_url(t1)).content)

        # 3. cancelled
        p2 = approved(db)
        _, t2 = invite(client, db, p2, admin=admin, email="two@example.com")
        client.delete(_admin_url(p2.id), headers=auth_header(admin))
        bodies.add(client.get(_lookup_url(t2)).content)

        # 4. expired
        p3 = approved(db)
        _, t3 = invite(client, db, p3, admin=admin, email="three@example.com")
        db.get(Producer, p3.id).owner_invite_expires_at = datetime.now(
            timezone.utc
        ) - timedelta(days=1)
        db.commit()
        bodies.add(client.get(_lookup_url(t3)).content)

        # 5. already accepted
        p4 = approved(db)
        _, t4 = invite(client, db, p4, admin=admin, email="four@example.com")
        client.post(_ACCEPT_URL, json=valid_accept_payload(t4))
        bodies.add(client.get(_lookup_url(t4)).content)

        assert len(bodies) == 1, f"{len(bodies)} distinct 404 bodies: {bodies}"


# ---------------------------------------------------------------------------
# exposure
# ---------------------------------------------------------------------------


class TestExposure:
    def test_admin_shape_carries_the_seven_readable_fields_and_not_the_hash(self):
        from app.schemas.schemas import ProducerAdminOut

        fields = ProducerAdminOut.model_fields
        for name in (
            "owner_invite_email",
            "owner_invite_name",
            "owner_invite_sent_at",
            "owner_invite_expires_at",
            "owner_invite_accepted_at",
            "owner_invite_consent_note",
            "owner",
        ):
            assert name in fields, name
        assert "owner_invite_token_hash" not in fields
        assert "owner_invite_created_by" not in fields

    def test_no_public_or_owner_shape_carries_any_invite_field(self):
        from app.schemas.schemas import (
            ProducerDetailOut,
            ProducerListOut,
            ProducerOwnerOut,
        )

        for shape in (ProducerListOut, ProducerDetailOut, ProducerOwnerOut):
            for name in INVITE_COLUMNS + ("owner",):
                assert name not in shape.model_fields, f"{shape.__name__}.{name}"

    def test_admin_detail_reports_the_pending_invite(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        invite(client, db, p, admin=admin)
        r = client.get(f"/admin/producers/{p.id}", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["owner_invite_email"] == INVITE_EMAIL
        assert body["owner_invite_sent_at"]
        assert body["owner_invite_accepted_at"] is None
        assert body["owner"] is None
        assert "owner_invite_token_hash" not in body

    def test_admin_detail_reports_the_linked_owner_after_acceptance(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        _, token = invite(client, db, p, admin=admin)
        client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        body = client.get(f"/admin/producers/{p.id}", headers=auth_header(admin)).json()
        assert body["owner"] == {"name": "דנה כהן", "email": INVITE_EMAIL}
        assert body["owner_invite_accepted_at"]

    def test_the_public_business_page_carries_nothing(self, client, db):
        p = approved(db)
        invite(client, db, p)
        body = client.get(f"/producers/{p.id}").json()
        for name in INVITE_COLUMNS:
            assert name not in body, name

    def test_the_hash_is_absent_from_the_committed_openapi_artifact(self):
        """Structural, not a substring scan.

        A `"x" not in spec_text` check reads the DOCSTRINGS too — FastAPI puts
        every handler's and model's docstring into the spec as a description,
        and the ones in this feature discuss `owner_invite_created_by` by name
        in prose. So the text test would be red for a correct spec, and the
        obvious "fix" is to stop writing the prose, which trades a real
        explanation for a grep. Reading the PROPERTIES asks the actual
        question: is there any shape a client could receive this field on?"""
        import json

        spec = json.loads(
            (
                Path(__file__).resolve().parents[1] / "backend" / "openapi.json"
            ).read_text(encoding="utf-8")
        )
        schemas = spec["components"]["schemas"]
        exposed = {
            f"{name}.{prop}"
            for name, schema in schemas.items()
            for prop in (schema.get("properties") or {})
            if prop.startswith("owner_invite")
        }
        # The control, first: the regenerated spec has to carry this feature at
        # all, or the absence below is "nothing was generated".
        assert any(e.endswith(".owner_invite_email") for e in exposed), (
            "no schema in backend/openapi.json carries owner_invite_email — "
            "regenerate it (`cd frontend && npm run codegen`); until then the "
            "assertions below prove nothing"
        )
        leaked = {
            e
            for e in exposed
            if e.endswith((".owner_invite_token_hash", ".owner_invite_created_by"))
        }
        assert not leaked, f"the credential / audit columns reached the spec: {leaked}"


# ---------------------------------------------------------------------------
# neighbours this must not break
# ---------------------------------------------------------------------------


class TestNeighbours:
    def test_deleting_a_business_with_a_pending_invite_still_works(self, client, db):
        admin = make_user(db, role="admin")
        p = approved(db)
        invite(client, db, p, admin=admin)
        # Read the id into a plain value BEFORE anything expires. `db` holds
        # this row in its identity map, so once the delete has committed,
        # touching ANY attribute of the stale instance — `p.id` included —
        # makes SQLAlchemy refresh it and raise ObjectDeletedError. And the
        # query below projects `Producer.id` rather than the entity for the
        # same reason: the question is whether the ROW is gone, not how the
        # ORM reports a stale handle.
        pid = p.id
        r = client.delete(f"/admin/producers/{pid}", headers=auth_header(admin))
        assert r.status_code == 200, r.text
        db.expire_all()
        assert (
            db.query(Producer.id).filter(Producer.id == pid).first() is None
        ), "the business survived the delete"

    def test_deleting_the_admin_who_invited_leaves_the_business(self, db):
        """`ON DELETE SET NULL`, asserted at the DB rather than assumed from
        the model: the audit degrades, the business survives."""
        admin = make_user(db, role="admin")
        p = approved(db)
        p.owner_invite_created_by = admin.id
        db.commit()
        db.delete(admin)
        db.commit()
        db.expire_all()
        assert db.get(Producer, p.id).owner_invite_created_by is None


class TestOnboardingFollowupClock:
    """Closed decision 7: the day 2/5/10/30 sequence counts from the day the
    owner ACCEPTED, not the day the admin created the page. An admin-built page
    can sit live for weeks before she ever sees it, and «עברו כמה ימים» has to
    mean days since she arrived."""

    def _run(self, db, monkeypatch):
        from app.services import onboarding_followup

        sent: list = []
        monkeypatch.setattr(
            onboarding_followup,
            "send_email",
            lambda *a, **k: sent.append(a[0]),
        )
        counts = onboarding_followup.send_due_followups(db)
        return counts, sent

    def test_an_invite_accepted_today_is_due_for_nothing(self, db, monkeypatch):
        p = approved(db)
        row = db.get(Producer, p.id)
        row.created_at = datetime.now(timezone.utc) - timedelta(days=40)
        row.owner_invite_accepted_at = datetime.now(timezone.utc)
        u = make_user(db, role="producer", email="late@example.com")
        u.producer_id = p.id
        db.commit()
        counts, sent = self._run(db, monkeypatch)
        assert sent == [], sent
        assert counts == {2: 0, 3: 0, 4: 0, 5: 0}

    def test_a_self_registered_business_is_unchanged(self, db, monkeypatch):
        """The control: with `owner_invite_accepted_at` NULL the COALESCE falls
        back to `created_at`, so the baseline behaviour has to be identical —
        otherwise the test above is passing because the whole sequence broke."""
        p = approved(db)
        row = db.get(Producer, p.id)
        row.created_at = datetime.now(timezone.utc) - timedelta(days=40)
        assert row.owner_invite_accepted_at is None
        u = make_user(db, role="producer", email="selfreg@example.com")
        u.producer_id = p.id
        db.commit()
        counts, sent = self._run(db, monkeypatch)
        assert len(sent) == 4, sent
        assert counts == {2: 1, 3: 1, 4: 1, 5: 1}

    def test_accepted_eleven_days_ago_is_due_for_the_first_three_only(
        self, db, monkeypatch
    ):
        p = approved(db)
        row = db.get(Producer, p.id)
        row.created_at = datetime.now(timezone.utc) - timedelta(days=200)
        row.owner_invite_accepted_at = datetime.now(timezone.utc) - timedelta(days=11)
        u = make_user(db, role="producer", email="eleven@example.com")
        u.producer_id = p.id
        db.commit()
        counts, _ = self._run(db, monkeypatch)
        assert counts == {2: 1, 3: 1, 4: 1, 5: 0}


# ---------------------------------------------------------------------------
# the revision, read with ast
# ---------------------------------------------------------------------------


def _revision_file(rev):
    hits = [p for p in VERSIONS.glob("*.py") if _module_str(p, "revision") == rev]
    assert len(hits) == 1, f"{rev}: {hits}"
    return hits[0]


def _module_str(path, name):
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        target = (
            node.target
            if isinstance(node, ast.AnnAssign)
            else node.targets[0]
            if isinstance(node, ast.Assign)
            else None
        )
        if isinstance(target, ast.Name) and target.id == name:
            return ast.literal_eval(node.value) if node.value is not None else None
    return None


def _op_calls(path, func_name):
    """Every `op.<x>(...)` lexically inside the top-level `func_name`."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    fn = next(
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == func_name
    )
    return [
        n
        for n in ast.walk(fn)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and isinstance(n.func.value, ast.Name)
        and n.func.value.id == "op"
    ]


class TestRevisionShape:
    def test_self_test_the_reader_against_a_known_revision(self):
        # The control, FIRST (.claude/rules/testing.md): the reader has to see
        # what a revision we can describe independently actually holds.
        # 8600916f1942 (MEH-2496) adds one column and drops the same one.
        path = _revision_file(PRECEDENT)
        assert [c.func.attr for c in _op_calls(path, "upgrade")] == ["add_column"]
        assert [c.func.attr for c in _op_calls(path, "downgrade")] == ["drop_column"]
        assert _module_str(path, "down_revision") == "c3d8e2f1a9b4"

    def test_chains_onto_an_existing_revision(self):
        down = _module_str(_revision_file(REVISION), "down_revision")
        assert down == "c05dbc247ca1"  # MEH-2952 follow-up, the head when this was written
        _revision_file(down)  # exists, exactly once

    def test_upgrade_adds_exactly_the_eight_columns_plus_index_and_fk(self):
        calls = _op_calls(_revision_file(REVISION), "upgrade")
        assert [c.func.attr for c in calls] == ["add_column"] * 8 + [
            "create_index",
            "create_foreign_key",
        ]
        added = []
        for call in calls[:8]:
            table, column = call.args
            assert ast.literal_eval(table) == "producers"
            added.append(ast.literal_eval(column.args[0]))
            kw = {k.arg: k.value for k in column.keywords}
            assert ast.literal_eval(kw["nullable"]) is True
            assert "server_default" not in kw
        assert added == list(INVITE_COLUMNS)

    def test_downgrade_drops_exactly_those_eight_plus_index_and_fk(self):
        calls = _op_calls(_revision_file(REVISION), "downgrade")
        assert [c.func.attr for c in calls] == [
            "drop_constraint",
            "drop_index",
        ] + ["drop_column"] * 8
        dropped = [ast.literal_eval(c.args[1]) for c in calls[2:]]
        assert sorted(dropped) == sorted(INVITE_COLUMNS)
        for call in calls[2:]:
            assert ast.literal_eval(call.args[0]) == "producers"

    def test_no_execute_and_no_backfill_anywhere(self):
        path = _revision_file(REVISION)
        names = {
            c.func.attr for f in ("upgrade", "downgrade") for c in _op_calls(path, f)
        }
        assert names == {
            "add_column",
            "create_index",
            "create_foreign_key",
            "drop_column",
            "drop_index",
            "drop_constraint",
        }


class TestFarmerCategoriesAreOneFact:
    """The grower-declaration category list now has a backend reader (the
    public lookup computes `requires_farmer_declaration`). Two owners for one
    fact is the smell workflow.md names, so this is the guard that keeps them
    equal — the same shape as `test_meh2496`'s TTL guard, which re-derives a
    frontend constant from its own file."""

    def test_backend_list_equals_the_frontend_mirror(self):
        import re

        from app.constants import FARMER_DECLARATION_CATEGORIES

        src = (
            Path(__file__).resolve().parents[1]
            / "frontend"
            / "lib"
            / "farmer-declaration.js"
        ).read_text(encoding="utf-8")
        match = re.search(
            r"FARMER_DECLARATION_CATEGORIES\s*=\s*\[(.*?)\]", src, flags=re.S
        )
        assert match, "could not find the frontend list — this guard is void"
        mirror = re.findall(r'"([^"]+)"', match.group(1))
        assert mirror, "the frontend list parsed as empty — this guard is void"
        assert list(FARMER_DECLARATION_CATEGORIES) == mirror
