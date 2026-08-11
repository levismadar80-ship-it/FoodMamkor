"""
Module:   test_register_personas
Purpose:  MEH-1274 register-phase persona matrix (backend leg). Exercises the
          producer-registration endpoints from the point of view of five
          prospect personas, focusing on the register-time contract only
          (wizard-collected fields → server behaviour), not the owner-edit
          surface that follows approval.
Touches:  POST /auth/register/producer (password + upgrade paths),
          POST /auth/register/producer/oauth (Google Step-0),
          POST /admin/producers/{id}/request-changes,
          POST /producers/me/request-review.
Does NOT: re-test the delivery XOR / delivery-exclusion rules (owned by
          tests/test_delivery_exclusion.py), the full OAuth Step-0 matrix
          (tests/test_producer_oauth.py), or the request-review/​request-changes
          guard grids in isolation (tests/test_api.py::TestMeh1236RequestReview
          + tests/test_producer_request_changes.py). Here they appear only as
          the P5 resubmit *loop*.
Related:  backend/app/routers/auth.py:365 (register_producer),
          backend/app/routers/auth.py:791 (register_producer_oauth),
          backend/app/routers/producer_me.py:903 (request_producer_review),
          backend/app/routers/admin.py:580 (request_producer_changes),
          backend/app/services/license_validation.py:52.
History:  MEH-1274 (creation) — 5-persona registration matrix.

Persona legend (register phase):
  P2 — OAuth producer: Google Step-0 → upgrade, license_pending honoured.
  P3 — multi-category producer: בשר+דגים resolved by name→id.
  P4 — password producer, edge cases: contact/category guards, OWASP
       anti-enumeration duplicate handling, double-submit, owner-edit fields.
  P5 — pending producer: admin request-changes → owner resubmit loop.
  (P1 — full-wizard UI persona — lives in the Playwright leg, spec 22.)
"""

import uuid

import pytest

from app.config import settings
from app.models.models import Producer, ProducerCategory, User
from app.routers import auth as auth_router
from conftest import (
    auth_header,
    make_category,
    make_producer,
    make_user,
    valid_producer_register_payload,
)

REGISTER_URL = "/auth/register/producer"
OAUTH_URL = "/auth/register/producer/oauth"

# A real IL mobile — primary_contact_method="whatsapp" requires phone
# (auth.py:410), and valid_producer_register_payload() deliberately omits it.
VALID_PHONE = "0501234567"


def _new_registration(**overrides) -> dict:
    """A schema-valid NEW (unauthenticated) producer registration payload.

    Builds on the shared valid_producer_register_payload() helper (which seeds
    a non-license category and stamps declaration_accepted=True) and adds the
    phone the default whatsapp contact method needs. Callers override single
    keys to drive one edge at a time.
    """
    return valid_producer_register_payload() | {"phone": VALID_PHONE} | overrides


# ===========================================================================
# P4 — password producer: register-time edge cases
# ===========================================================================
class TestPersona4PasswordEdgeCases:
    """The unhappy/edge register-phase contract on the password path."""

    def test_empty_phone_with_whatsapp_contact_is_422(self, client, db):
        """MEH-1153 / MEH-17: whatsapp (and phone) contact methods require a
        phone; an empty/absent one is body-shape validation → 422, identical
        regardless of email existence (no enumeration leak)."""
        # valid_producer_register_payload() is whatsapp + NO phone by design.
        payload = valid_producer_register_payload()
        resp = client.post(REGISTER_URL, json=payload)
        assert resp.status_code == 422, resp.text
        assert "טלפון" in resp.json()["detail"]

        # explicit empty string behaves the same as absent
        resp_empty = client.post(REGISTER_URL, json=payload | {"phone": "   "})
        assert resp_empty.status_code == 422, resp_empty.text

    def test_empty_categories_is_422(self, client, db):
        """ProducerRegister enforces ≥1 category at the schema layer
        (validate_default=True), so both missing and [] 422. Sibling grid:
        tests/test_meh1153_category_required.py."""
        resp = client.post(REGISTER_URL, json=_new_registration(category_ids=[]))
        assert resp.status_code == 422, resp.text
        assert any(
            "לפחות קטגוריה אחת" in str(item.get("msg", ""))
            for item in resp.json()["detail"]
        ), resp.text

    def test_duplicate_email_non_upgrade_is_byte_identical_ack_no_token(
        self, client, db
    ):
        """OWASP anti-enumeration (MEH-328, auth.py:390-391,681): a second
        anonymous registration on an already-registered email returns a
        RegisterAck whose bytes are IDENTICAL to the first, and NEVER a token —
        the only signal to the real owner is the out-of-band duplicate email."""
        payload = _new_registration(email="dup-p4@example.com")

        first = client.post(REGISTER_URL, json=payload)
        assert first.status_code == 200, first.text
        assert "access_token" not in first.json()

        # Same email, DIFFERENT producer details → collision branch.
        second = client.post(
            REGISTER_URL, json=payload | {"producer_name": "עסק אחר לגמרי"}
        )
        assert second.status_code == 200, second.text
        assert "access_token" not in second.json()

        # Byte-for-byte identical response (status + body) — the anti-enum core.
        assert first.status_code == second.status_code
        assert first.content == second.content

        # And only ONE producer row exists — the collision created nothing.
        assert db.query(Producer).count() == 1
        assert db.query(User).filter(User.email == "dup-p4@example.com").count() == 1

    def test_double_submit_creates_no_duplicate_rows(self, client, db):
        """An accidental double-submit (identical payload twice) must not
        create a second producer/user — the second POST lands on the
        anti-enum collision branch (200, no side effects)."""
        payload = _new_registration(email="double-p4@example.com")

        r1 = client.post(REGISTER_URL, json=payload)
        r2 = client.post(REGISTER_URL, json=payload)
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text

        assert db.query(User).filter(User.email == "double-p4@example.com").count() == 1
        assert db.query(Producer).count() == 1

    def test_duplicate_upgrade_path_is_409(self, client, db):
        """The AUTHENTICATED (upgrade) path is not anti-enum — a producer who
        already owns a business and re-submits gets an honest 409
        (auth.py:483-484), not a silent ack."""
        owner = make_user(db, email="already-producer@example.com", role="producer")
        producer = make_producer(db, status="pending")
        owner.producer_id = producer.id
        owner.is_producer = True
        db.commit()

        resp = client.post(
            REGISTER_URL,
            json=_new_registration(),
            headers=auth_header(owner),
        )
        assert resp.status_code == 409, resp.text
        assert "עסק" in resp.json()["detail"]

    def test_owner_edit_fields_in_register_body_are_ignored_not_rejected(
        self, client, db
    ):
        """Documented behaviour: the register schema (ProducerRegister) is a
        SUBSET of the producer surface. `website` IS a register field and
        persists; owner-edit-only fields (`facebook`, `external_order_form`)
        are NOT on ProducerRegister, so Pydantic's default extra="ignore"
        silently drops them — the request is NOT rejected (no 422) and the
        fields are NEVER persisted from the register body. They are set later
        via the owner dashboard editor only.
        """
        resp = client.post(
            REGISTER_URL,
            json=_new_registration(
                email="owner-fields-p4@example.com",
                website="https://my-shop.example.com",
                # owner-edit-only — not declared on ProducerRegister:
                facebook="https://facebook.com/should-be-ignored",
                external_order_form="https://forms.example.com/ignored",
            ),
        )
        # Accepted, NOT rejected — extra fields are ignored, not a 422.
        assert resp.status_code == 200, resp.text

        producer = db.query(Producer).one()
        # in-schema field round-trips:
        assert producer.website == "https://my-shop.example.com"
        # owner-edit-only fields never made it in from the register body:
        assert producer.facebook is None
        assert producer.external_order_form is None


# ===========================================================================
# P3 — multi-category producer (בשר + דגים by name → id)
# ===========================================================================
class TestPersona3MultiCategory:
    def test_multi_category_register_creates_join_rows(self, client, db):
        """A producer selecting two categories by name (בשר + דגים) resolves
        them to ids and lands both rows in producer_categories. Both are
        license-required (MEH-927 split), so a license number is supplied —
        that interaction is itself part of the persona contract."""
        meat = make_category(db, name="בשר", emoji="🥩")
        fish = make_category(db, name="דגים", emoji="🐟")

        resp = client.post(
            REGISTER_URL,
            json=_new_registration(
                email="multi-cat-p3@example.com",
                category_ids=[meat.id, fish.id],
                producer_license_number="1234567",  # both categories are gated
            ),
        )
        assert resp.status_code == 200, resp.text

        user = db.query(User).filter(User.email == "multi-cat-p3@example.com").one()
        rows = (
            db.query(ProducerCategory)
            .filter(ProducerCategory.producer_id == user.producer_id)
            .all()
        )
        assert {r.category_id for r in rows} == {meat.id, fish.id}

    def test_multi_category_gated_without_license_is_422(self, client, db):
        """Guard-rail on the same persona: omit the license number for a
        license-required pair → 422 (license_validation.py:52), proving the
        2xx above hinged on the license, not on some skip."""
        meat = make_category(db, name="בשר", emoji="🥩")
        fish = make_category(db, name="דגים", emoji="🐟")

        resp = client.post(
            REGISTER_URL,
            json=_new_registration(
                email="multi-cat-nolicense@example.com",
                category_ids=[meat.id, fish.id],
            ),
        )
        assert resp.status_code == 422, resp.text
        assert "רישיון" in resp.json()["detail"]


# ===========================================================================
# P2 — OAuth producer: Google Step-0 → upgrade, license_pending honoured
# ===========================================================================
_G_SUB = "google-sub-p2"
_G_EMAIL = "oauth-producer-p2@example.com"
_G_NAME = "יעל אוהד"


@pytest.fixture
def google_verified(monkeypatch):
    """Stub the Google verifier (no network) — mirrors test_producer_oauth."""
    monkeypatch.setattr(settings, "google_client_id", "dummy-google-id")
    monkeypatch.setattr(
        auth_router,
        "_verify_google_token",
        lambda token: {"sub": _G_SUB, "email": _G_EMAIL, "name": _G_NAME},
    )


class TestPersona2OAuthProducer:
    def test_oauth_step0_then_upgrade_creates_producer_license_pending(
        self, client, db, google_verified
    ):
        """The MEH-170 two-step OAuth producer flow, end-to-end:

        Step-0  POST /auth/register/producer/oauth → consumer user + JWT.
        Step-2  POST /auth/register/producer (authenticated) takes the MEH-143
                upgrade path. With license_pending=True the register-time
                license gate is skipped (MEH-971), so a license-required
                category (בשר) with NO license number still creates the
                producer in the pending queue with a NULL license.
        """
        # ── Step-0: OAuth identity → token (no producer yet) ──
        step0 = client.post(OAUTH_URL, json={"provider": "google", "id_token": "x"})
        assert step0.status_code == 200, step0.text
        token = step0.json()["access_token"]
        assert token

        user = db.query(User).filter(User.email == _G_EMAIL).one()
        assert user.role == "consumer"
        assert user.producer_id is None

        # ── Step-2: upgrade with license_pending honoured ──
        # The OAuth token is fingerprint-bound to a `__Secure-` cookie the
        # http TestClient can't replay, so authenticate this now-existing
        # OAuth user the same way every authenticated test does (auth_header →
        # create_access_token). The persona under test is the upgrade
        # contract, not the fingerprint-sidejacking guard.
        meat = make_category(db, name="בשר", emoji="🥩")
        step2 = client.post(
            REGISTER_URL,
            json={
                "producer_name": "בשריית הבדיקה",
                "phone": VALID_PHONE,
                "primary_contact_method": "whatsapp",
                "category_ids": [meat.id],
                "declaration_accepted": True,
                "license_pending": True,  # skips the license 422 (MEH-971)
                # producer_license_number intentionally absent
            },
            headers=auth_header(user),
        )
        assert step2.status_code == 200, step2.text
        # Upgrade path returns a token (ProducerRegistrationResponse), not an ack.
        assert "access_token" in step2.json()

        db.refresh(user)
        assert user.role == "producer"
        assert user.producer_id is not None
        producer = db.query(Producer).filter(Producer.id == user.producer_id).one()
        assert producer.status == "pending_whatsapp"
        # license_pending honoured — NULL license accepted into the queue.
        assert producer.producer_license_number is None
        rows = (
            db.query(ProducerCategory)
            .filter(ProducerCategory.producer_id == producer.id)
            .all()
        )
        assert {r.category_id for r in rows} == {meat.id}


# ===========================================================================
# P5 — pending producer: admin request-changes → owner resubmit loop
# ===========================================================================
_FEEDBACK = "חסרה תמונה — יש להעלות לפחות תמונה אחת"
TEST_IMAGE = "https://res.cloudinary.com/demo/image/upload/sample.jpg"


class TestPersona5ResubmitLoop:
    def _owner_of(self, db, producer):
        user = make_user(
            db, email=f"owner-{uuid.uuid4().hex[:8]}@example.com", role="producer"
        )
        user.producer_id = producer.id
        db.commit()
        return user

    def test_request_changes_then_owner_resubmit_closes_loop(
        self, client, db, monkeypatch
    ):
        """The full completion loop: an admin asks a pending producer to fill a
        gap (admin.py:580), then the owner signals she is done via
        /producers/me/request-review (producer_me.py:903). Both legs 2xx and
        the producer stays pending throughout (request-review is
        notification-only, no schema state change)."""
        # Keep the resubmit ping hermetic (fail-open service; stub anyway).
        import app.services.auth_notifications as an

        monkeypatch.setattr(an, "notify_admin_producer_resubmit", lambda *a, **k: None)

        admin = make_user(db, email="admin-p5@example.com", role="admin")
        producer = make_producer(db, status="pending")
        owner = self._owner_of(db, producer)

        rc = client.post(
            f"/admin/producers/{producer.id}/request-changes",
            json={"feedback": _FEEDBACK},
            headers=auth_header(admin),
        )
        assert rc.status_code == 200, rc.text
        db.refresh(producer)
        assert producer.requested_changes == _FEEDBACK
        assert producer.status == "pending"  # unchanged — not a rejection

        rr = client.post("/producers/me/request-review", headers=auth_header(owner))
        assert rr.status_code == 200, rr.text
        db.refresh(producer)
        # request-review is notification-only: status + trail untouched.
        assert producer.status == "pending"

    def test_request_changes_on_non_pending_is_409(self, client, db):
        """request-changes leaves status unchanged, so an already-decided
        (approved) producer must refuse it → 409 (admin.py:605), else the row
        would be an incoherent approved+trail state."""
        admin = make_user(db, email="admin-p5b@example.com", role="admin")
        producer = make_producer(db, status="approved", images=[TEST_IMAGE])

        resp = client.post(
            f"/admin/producers/{producer.id}/request-changes",
            json={"feedback": _FEEDBACK},
            headers=auth_header(admin),
        )
        assert resp.status_code == 409, resp.text
        db.refresh(producer)
        assert producer.requested_changes is None
        assert producer.status == "approved"
