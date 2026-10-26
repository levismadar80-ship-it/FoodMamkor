"""MEH-2374: the friend-referral claim endpoint is gone.

No screen ever showed a user her referral link, and since MEH-328 the only
caller (RegisterClient, right after signup) ran unauthenticated and got a 401.
The `referral_clicks` table and `users.referral_code` stay until their own
Expand-Contract drop.

DISCRIMINATION: on the old code `POST /referral/claim` is mounted, so the
assertion lists it and goes red.
"""

from app.main import app


def test_referral_claim_route_is_not_mounted():
    paths = app.openapi()["paths"]
    assert not [p for p in paths if p.startswith("/referral")]
    # Control: the schema is the real one, not an empty dict.
    assert "/auth/register" in paths
