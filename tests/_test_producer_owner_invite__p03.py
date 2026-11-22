"""Part 3 of 3 of `tests/test_producer_owner_invite.py`: TestSuspensionRevokesTheInvite, TestResendSurvivesAPoisonedAddress, TestInviteWithoutAnAddress, TestAcceptPublishes, TestTokenNeverReachesSentry, TestNoEnumeration, TestExposure, TestNeighbours, TestOnboardingFollowupClock, TestRevisionShape, TestFarmerCategoriesAreOneFact, test_owner_invite_is_a_reserved_slug, TestGrowerDeclarationOnAccept.

Moved here verbatim by the MEH-3540 mechanical split. Not collected
directly (no `test_` prefix): `tests/test_producer_owner_invite.py` imports these tests, so
their node ids stay `tests/test_producer_owner_invite.py::...`. Run them with
`pytest tests/test_producer_owner_invite.py` (add `-k <ClassName>` to narrow).
"""

from app.models import Producer
from app.models import User
from app.routers import producer_owner_invite as poi
from conftest import auth_header
from conftest import israel_days_ago
from conftest import make_producer
from conftest import make_user
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from pathlib import Path
from unittest import mock
import ast
from _test_producer_owner_invite__common import CONSENT_NOTE  # noqa: F401
from _test_producer_owner_invite__common import INVITE_COLUMNS  # noqa: F401
from _test_producer_owner_invite__common import INVITE_EMAIL  # noqa: F401
from _test_producer_owner_invite__common import PRECEDENT  # noqa: F401
from _test_producer_owner_invite__common import REVISION  # noqa: F401
from _test_producer_owner_invite__common import _ACCEPT_URL  # noqa: F401
from _test_producer_owner_invite__common import _CODE_URL  # noqa: F401
from _test_producer_owner_invite__common import _PHOTO  # noqa: F401
from _test_producer_owner_invite__common import _admin_url  # noqa: F401
from _test_producer_owner_invite__common import _lookup_url  # noqa: F401
from _test_producer_owner_invite__common import _module_str  # noqa: F401
from _test_producer_owner_invite__common import _op_calls  # noqa: F401
from _test_producer_owner_invite__common import _revision_file  # noqa: F401
from _test_producer_owner_invite__common import _row  # noqa: F401
from _test_producer_owner_invite__common import _snapshot  # noqa: F401
from _test_producer_owner_invite__common import _token_of  # noqa: F401
from _test_producer_owner_invite__common import accept_invite  # noqa: F401
from _test_producer_owner_invite__common import approved  # noqa: F401
from _test_producer_owner_invite__common import arm_code  # noqa: F401
from _test_producer_owner_invite__common import invite  # noqa: F401
from _test_producer_owner_invite__common import valid_accept_payload  # noqa: F401

class TestSuspensionRevokesTheInvite:
    """Suspending a live page revokes any outstanding invite on it.

    Without this, `inactive` means two things the row cannot tell apart —
    «hidden while being built» and «taken down» — and acceptance publishes the
    first. An owner sitting on a week-old link could then put a suspended page
    back on the site herself.
    """

    def _suspend(self, client, db, producer, admin):
        r = client.post(
            f"/admin/producers/{producer.id}/toggle-status", headers=auth_header(admin)
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "inactive", r.text

    def test_hiding_an_approved_business_kills_its_outstanding_link(
        self, client, db
    ):
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        arm_code(client, token)
        assert client.get(_lookup_url(token)).status_code == 200

        self._suspend(client, db, p, admin)

        assert client.get(_lookup_url(token)).status_code == 404
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 404, r.text
        assert _row(db, p).status == "inactive", "a suspended page came back"
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0
        row = _row(db, p)
        assert row.owner_invite_code_hash is None

    def test_the_record_that_an_invite_happened_survives(self, client, db):
        """The token dies; the audit does not. `created_by`, the consent note
        and the address are what say an invite WAS sent, and a suspension is
        not a reason to forget it."""
        p = approved(db)
        admin = make_user(db, role="admin")
        invite(client, db, p, admin=admin)
        self._suspend(client, db, p, admin)
        row = _row(db, p)
        assert row.owner_invite_consent_note == CONSENT_NOTE
        assert row.owner_invite_created_by == admin.id
        assert row.owner_invite_sent_at is not None

    def test_an_accepted_invite_is_left_alone(self, client, db):
        """`owner_invite_accepted_at` is the record that it already happened,
        and the business has a real owner now. Clearing anything there would
        rewrite history, and there is no live token to revoke anyway."""
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        assert accept_invite(client, token).status_code == 200
        accepted_at = _row(db, p).owner_invite_accepted_at

        self._suspend(client, db, p, admin)
        assert _row(db, p).owner_invite_accepted_at == accepted_at

    def test_rejecting_revokes_the_link_even_after_a_re_approval(self, client, db):
        """`rejected` is not invitable, so the link is dead WHILE rejected
        whatever the row holds. What matters is the way back: a page rejected
        for cause and approved again within the link's week must not come back
        with the old link alive. So the assertion is made after re-approval —
        made while rejected it would pass with no revocation at all."""
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        arm_code(client, token)

        r = client.post(
            f"/admin/producers/{p.id}/reject",
            json={"preset_key": "other", "reason": "בדיקת ביטול הזמנה"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        row = db.get(Producer, p.id)
        db.refresh(row)
        assert row.status == "rejected"
        row.status = "approved"
        db.commit()

        assert client.get(_lookup_url(token)).status_code == 404
        r = client.post(_ACCEPT_URL, json=valid_accept_payload(token))
        assert r.status_code == 404, r.text
        assert db.query(User).filter(User.email == INVITE_EMAIL).count() == 0

    def test_rejecting_keeps_an_accepted_invite(self, client, db):
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        assert accept_invite(client, token).status_code == 200
        accepted_at = _row(db, p).owner_invite_accepted_at
        r = client.post(
            f"/admin/producers/{p.id}/reject",
            json={"preset_key": "other", "reason": "בדיקת ביטול הזמנה"},
            headers=auth_header(admin),
        )
        assert r.status_code == 200, r.text
        assert _row(db, p).owner_invite_accepted_at == accepted_at

    def test_hiding_a_business_with_no_invite_is_untouched(self, client, db):
        """The control: the toggle's own behaviour must not depend on this."""
        p = approved(db)
        admin = make_user(db, role="admin")
        clean = _snapshot(db, p)
        self._suspend(client, db, p, admin)
        after = _snapshot(db, p)
        assert {k: v for k, v in after.items() if k != "status"} == {
            k: v for k, v in clean.items() if k != "status"
        }


class TestResendSurvivesAPoisonedAddress:
    """A link holder may write any address onto the row through the code
    endpoint. Refusing to resend on a taken one handed her a way to strand the
    admin's «שליחה מחדש» button for good."""

    def test_a_resend_drops_a_taken_address_instead_of_refusing(self, client, db):
        p = approved(db)
        admin = make_user(db, role="admin")
        _, token = invite(client, db, p, admin=admin)
        # The poisoning, through the real public endpoint — no shortcut.
        make_user(db, email="someone@example.com")
        client.post(_CODE_URL, json={"token": token, "email": "someone@example.com"})
        assert _row(db, p).owner_invite_email == "someone@example.com"

        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        # The new link is live and carries no address — which is a valid v3
        # invite, and is what the owner then types her own address into.
        new_token = _token_of(r)
        assert client.get(_lookup_url(new_token)).json()["email"] is None
        assert _row(db, p).owner_invite_email is None
        assert r.json()["email"] is None

    def test_a_resend_keeps_an_address_that_is_still_free(self, client, db):
        """The discriminating half: dropping it unconditionally would also be
        green against the test above."""
        p = approved(db)
        admin = make_user(db, role="admin")
        invite(client, db, p, admin=admin)
        r = client.post(_admin_url(p.id, "/resend"), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        assert r.json()["email"] == INVITE_EMAIL
        assert _row(db, p).owner_invite_email == INVITE_EMAIL


class TestInviteWithoutAnAddress:
    """v3: the admin may hand the link over herself — WhatsApp, a phone call —
    and never type an address. The address then comes from the owner, on the
    page, and is proved with a code."""

    def test_create_without_an_email_sends_nothing_and_still_returns_a_link(
        self, client, db
    ):
        p = approved(db)
        sent = []
        with mock.patch.object(
            poi, "send_owner_invite_email", side_effect=lambda *a, **k: sent.append(a)
        ):
            r, token = invite(client, db, p, email=None)
        assert r.status_code == 200, r.text
        assert token
        assert sent == [], "an invite with no address must not mail anyone"
        assert r.json()["email"] is None
        assert _row(db, p).owner_invite_email is None

    def test_the_page_renders_an_empty_editable_address(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p, email=None)
        body = client.get(_lookup_url(token)).json()
        # `None`, not "" and not absent: the page branches on it to decide
        # between an empty field and a pre-filled one.
        assert body["email"] is None

    def test_she_types_her_own_address_and_accepts_on_it(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p, email=None)
        hers = "she-typed-this@example.com"
        assert accept_invite(client, token, email=hers).status_code == 200
        user = db.query(User).filter(User.email == hers).one()
        assert user.producer_id == p.id
        assert _row(db, p).owner_invite_email == hers


class TestAcceptPublishes:
    def test_a_hidden_page_goes_live_and_is_announced(self, client, db, monkeypatch):
        """The page becoming visible is the owner's own act, and the search
        engines hear about it at that moment — not before, or a rolled-back
        transaction would have announced a page still hidden."""
        pinged = []
        monkeypatch.setattr(
            poi.indexnow, "notify", lambda urls: pinged.append(list(urls))
        )
        p = make_producer(db, status="inactive", images=_PHOTO)
        # The slug is what the announced URL is built from, so it is set
        # explicitly rather than left to the factory — the assertion below
        # names it.
        db.get(Producer, p.id).slug = "hidden-dairy"
        db.commit()
        _, token = invite(client, db, p)
        assert accept_invite(client, token).status_code == 200
        assert _row(db, p).status == "approved"
        assert pinged, "a published page was not announced"
        assert any("hidden-dairy" in u for u in pinged[0])

    def test_an_already_approved_page_is_not_announced(self, client, db, monkeypatch):
        """Nothing about its URL changed. Announcing it would claim a change
        that did not happen — and this is the assertion that fails if the
        publish branch is made unconditional."""
        pinged = []
        monkeypatch.setattr(
            poi.indexnow, "notify", lambda urls: pinged.append(list(urls))
        )
        p = approved(db)
        _, token = invite(client, db, p)
        assert accept_invite(client, token).status_code == 200
        assert pinged == []

    def test_the_admin_is_told_either_way_and_which_one_it_was(
        self, client, db, monkeypatch
    ):
        """The admin started this loop and nothing else closes it for her."""
        calls = []
        monkeypatch.setattr(
            poi,
            "notify_admin_owner_invite_accepted",
            lambda *a, **k: calls.append((a, k)),
        )
        hidden = make_producer(db, status="inactive", images=_PHOTO)
        _, t1 = invite(client, db, hidden)
        assert accept_invite(client, t1).status_code == 200

        live = approved(db)
        _, t2 = invite(client, db, live, email="second@example.com")
        assert accept_invite(client, t2, email="second@example.com").status_code == 200

        assert len(calls) == 2, calls
        # The third positional argument is `published` — the one thing that
        # differs between the two outcomes.
        assert [c[0][2] for c in calls] == [True, False]

class TestTokenNeverReachesSentry:
    """The token travels in the path (the card's shape), so the one thing we
    DO control is what we hand to a third-party processor.

    `middleware.py` binds the raw URL into Sentry's `route` tag and
    `request_info.url`, and `sentry.py::before_send` does no URL redaction —
    so before MEH-2974 any captured exception or sampled trace on one of the
    three token-bearing routes shipped a live credential. `producer_claim.py`
    is the written decision this restores server-side: it moved its preview to
    a POST specifically to keep the token out of "Railway access logs and the
    Sentry request context".
    """

    def test_the_owner_invite_path_is_redacted(self):
        from app.utils.pii import redact_url_tokens

        # The SHAPE of a token_urlsafe(32) — 43 url-safe characters. Spelled
        # with "example" so secrets-scan-guard.sh reads it as a placeholder;
        # only the length and the character class matter here.
        token = "example-token-nn2lsMmYGRO8vlYIdErxoU8xxxxxxx"
        for raw, expected in (
            (f"/auth/owner-invite/{token}", "/auth/owner-invite/[token]"),
            (f"/he/owner-invite/{token}", "/he/owner-invite/[token]"),
            (
                f"https://mehamakor.co.il/auth/owner-invite/{token}?x=1",
                "https://mehamakor.co.il/auth/owner-invite/[token]?x=1",
            ),
        ):
            assert redact_url_tokens(raw) == expected

    def test_the_two_sibling_shapes_are_covered_too(self):
        """One redactor, three shapes — a per-feature scrubber is how the next
        token-in-a-path ships unredacted."""
        from app.utils.pii import redact_url_tokens

        jwt = "eyJhbGciOiJIUzI1NiJ9.eyJleGFtcGxlIjoxfQ.example-sig"
        reg = "example-registration-token-0nP2qS4uW6yA8bxxxxx"
        assert redact_url_tokens(f"/claim/{jwt}") == "/claim/[token]"
        assert redact_url_tokens(f"/registrations/{reg}") == "/registrations/[token]"
        assert redact_url_tokens(f"/registration/{reg}") == "/registration/[token]"

    def test_it_leaves_the_routes_own_build_artifacts_alone(self):
        """The 40-character floor is what keeps a stack frame pointing at its
        source. A redactor that swallowed these would make every Sentry frame
        from the route unattributable — the cost the floor buys."""
        from app.utils.pii import redact_url_tokens

        for frame in (
            "/_next/static/chunks/app/[locale]/owner-invite/[token]/page-8f21c0.js",
            "/owner-invite/OwnerInviteClient.jsx",
            "/claim/ClaimClient.jsx",
            "/health",
        ):
            assert redact_url_tokens(frame) == frame

    def test_before_send_scrubs_the_url_the_sdk_fills_in_itself(self):
        """The half `middleware.py` cannot reach.

        We redact the two fields we SET — the `route` tag and the
        `request_info` context. `FastApiIntegration` separately populates
        `event["request"]["url"]` from the raw ASGI scope, which no code of
        ours touches, so a path-carried token could still leave beside the
        redacted copy. Raised as UNVERIFIED by the fresh reviewer on this PR
        (the claim is about SDK internals); closed here without having to
        settle it, because the scrub costs one pass whether or not the field
        is ever populated.
        """
        from app.sentry import _scrub_event_urls

        token = "T" * 45
        event = {
            "request": {"url": f"https://mehamakor.co.il/auth/owner-invite/{token}"},
            "transaction": f"/auth/owner-invite/{token}",
        }
        _scrub_event_urls(event)
        assert token not in event["request"]["url"], event["request"]["url"]
        assert token not in event["transaction"], event["transaction"]
        # It redacts, it does not blank: an event with no URL is a worse
        # report than one with a redacted URL.
        assert "/auth/owner-invite/" in event["request"]["url"]

    def test_the_scrubber_never_breaks_reporting(self):
        """`before_send` fails open (sentry.py TRAP 1), and a scrubber that
        raises is worse than the leak it prevents. Every shape an event can
        arrive in, including the ones that are not dicts at all."""
        from app.sentry import _scrub_event_urls

        for event in ({}, {"request": None}, {"request": {"url": 7}}, {"transaction": []}):
            _scrub_event_urls(event)  # must not raise

    def test_the_middleware_binds_the_redacted_form(self, client, db):
        """The unit above proves the function; this proves it is WIRED. A
        redactor nothing calls is the shape this whole class exists to stop."""
        import app.middleware as mw

        p = approved(db)
        _, token = invite(client, db, p)
        bound: list = []
        real = mw.redact_url_tokens
        mw.redact_url_tokens = lambda v: bound.append(v) or real(v)
        try:
            client.get(_lookup_url(token))
        finally:
            mw.redact_url_tokens = real

        assert bound, "middleware never called the redactor — it is not wired"
        for value in bound:
            if isinstance(value, str) and "owner-invite" in value:
                assert token not in real(value), (
                    f"the redactor was called but left the token in: {value}"
                )
                break
        else:
            raise AssertionError("no owner-invite URL reached the redactor")


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
        accept_invite(client, t4, email="four@example.com")
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
        accept_invite(client, token)
        body = client.get(f"/admin/producers/{p.id}", headers=auth_header(admin)).json()
        owner = db.query(User).filter(User.producer_id == p.id).one()
        # MEH-3256 D9: the id is what «ניתוק בעלים» sends back as
        # expected_owner_user_id.
        assert body["owner"] == {
            "id": str(owner.id),
            "name": "דנה כהן",
            "email": INVITE_EMAIL,
        }
        assert body["owner_invite_accepted_at"]

    def test_the_public_business_page_carries_nothing(self, client, db):
        p = approved(db)
        invite(client, db, p)
        body = client.get(f"/producers/{p.id}").json()
        for name in INVITE_COLUMNS:
            assert name not in body, name

    def test_a_hidden_business_is_on_no_public_endpoint_until_she_accepts(
        self, client, db
    ):
        """(v3, exploit case m) The page an admin built is hidden until its
        owner approves it, and «hidden» has to mean hidden everywhere — not
        just absent from the listing she happens to look at.

        Asserted BEFORE and AFTER the acceptance, in one test, because only
        the pair discriminates: a page that is missing from both would satisfy
        the before-assertion while being broken, and one present in both would
        satisfy the after-assertion while leaking.
        """
        p = make_producer(db, status="inactive", images=_PHOTO)
        _, token = invite(client, db, p)

        detail = client.get(f"/producers/{p.id}")
        assert detail.status_code == 404, detail.text
        listing = client.get("/producers").json()
        rows = listing["items"] if isinstance(listing, dict) else listing
        assert all(r["id"] != str(p.id) for r in rows), "a hidden business was listed"

        assert accept_invite(client, token).status_code == 200

        assert client.get(f"/producers/{p.id}").status_code == 200
        listing = client.get("/producers").json()
        rows = listing["items"] if isinstance(listing, dict) else listing
        assert any(r["id"] == str(p.id) for r in rows), (
            "the page did not appear after the acceptance that published it"
        )

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
        assert db.query(Producer.id).filter(Producer.id == pid).first() is None, (
            "the business survived the delete"
        )

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
        # `israel_days_ago`, never `now() - timedelta(days=N)`: the code counts
        # days in Asia/Jerusalem, and N x 24 h is N Israel days only while the
        # UTC offset is the same at both ends (testing.md, MEH-2290/MEH-2380).
        # The 11-day case below sits exactly on a step boundary, which is the
        # one that flips the week after a DST switch.
        p = approved(db)
        row = db.get(Producer, p.id)
        row.created_at = israel_days_ago(40)
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
        row.created_at = israel_days_ago(40)
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
        row.created_at = israel_days_ago(200)
        row.owner_invite_accepted_at = israel_days_ago(11)
        u = make_user(db, role="producer", email="eleven@example.com")
        u.producer_id = p.id
        db.commit()
        counts, _ = self._run(db, monkeypatch)
        assert counts == {2: 1, 3: 1, 4: 1, 5: 0}


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
        assert (
            down == "c05dbc247ca1"
        )  # MEH-2952 follow-up, the head when this was written
        _revision_file(down)  # exists, exactly once

    def test_upgrade_adds_exactly_the_eleven_columns_plus_index_and_fk(self):
        # Derived from INVITE_COLUMNS, never written out as a number: the
        # count and the names then cannot disagree, and adding a column to the
        # feature without adding it to the revision reds here.
        n = len(INVITE_COLUMNS)
        calls = _op_calls(_revision_file(REVISION), "upgrade")
        assert [c.func.attr for c in calls] == ["add_column"] * n + [
            "create_index",
            "create_foreign_key",
        ]
        added = []
        for call in calls[:n]:
            table, column = call.args
            assert ast.literal_eval(table) == "producers"
            added.append(ast.literal_eval(column.args[0]))
            kw = {k.arg: k.value for k in column.keywords}
            assert ast.literal_eval(kw["nullable"]) is True
            assert "server_default" not in kw
        assert added == list(INVITE_COLUMNS)

    def test_downgrade_drops_exactly_those_eleven_plus_index_and_fk(self):
        calls = _op_calls(_revision_file(REVISION), "downgrade")
        assert [c.func.attr for c in calls] == [
            "drop_constraint",
            "drop_index",
        ] + ["drop_column"] * len(INVITE_COLUMNS)
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


def test_owner_invite_is_a_reserved_slug():
    """`/owner-invite/<token>` is a route. A business whose slug is
    `owner-invite` would shadow it on the unprefixed locale — the frontend
    list already refuses it; this is the backend half."""
    from app.slug_utils import is_reserved

    assert is_reserved("owner-invite")


class TestGrowerDeclarationOnAccept:
    """MEH-3137: the invite page shows the grower box when the lookup says
    `requires_farmer_declaration`. The server now requires and records it
    apart from the licensing declaration, as registration does (MEH-2923)."""

    def _veg_invite(self, client, db, name="ירקות"):
        from conftest import make_category

        from app.models import ProducerCategory

        p = approved(db)
        cat = make_category(db, name=name)
        db.add(ProducerCategory(producer_id=p.id, category_id=cat.id))
        db.commit()
        _, token = invite(client, db, p)
        return p, token

    def test_veg_without_the_grower_flag_is_422_and_the_link_survives(self, client, db):
        p, token = self._veg_invite(client, db)
        r = accept_invite(client, token)
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == "יש לאשר את הצהרת המגדל כדי להמשיך"
        row = _row(db, p)
        assert row.owner_invite_accepted_at is None
        assert row.farmer_declared_at is None

    def test_fruit_with_the_flag_stamps_the_grower_columns(self, client, db):
        from app.constants import FARMER_DECLARATION_VERSION

        p, token = self._veg_invite(client, db, name="פירות")
        r = accept_invite(client, token, farmer_declaration_accepted=True)
        assert r.status_code == 200, r.text
        row = _row(db, p)
        assert row.farmer_declared_at is not None
        assert row.farmer_declaration_version == FARMER_DECLARATION_VERSION

    def test_non_grower_business_stamps_nothing(self, client, db):
        p = approved(db)
        _, token = invite(client, db, p)
        assert accept_invite(client, token).status_code == 200
        assert _row(db, p).farmer_declared_at is None

    def test_lookup_does_not_ask_a_business_already_declared(self, client, db):
        """The accept route ignores the flag once the line is recorded, so the
        lookup must not show the box either (reviewer finding, MEH-3137)."""
        from datetime import datetime, timezone

        p, token = self._veg_invite(client, db)
        assert client.get(_lookup_url(token)).json()["requires_farmer_declaration"] is True
        row = _row(db, p)
        row.farmer_declared_at = datetime.now(timezone.utc)
        db.commit()
        assert client.get(_lookup_url(token)).json()["requires_farmer_declaration"] is False
