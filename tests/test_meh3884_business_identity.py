"""MEH-3884 — one duplicate-business check for signup and the admin.

Farmerim, 26/11: a draft owned by order@farmerim.com existed; a staff member
signed up with another email and the same phone, and a second business was
opened. Nothing warned her and nothing told the admin, because every check
then in place looked only at live pages, at names, or at ownerless drafts.
"""

import pytest

from app.models import Producer
from app.services.business_identity import (
    EMAIL,
    INSTAGRAM,
    PHONE,
    WEBSITE,
    identity_of,
    identity_reasons,
    mask_email,
)
from conftest import (
    auth_header,
    make_producer,
    make_submit_ready_producer,
    make_user,
    valid_producer_register_payload,
)

FARMERIM_PHONE = "052-555-1234"


def _owned_draft(
    db, *, phone=FARMERIM_PHONE, email="order@farmerim.com", name="Farmerim"
):
    """The Farmerim state: a draft WITH an owner (MEH-3865 never looked at it)."""
    biz = make_producer(db, name=name, status="draft")
    biz.phone = phone
    owner = make_user(db, email=email, role="producer")
    owner.producer_id = biz.id
    owner.is_producer = True
    db.commit()
    return biz, owner


def _check(client, phone, headers=None):
    r = client.post(
        "/producer-identity-check", json={"phone": phone}, headers=headers or {}
    )
    assert r.status_code == 200, r.text
    return r.json()["match"]


@pytest.fixture
def admin_alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.services.draft_merge_emails.notify_admin_identity_matches",
        lambda new, matches, moment, test_cause=False: sent.extend(
            (new, m.name, m.owner_email, m.reasons, moment) for m in matches
        ),
    )
    return sent


# --- 1. the rule ---------------------------------------------------------------


class TestRule:
    def test_phone_in_two_notations_is_one_business(self):
        a = identity_of(phones=["052-555-1234"])
        b = identity_of(phones=["+972525551234"])
        assert identity_reasons(a, b) == [PHONE]

    def test_any_of_several_phones_and_emails_matches(self):
        a = identity_of(phones=[None, "0525551234"], emails=["Order@Farmerim.com "])
        b = identity_of(
            phones=["0509999999", "052 555 1234"], emails=["order@farmerim.com"]
        )
        assert identity_reasons(a, b) == [PHONE, EMAIL]

    def test_links_match_on_the_account_not_the_url_shape(self):
        a = identity_of(
            instagram="https://instagram.com/Farmerim/",
            website="https://www.farmerim.com/shop",
        )
        b = identity_of(instagram="@farmerim", website="farmerim.com")
        assert identity_reasons(a, b) == [INSTAGRAM, WEBSITE]

    def test_dummy_phone_and_blanks_never_match(self):
        assert (
            identity_reasons(
                identity_of(phones=["050-0000000"]), identity_of(phones=["0500000000"])
            )
            == []
        )
        assert identity_reasons(identity_of(), identity_of()) == []

    def test_mask_keeps_first_letter_and_domain(self):
        assert mask_email("Order@Farmerim.com") == "o***@farmerim.com"
        assert mask_email("ab@x.com") == "***@x.com", (
            "a short address is not shown whole"
        )
        assert mask_email(None) is None
        assert mask_email("not-an-email") is None


# --- 2. the signup check -------------------------------------------------------


class TestSignupCheck:
    def test_farmerim_staff_phone_finds_the_owned_draft(self, client, db):
        _owned_draft(db)
        assert _check(client, "0525551234") == {"owner_email": "o***@farmerim.com"}

    def test_no_business_with_that_phone_no_match(self, client, db):
        _owned_draft(db)
        assert _check(client, "0521112233") is None

    def test_an_ownerless_page_matches_without_an_email(self, client, db):
        biz = make_producer(db, name="טיוטה מוכנה", status="draft")
        biz.phone = FARMERIM_PHONE
        db.commit()
        assert _check(client, FARMERIM_PHONE) == {"owner_email": None}

    def test_every_status_counts(self, client, db):
        for status in ("approved", "pending", "rejected"):
            db.query(Producer).delete()
            db.commit()
            biz = make_producer(db, name=f"עסק {status}", status=status)
            biz.phone = FARMERIM_PHONE
            db.commit()
            assert _check(client, FARMERIM_PHONE) == {"owner_email": None}, status

    def test_owned_match_is_preferred_over_ownerless(self, client, db):
        ownerless = make_producer(db, name="א טיוטה", status="draft")
        ownerless.phone = FARMERIM_PHONE
        db.commit()
        _owned_draft(db)
        assert _check(client, FARMERIM_PHONE) == {"owner_email": "o***@farmerim.com"}

    def test_the_owners_private_phone_never_counts_here(self, client, db):
        """Rule-5a review + /security-review 26/11: an owner's account phone
        is never published, and any visitor can sign up for a token, so this
        route must not turn it into a phone → account lookup at all."""
        biz, owner = _owned_draft(db, phone=None)
        owner.phone = FARMERIM_PHONE
        db.commit()
        assert _check(client, FARMERIM_PHONE) is None
        caller = make_user(db, email="tamar@example.com")
        caller.email_verified = True
        db.commit()
        assert _check(client, FARMERIM_PHONE, headers=auth_header(caller)) is None

    def test_an_unverified_own_email_is_not_used(self, client, db):
        """/security-review 26/11: signing up with someone else's address
        costs nothing until it is verified."""
        biz = make_producer(db, name="Farmerim", status="approved")
        biz.contact_email = "farmerimservice@example.com"
        db.commit()
        caller = make_user(db, email="farmerimservice@example.com")
        caller.email_verified = False
        db.commit()
        assert _check(client, None, headers=auth_header(caller)) is None

    def test_an_unverified_own_phone_is_not_used(self, client, db):
        _owned_draft(db)
        caller = make_user(db, email="tamar@example.com")
        caller.phone = FARMERIM_PHONE
        caller.phone_verified_at = None
        db.commit()
        assert _check(client, None, headers=auth_header(caller)) is None

    def test_a_verified_own_phone_is_used(self, client, db):
        from datetime import datetime, timezone

        _owned_draft(db)
        caller = make_user(db, email="tamar@example.com")
        caller.phone = FARMERIM_PHONE
        caller.phone_verified_at = datetime.now(timezone.utc)
        db.commit()
        assert _check(client, None, headers=auth_header(caller)) == {
            "owner_email": "o***@farmerim.com"
        }

    def test_the_pages_second_phone_counts(self, client, db):
        """Farmerim 26/11: Tamar's phone was the page's secondary phone."""
        biz, _ = _owned_draft(db, phone="0521112233")
        biz.secondary_phone = "054-777-8899"
        db.commit()
        assert _check(client, "0547778899") == {"owner_email": "o***@farmerim.com"}

    def test_a_staff_member_signing_in_is_matched_to_her_business(self, client, db):
        from datetime import datetime, timedelta, timezone

        from app.models.producer_staff import ProducerStaff

        biz, _ = _owned_draft(db, phone="0521112233")
        db.add(
            ProducerStaff(
                producer_id=biz.id,
                invited_email="tamar@example.com",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
        )
        db.commit()
        tamar = make_user(db, email="tamar@example.com")
        tamar.email_verified = True
        db.commit()
        assert _check(client, None, headers=auth_header(tamar)) == {
            "owner_email": "o***@farmerim.com"
        }

    def test_anonymous_email_in_the_body_is_never_read(self, client, db):
        """MEH-328: no anonymous «is this email an account?» oracle."""
        _owned_draft(db)
        r = client.post(
            "/producer-identity-check",
            json={"phone": None, "email": "order@farmerim.com"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["match"] is None

    def test_signed_in_users_own_email_is_checked(self, client, db):
        biz = make_producer(db, name="Farmerim", status="approved")
        biz.contact_email = "farmerimservice@example.com"
        db.commit()
        staff = make_user(db, email="farmerimservice@example.com")
        staff.email_verified = True
        db.commit()
        assert _check(client, None, headers=auth_header(staff)) == {"owner_email": None}

    def test_a_test_business_is_not_shown_to_a_real_signup(self, client, db):
        biz, _ = _owned_draft(db)
        biz.is_test = True
        db.commit()
        assert _check(client, FARMERIM_PHONE) is None

    def test_a_test_account_does_not_see_a_real_business(self, client, db):
        _owned_draft(db)
        tester = make_user(db, email="qa@example.com")
        tester.is_test = True
        db.commit()
        assert _check(client, FARMERIM_PHONE, headers=auth_header(tester)) is None

    def test_an_expired_staff_invite_no_longer_counts(self, client, db):
        from datetime import datetime, timedelta, timezone

        from app.models.producer_staff import ProducerStaff

        biz, _ = _owned_draft(db, phone="0521112233")
        db.add(
            ProducerStaff(
                producer_id=biz.id,
                invited_email="tamar@example.com",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        db.commit()
        tamar = make_user(db, email="tamar@example.com")
        assert _check(client, None, headers=auth_header(tamar)) is None


# --- 3. the admin hears about it ----------------------------------------------


class TestAdminAlert:
    def test_signup_with_an_existing_phone_still_creates_and_alerts(
        self, client, db, admin_alerts
    ):
        _owned_draft(db)
        payload = valid_producer_register_payload()
        payload.update(
            email="farmerimservice@example.com",
            phone="0525551234",
            producer_name="פרמרים",
        )
        r = client.post("/auth/register/producer", json=payload)
        assert r.status_code == 200, r.text
        assert admin_alerts == [
            ("פרמרים", "Farmerim", "order@farmerim.com", [PHONE], "signup")
        ]

    def test_upgrade_path_alerts_on_the_users_own_email(self, client, db, admin_alerts):
        biz = make_producer(db, name="Farmerim", status="approved")
        biz.contact_email = "farmerimservice@example.com"
        db.commit()
        staff = make_user(db, email="farmerimservice@example.com")
        payload = valid_producer_register_payload()
        for k in ("email", "name", "password"):
            payload.pop(k)
        payload["phone"] = "0521112233"
        payload["producer_name"] = "פרמרים"
        r = client.post(
            "/auth/register/producer", json=payload, headers=auth_header(staff)
        )
        assert r.status_code == 200, r.text
        assert admin_alerts == [("פרמרים", "Farmerim", None, [EMAIL], "signup")]

    def test_no_alert_for_a_new_business(self, client, db, admin_alerts):
        _owned_draft(db)
        payload = valid_producer_register_payload()
        payload["phone"] = "0521112233"
        r = client.post("/auth/register/producer", json=payload)
        assert r.status_code == 200, r.text
        assert admin_alerts == []

    def test_submit_alerts_on_an_owned_twin_and_not_twice_on_a_draft_twin(
        self, client, db, admin_alerts, monkeypatch
    ):
        draft_twin_calls = []
        monkeypatch.setattr(
            "app.routers.producer_me_review.notify_admin_draft_twin",
            lambda *a, **k: draft_twin_calls.append(a),
        )
        _owned_draft(db, name="Farmerim")
        ownerless = make_producer(db, name="טיוטה מוכנה", status="draft")
        ownerless.phone = FARMERIM_PHONE
        mine, me = make_submit_ready_producer(db, name="פרמרים")
        mine.phone = FARMERIM_PHONE
        db.commit()

        r = client.post("/producers/me/submit-for-review", headers=auth_header(me))
        assert r.status_code == 200, r.text
        assert len(draft_twin_calls) == 1, (
            "the ownerless draft keeps its MEH-3865 email"
        )
        assert admin_alerts == [
            ("פרמרים", "Farmerim", "order@farmerim.com", [PHONE], "submit")
        ]

    def test_a_failed_lookup_never_fails_the_signup(self, client, db, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("db hiccup")

        monkeypatch.setattr("app.services.business_identity.matches_for_producer", boom)
        _owned_draft(db)
        payload = valid_producer_register_payload()
        payload["phone"] = "0525551234"
        r = client.post("/auth/register/producer", json=payload)
        assert r.status_code == 200, r.text
        assert (
            db.query(Producer).filter(Producer.name == payload["producer_name"]).count()
            == 1
        )


# --- 4. the admin email itself -------------------------------------------------


class TestAdminEmail:
    def _send(self, monkeypatch, matches, **kw):
        from app.services import draft_merge_emails as mod

        sent = []
        monkeypatch.setattr(mod.settings, "admin_email", "admin@example.com")
        monkeypatch.setattr(
            mod,
            "send_email",
            lambda to, subject, body, test_cause=False: sent.append(
                (to, subject, body)
            ),
        )
        mod.notify_admin_identity_matches("פרמרים", matches, "signup", **kw)
        return sent

    def _match(self, i, owner="order@farmerim.com"):
        from uuid import uuid4

        from app.services.business_identity import IdentityMatch

        return IdentityMatch(uuid4(), f"עסק {i}", "draft", owner, [PHONE])

    def test_one_email_names_the_pair_the_account_and_the_reason(self, monkeypatch):
        sent = self._send(monkeypatch, [self._match(1), self._match(2, owner=None)])
        assert len(sent) == 1
        to, subject, body = sent[0]
        assert to == "admin@example.com"
        assert subject == "מהמקור - ייתכן שיש כבר עמוד לפרמרים"
        assert "פרמרים נרשם עכשיו" in body
        assert "- עסק 1 (חשבון: order@farmerim.com). למה: אותו טלפון" in body
        assert "- עסק 2 (חשבון: אין בעלים)" in body
        assert body.rstrip().endswith("/admin/producers")

    def test_many_matches_are_capped_and_counted(self, monkeypatch):
        sent = self._send(monkeypatch, [self._match(i) for i in range(8)])
        body = sent[0][2]
        assert body.count("\n- ") == 5
        assert "ועוד 3." in body

    def test_a_crafted_name_cannot_add_a_line(self, monkeypatch):
        m = self._match(1)
        m.name = "שם\nלמה: מזויף"
        body = self._send(monkeypatch, [m])[0][2]
        assert "\nלמה: מזויף" not in body

    def test_a_test_business_sends_nothing(self, monkeypatch):
        assert self._send(monkeypatch, [self._match(1)], test_cause=True) == []
