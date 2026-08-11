"""
Module:   test_optional_auth_contract
Purpose:  Pin the three-state contract of optional authentication (MEH-1627)
          so a present-but-invalid Bearer token can never again be silently
          downgraded to "anonymous".
Touches:  users / producers tables via the shared conftest factories.
Does NOT: cover the frontend half of the contract — the interceptor that
          consumes these 401s is pinned in
          frontend/__tests__/api-refresh-retry.test.js.
Related:  backend/app/auth.py:244 (get_current_user_optional),
          backend/app/auth.py:275 (get_current_user_lenient),
          backend/app/routers/auth.py:392 (upgrade_path),
          backend/app/routers/producers.py:266 (owner-bypass guard).
History:  MEH-1627 (creation).

The bug this file exists to prevent: get_current_user_optional used to
swallow every non-403 HTTPException and return None. That collapsed two
different situations into one answer —

    no Authorization header at all   → None   (correct: a real guest)
    Authorization header, bad token  → None   (wrong: a logged-in user)

— so an expired token made the server treat a signed-in user as a stranger.
On POST /auth/register/producer that set upgrade_path=False, dropping the
request into the anonymous-registration branch, which 422s because an
upgrade payload carries no email (routers/auth.py:575-580). A 422 is not a
401, so the frontend's refresh interceptor never fired: the user was stuck
with "אימייל, שם וסיסמה הם שדות חובה" and no way forward.
"""

from datetime import datetime, timedelta, timezone

import pytest
from joserfc import jwt as jose_jwt

from app.auth import _jwt_key, create_access_token
from app.config import settings
from app.models.models import User

from tests.conftest import (
    make_category,
    make_producer,
    make_user,
    valid_producer_register_payload,
)


def expired_token(user: User) -> str:
    """A structurally valid, correctly signed, *expired* access token.

    Deliberately signed with the real key rather than a garbage string:
    a bad signature and a stale `exp` both surface as JoseError, but only
    the expired one reproduces the production failure (a token this server
    genuinely issued, 24h ago).
    """
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    payload = {
        "sub": str(user.id),
        "exp": int(past.timestamp()),
        "iat": int((past - timedelta(hours=24)).timestamp()),
        "tv": user.token_version,
        "scope": "access",
    }
    return jose_jwt.encode({"alg": settings.algorithm}, payload, _jwt_key())


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestOptionalAuthThreeStates:
    """State 1 / 2 / 3 on a strict get_current_user_optional endpoint."""

    def test_no_header_serves_anonymous(self, client, db):
        """State 1 — no Authorization header → anonymous, NOT 401.

        This is the half of "optional" that must not regress: a genuine
        guest browsing an approved producer still gets the page.
        """
        producer = make_producer(db, status="approved")

        res = client.get(f"/producers/{producer.id}")

        assert res.status_code == 200
        assert res.json()["id"] == str(producer.id)

    def test_expired_token_401_with_rfc6750_challenge(self, client, db):
        """State 3 — header present but invalid → 401, never swallowed.

        The WWW-Authenticate challenge is the RFC 6750 §3 half of the
        contract; the 401 status is what the frontend interceptor keys on.
        """
        user = make_user(db)
        producer = make_producer(db, status="approved")

        res = client.get(
            f"/producers/{producer.id}", headers=bearer(expired_token(user))
        )

        assert res.status_code == 401
        assert "invalid_token" in res.headers.get("WWW-Authenticate", "")

    def test_valid_token_resolves_user(self, client, db):
        """State 2 — header present and valid → the request is authenticated.

        Asserted through a response field that only a resolved viewer can
        produce, so this cannot pass by merely "not erroring".
        """
        user = make_user(db)
        producer = make_producer(db, status="pending")
        user.producer_id = producer.id
        db.commit()

        res = client.get(
            f"/producers/{producer.id}",
            headers=bearer(create_access_token(user.id, user.token_version)),
        )

        # The owner-bypass guard (producers.py:266) only lets a *resolved*
        # viewer see a non-approved producer — everyone else gets 404.
        assert res.status_code == 200
        assert res.json()["id"] == str(producer.id)


class TestPendingProducerOwnerVisibility:
    """The 401-not-404 distinction on the owner-bypass path."""

    def test_owner_with_expired_token_gets_401_not_404(self, client, db):
        """An owner whose token expired must get a retryable 401.

        Pre-MEH-1627 this returned 404: the swallow made the owner
        anonymous, and an anonymous viewer of a pending producer is
        deliberately shown 404 so UUIDs can't enumerate queue state
        (producers.py:262-270). 404 is terminal — the client has no reason
        to refresh — so the owner simply could not reach their own page.
        """
        user = make_user(db)
        producer = make_producer(db, status="pending")
        user.producer_id = producer.id
        db.commit()

        res = client.get(
            f"/producers/{producer.id}", headers=bearer(expired_token(user))
        )

        assert res.status_code == 401, (
            "expired owner token must be refreshable, not masked as 404"
        )
        assert "invalid_token" in res.headers.get("WWW-Authenticate", "")

    def test_anonymous_still_gets_404_on_pending(self, client, db):
        """The MEH-254 enumeration guard is untouched for real guests."""
        producer = make_producer(db, status="pending")

        res = client.get(f"/producers/{producer.id}")

        assert res.status_code == 404


class TestProducerRegistrationUpgradePath:
    """The launch blocker itself, at the endpoint where it bit."""

    def test_expired_token_on_upgrade_returns_401_not_422(self, client, db):
        """POST /auth/register/producer with an expired token → 401.

        The upgrade payload carries no email/password (the account already
        exists), so the old swallow sent it down the new-registration
        branch and it died at the 422 on routers/auth.py:575-580. A 401
        instead lets the interceptor refresh and replay the POST.
        """
        user = make_user(db)
        category = make_category(db, name="קטגוריה-שדרוג")
        upgrade_payload = {
            "producer_name": "חוות השדרוג",
            "category_ids": [category.id],
            "primary_contact_method": "whatsapp",
            "phone": "0501234567",
            "declaration_accepted": True,
        }

        res = client.post(
            "/auth/register/producer",
            json=upgrade_payload,
            headers=bearer(expired_token(user)),
        )

        assert res.status_code == 401, (
            f"expected refreshable 401, got {res.status_code}: {res.text[:300]}"
        )
        assert "invalid_token" in res.headers.get("WWW-Authenticate", "")

    def test_anonymous_registration_path_unchanged(self, client, db):
        """Zero behaviour change for a genuine anonymous registration.

        `phone` is required alongside primary_contact_method="whatsapp"
        (MEH-17 guard) — same augmentation test_auth.py:419 makes.
        """
        payload = valid_producer_register_payload() | {"phone": "0501234567"}

        res = client.post("/auth/register/producer", json=payload)

        assert res.status_code == 200
        # MEH-328 anti-enumeration: the anonymous branch returns a bare
        # RegisterAck with no token. Asserting its *shape* proves the
        # request took the non-upgrade path, not merely that it succeeded.
        assert "access_token" not in res.json()


class TestLenientTelemetry:
    """The two fire-and-forget endpoints keep the old swallow."""

    @pytest.mark.parametrize(
        "path,payload,expected",
        [
            ("whatsapp-click", None, 200),
            ("contact-click", {"method": "phone"}, 204),
        ],
    )
    def test_expired_token_still_logs_the_click(
        self, client, db, path, payload, expected
    ):
        """sendBeacon/keepalive cannot retry — a 401 would lose the click.

        Losing the attribution (user_id NULL) is the accepted trade;
        losing the event is not.
        """
        user = make_user(db)
        producer = make_producer(db, status="approved")

        res = client.post(
            f"/producers/{producer.id}/{path}",
            json=payload,
            headers=bearer(expired_token(user)),
        )

        assert res.status_code == expected

    def test_blocked_user_still_403_on_lenient(self, client, db):
        """403 is re-raised, not swallowed — a blocked account is never
        quietly recorded as an anonymous visitor."""
        user = make_user(db, is_blocked=True)
        producer = make_producer(db, status="approved")

        res = client.post(
            f"/producers/{producer.id}/whatsapp-click",
            headers=bearer(create_access_token(user.id, user.token_version)),
        )

        assert res.status_code == 403

    def test_anonymous_click_still_logged(self, client, db):
        """No header at all remains a valid anonymous click."""
        producer = make_producer(db, status="approved")

        res = client.post(f"/producers/{producer.id}/whatsapp-click")

        assert res.status_code == 200


class TestNoBehaviourChangeForValidSessions:
    """The regression surface: valid tokens and 403s must be untouched."""

    def test_valid_token_has_no_challenge_header(self, client, db):
        user = make_user(db)
        producer = make_producer(db, status="approved")

        res = client.get(
            f"/producers/{producer.id}",
            headers=bearer(create_access_token(user.id, user.token_version)),
        )

        assert res.status_code == 200
        assert "WWW-Authenticate" not in res.headers

    def test_missing_credential_challenge_omits_the_error_code(self, client, db):
        """A protected route hit with NO credential → bare Bearer challenge.

        RFC 6750 §3: a request that "lacks any authentication information"
        SHOULD NOT get an error code, because `invalid_token` means a
        credential was presented and rejected. Sending it here would collapse
        "you sent nothing" into "your token is bad" — the same conflation this
        module exists to pin apart, one layer up in the header.

        GET /auth/me takes get_current_user directly, so unlike the optional
        endpoints above a missing header reaches the 401 rather than being
        served anonymously.
        """
        res = client.get("/auth/me")

        assert res.status_code == 401
        challenge = res.headers.get("WWW-Authenticate", "")
        assert "realm=" in challenge
        assert "invalid_token" not in challenge, (
            "a request that presented no credential must not be told its "
            "token was rejected"
        )

    def test_presented_but_invalid_still_carries_invalid_token(self, client, db):
        """The other half of the same distinction, on the same endpoint —
        so the pair discriminates rather than each passing in isolation."""
        user = make_user(db)

        res = client.get("/auth/me", headers=bearer(expired_token(user)))

        assert res.status_code == 401
        assert "invalid_token" in res.headers.get("WWW-Authenticate", "")

    def test_403_carries_no_invalid_token_challenge(self, client, db):
        """A blocked user is refused, not re-challenged — telling the client
        to refresh here would send it into a pointless retry."""
        user = make_user(db, is_blocked=True)
        producer = make_producer(db, status="approved")

        res = client.get(
            f"/producers/{producer.id}",
            headers=bearer(create_access_token(user.id, user.token_version)),
        )

        assert res.status_code == 403
        assert "invalid_token" not in res.headers.get("WWW-Authenticate", "")
