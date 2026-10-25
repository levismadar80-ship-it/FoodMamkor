"""MEH-2322 (MEH-2321 chunk A) — owner-claim link.

An admin prepares a DRAFT business with no owner and sends its owner a signed
link. She signs in with her OWN account, accepts the declaration and the terms
herself, and the draft becomes hers — still a draft, still behind the manual
approval gate.

Every guard has its own test, named for the input it covers (testing.md: a
case named for a class hides the inputs it skips). Each one was shown red
against a construction that removes exactly that guard — see the PR body.
"""

from datetime import datetime, timedelta, timezone

import pytest
from joserfc import jwt as jose_jwt

from conftest import auth_header, make_category, make_producer, make_user
from app.auth import (
    PRODUCER_CLAIM_SCOPE,
    _jwt_key,
    create_producer_claim_token,
    create_review_invite_token,
    decode_producer_claim_token,
)
from app.config import settings
from app.constants import DECLARATION_VERSION, TERMS_VERSION
from app.models import Producer, User

CLAIM = "/producer-claim"
PREVIEW = "/producer-claim/preview"


def _link(pid):
    return f"/admin/producers/{pid}/claim-link"


def _mint(producer_id, *, exp_delta=timedelta(days=1), scope=PRODUCER_CLAIM_SCOPE, with_exp=True):
    """A claim-shaped JWT with ONE property under our control. Everything
    else mirrors auth.create_producer_claim_token."""
    now = datetime.now(timezone.utc)
    payload = {"producer_id": str(producer_id), "iat": int(now.timestamp()), "scope": scope}
    if with_exp:
        payload["exp"] = now + exp_delta
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


def _draft(db, **kw):
    return make_producer(db, status="draft", **kw)


def _token(producer):
    return create_producer_claim_token(producer.id)[0]


def _body(token, **over):
    return {"token": token, "declaration_accepted": True, "terms_accepted": True, **over}


@pytest.fixture(autouse=True)
def _annotate_on_failure(request):
    """Name a failing test in the PR's check annotations.

    pytest prints a test's captured stdout ONLY when that test fails, and
    GitHub turns any log line starting with `::error`/`::warning` into an
    annotation. So this line is invisible on a pass and names the test on a
    failure — readable without the raw job log. Two annotation types, because
    GitHub caps each type at 10 per step.
    """
    kind = "error" if request.node.cls is TestClaim else "warning"
    print(f"::{kind} title=test_producer_claim failed::{request.node.nodeid}")


@pytest.fixture(autouse=True)
def _quiet_side_effects(monkeypatch):
    """Record the three background sends instead of running them, so the
    suite is hermetic AND the claim's side effects are observable."""
    calls = []
    monkeypatch.setattr(
        "app.routers.producer_claim.notify_producer_registered",
        lambda name, phone: calls.append(("whatsapp", name, phone)),
    )
    monkeypatch.setattr(
        "app.routers.producer_claim.score_producer", lambda pid: calls.append(("risk", pid))
    )
    monkeypatch.setattr(
        "app.routers.producer_claim.send_welcome_email",
        lambda email, name, role: calls.append(("email", email, role)),
    )
    return calls


# ---------- D1: the token ----------


class TestClaimToken:
    def test_round_trip_returns_the_producer_id(self, db):
        p = _draft(db)
        token, expires_at = create_producer_claim_token(p.id)
        assert decode_producer_claim_token(token) == p.id
        # 14 days, give or take the test's own runtime.
        assert timedelta(days=13, hours=23) < expires_at - datetime.now(timezone.utc) <= timedelta(days=14)

    def test_expired_token_is_rejected(self, db):
        p = _draft(db)
        assert decode_producer_claim_token(_mint(p.id, exp_delta=timedelta(seconds=-5))) is None

    def test_token_without_exp_is_rejected(self, db):
        p = _draft(db)
        assert decode_producer_claim_token(_mint(p.id, with_exp=False)) is None

    def test_review_invite_token_is_not_a_claim_token(self, db):
        p = _draft(db)
        assert decode_producer_claim_token(create_review_invite_token(p.id)) is None

    def test_access_scoped_token_carrying_a_producer_id_is_rejected(self, db):
        """Only the scope can refuse this one: it is correctly signed, unexpired
        and names a real draft. (A real access token would also fail for lack
        of a producer_id, which is why this mints its own.)"""
        p = _draft(db)
        assert decode_producer_claim_token(_mint(p.id, scope="access")) is None

    def test_garbage_is_rejected_without_raising(self):
        assert decode_producer_claim_token("not-a-jwt") is None

    def test_claim_token_is_not_an_access_token(self, client, db):
        """The other direction: a claim link must not authenticate anyone."""
        p = _draft(db)
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {_token(p)}"})
        assert r.status_code == 401


# ---------- admin: create the link ----------


class TestAdminClaimLink:
    def test_admin_gets_a_link_for_an_ownerless_draft(self, client, db):
        admin = make_user(db, role="admin")
        p = _draft(db)
        r = client.post(_link(p.id), headers=auth_header(admin))
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith(f"{settings.frontend_url}/claim/")
        assert decode_producer_claim_token(url.rsplit("/", 1)[1]) == p.id

    def test_non_admin_is_refused(self, client, db):
        user = make_user(db)
        p = _draft(db)
        assert client.post(_link(p.id), headers=auth_header(user)).status_code == 403

    def test_approved_listing_gets_no_link(self, client, db):
        admin = make_user(db, role="admin")
        p = make_producer(db, status="approved")
        assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409

    def test_draft_that_already_has_an_owner_gets_no_link(self, client, db):
        admin = make_user(db, role="admin")
        p = _draft(db)
        owner = make_user(db, role="producer")
        owner.producer_id = p.id
        db.commit()
        assert client.post(_link(p.id), headers=auth_header(admin)).status_code == 409

    def test_missing_producer_is_404(self, client, db):
        admin = make_user(db, role="admin")
        missing = "00000000-0000-0000-0000-000000000000"
        assert client.post(_link(missing), headers=auth_header(admin)).status_code == 404


# ---------- D8: the public preview ----------


class TestClaimPreview:
    def test_returns_only_the_four_public_fields(self, client, db):
        p = _draft(db, images=["https://res.cloudinary.com/demo/image/upload/a.jpg"])
        r = client.get(PREVIEW, params={"token": _token(p)})
        assert r.status_code == 200, r.text
        body = r.json()
        # EXACT key set — a phone, email, address or license leaking into a
        # page anyone with the link can open is the failure this pins.
        assert set(body) == {"name", "city", "short_description", "image"}
        assert body["name"] == p.name
        assert body["image"] == "https://res.cloudinary.com/demo/image/upload/a.jpg"

    def test_invalid_token_is_404(self, client, db):
        assert client.get(PREVIEW, params={"token": "nope"}).status_code == 404

    def test_expired_token_is_404(self, client, db):
        p = _draft(db)
        r = client.get(PREVIEW, params={"token": _mint(p.id, exp_delta=timedelta(seconds=-5))})
        assert r.status_code == 404

    def test_claimed_draft_is_409(self, client, db):
        p = _draft(db)
        owner = make_user(db, role="producer")
        owner.producer_id = p.id
        db.commit()
        assert client.get(PREVIEW, params={"token": _token(p)}).status_code == 409

    def test_approved_listing_is_409(self, client, db):
        p = make_producer(db, status="approved")
        assert client.get(PREVIEW, params={"token": _token(p)}).status_code == 409


# ---------- D2–D6: the claim ----------


class TestClaim:
    def test_claim_links_the_draft_and_stamps_her_declaration(self, client, db, _quiet_side_effects):
        p = _draft(db)
        user = make_user(db, email="owner2322@example.com")
        r = client.post(CLAIM, json=_body(_token(p)), headers=auth_header(user))
        assert r.status_code == 200, r.text
        assert r.json() == {"producer_id": str(p.id), "status": "draft"}

        db.expire_all()
        user = db.get(User, user.id)
        p = db.get(Producer, p.id)
        assert user.producer_id == p.id
        assert user.role == "producer"
        assert user.is_producer is True
        assert user.terms_version == TERMS_VERSION and user.terms_accepted_at is not None
        assert p.declaration_version == DECLARATION_VERSION and p.declared_at is not None
        # D6: still a draft — nothing went live.
        assert p.status == "draft"
        assert ("whatsapp", p.name, p.phone) in _quiet_side_effects
        assert ("email", "owner2322@example.com", "producer") in _quiet_side_effects

    def test_owner_can_open_her_dashboard_after_claiming(self, client, db):
        p = _draft(db)
        user = make_user(db)
        client.post(CLAIM, json=_body(_token(p)), headers=auth_header(user))
        r = client.get("/producers/me", headers=auth_header(user))
        assert r.status_code == 200, r.text
        assert r.json()["id"] == str(p.id)

    def test_second_claim_on_the_same_link_is_409(self, client, db):
        p = _draft(db)
        token = _token(p)
        first, second = make_user(db), make_user(db)
        assert client.post(CLAIM, json=_body(token), headers=auth_header(first)).status_code == 200
        r = client.post(CLAIM, json=_body(token), headers=auth_header(second))
        assert r.status_code == 409
        db.expire_all()
        assert db.get(User, second.id).producer_id is None

    def test_admin_cannot_claim(self, client, db):
        p = _draft(db)
        admin = make_user(db, role="admin")
        assert client.post(CLAIM, json=_body(_token(p)), headers=auth_header(admin)).status_code == 403

    def test_user_who_already_has_a_business_cannot_claim(self, client, db):
        mine = make_producer(db, status="approved")
        user = make_user(db, role="producer")
        user.producer_id = mine.id
        db.commit()
        p = _draft(db)
        assert client.post(CLAIM, json=_body(_token(p)), headers=auth_header(user)).status_code == 409

    def test_missing_declaration_is_422_and_links_nothing(self, client, db):
        p = _draft(db)
        user = make_user(db)
        r = client.post(CLAIM, json=_body(_token(p), declaration_accepted=False), headers=auth_header(user))
        assert r.status_code == 422
        db.expire_all()
        assert db.get(User, user.id).producer_id is None
        assert db.get(Producer, p.id).declared_at is None

    def test_missing_terms_is_422_and_links_nothing(self, client, db):
        p = _draft(db)
        user = make_user(db)
        r = client.post(CLAIM, json=_body(_token(p), terms_accepted=False), headers=auth_header(user))
        assert r.status_code == 422
        db.expire_all()
        assert db.get(User, user.id).producer_id is None

    def test_approved_listing_cannot_be_claimed(self, client, db):
        p = make_producer(db, status="approved")
        user = make_user(db)
        assert client.post(CLAIM, json=_body(_token(p)), headers=auth_header(user)).status_code == 409

    def test_expired_link_cannot_claim(self, client, db):
        p = _draft(db)
        user = make_user(db)
        token = _mint(p.id, exp_delta=timedelta(seconds=-5))
        assert client.post(CLAIM, json=_body(token), headers=auth_header(user)).status_code == 404

    def test_review_invite_token_cannot_claim(self, client, db):
        p = _draft(db)
        user = make_user(db)
        token = create_review_invite_token(p.id)
        assert client.post(CLAIM, json=_body(token), headers=auth_header(user)).status_code == 404

    def test_anonymous_cannot_claim(self, client, db):
        p = _draft(db)
        assert client.post(CLAIM, json=_body(_token(p))).status_code == 401


# ---------- D7: admin draft create ----------


class TestAdminDraftCreate:
    def test_as_draft_creates_an_ownerless_draft(self, client, db):
        admin = make_user(db, role="admin")
        r = client.post(
            "/admin/producers",
            json={"name": "מאפיית הטיוטה", "city": "חיפה", "as_draft": True},
            headers=auth_header(admin),
        )
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "draft"

    def test_without_as_draft_admin_create_is_still_pre_approved(self, client, db):
        """Byte-for-byte today's behaviour when the flag is absent (D7)."""
        admin = make_user(db, role="admin")
        r = client.post(
            "/admin/producers", json={"name": "משק ישיר", "city": "חיפה"}, headers=auth_header(admin)
        )
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "approved"

    def test_draft_skips_the_license_guard_but_approved_does_not(self, client, db):
        admin = make_user(db, role="admin")
        bread = make_category(db, name="לחמים ואפייה")  # LICENSE_REQUIRED_CATEGORIES
        base = {"name": "מאפייה בלי רישיון עדיין", "city": "חיפה", "category_ids": [bread.id]}
        approved = client.post("/admin/producers", json=base, headers=auth_header(admin))
        assert approved.status_code == 422, approved.text
        draft = client.post("/admin/producers", json={**base, "as_draft": True}, headers=auth_header(admin))
        assert draft.status_code == 201, draft.text
