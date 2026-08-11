"""MEH-1724 F-4 — the public prefill lookup is rate limited.

`GET /register/producer/prefill/{token}` is unauthenticated by design (the
token IS the credential) and returns lead PII on a hit: name, phone,
instagram, website, city, category. Before this fix it carried no
`@limiter.limit`, so the PII surface could be probed without any cap.

The 256-bit `secrets.token_urlsafe(32)` token makes brute force infeasible,
so the limit is defence-in-depth rather than the primary control. That is
exactly why it needs a test: nothing else would notice if the decorator were
dropped in a refactor.

`test_prefill_lookup_is_rate_limited` is the exploit-proving test required by
ADR-017 §3.1. It DISCRIMINATES: against the pre-fix handler every one of the
31 requests returns 404 and the final assertion fails, because 429 is a state
the unlimited endpoint can never reach. See the PR body for both runs.

The second test guards the other direction — that adding the limiter did not
break the endpoint itself. Without it, deleting the handler body would still
leave the rate-limit test green.
"""

from datetime import datetime, timedelta

from app.models.models import OutreachLead

# Shape of secrets.token_urlsafe(32) (~43 chars) and comfortably over the
# handler's `len(token) < 16` guard, so requests reach the DB lookup and 404
# there rather than short-circuiting on length.
BOGUS_TOKEN = "a" * 43

# Must match the decorator in backend/app/routers/admin_outreach.py.
LIMIT_PER_HOUR = 30


class TestPrefillRateLimit:
    def test_prefill_lookup_is_rate_limited(self, client):
        """The (LIMIT+1)-th lookup from one IP is refused with 429.

        Pre-fix this fails on the last assertion: with no limiter the
        endpoint answers 404 forever and never emits 429.
        """
        statuses = [
            client.get(f"/register/producer/prefill/{BOGUS_TOKEN}").status_code
            for _ in range(LIMIT_PER_HOUR + 1)
        ]

        assert statuses[:LIMIT_PER_HOUR] == [404] * LIMIT_PER_HOUR
        assert statuses[LIMIT_PER_HOUR] == 429

    def test_valid_token_still_returns_lead_within_limit(self, client, db):
        """Adding the limiter must not change the endpoint's real behaviour."""
        token = "v" * 43
        lead = OutreachLead(
            name="מאפיית שקד",
            phone="0501234567",
            city="חיפה",
            prefill_token=token,
            prefill_token_expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(lead)
        db.commit()

        resp = client.get(f"/register/producer/prefill/{token}")

        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "מאפיית שקד"
        assert body["phone"] == "0501234567"
        assert body["city"] == "חיפה"
