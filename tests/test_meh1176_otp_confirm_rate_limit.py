"""MEH-1176 F5 — OTP confirm rate limit is 3/minute (429 on the 4th attempt).

The MANUAL_TESTING checklist claimed "5 confirms per minute"; the code has
always enforced the stricter 3/minute (producer_me.py, @limiter.limit on
confirm_phone_otp). Per Sapir 13/07 the code wins (stricter = security), so
this test pins the 3/minute contract and the doc was corrected — the route
itself is deliberately untouched.

REUSES: tests/test_auth.py TestForgotPasswordRateLimits (429 count pattern)
and tests/test_trust_ladder.py (producer + OTP fixtures).
"""

from tests.conftest import make_producer, make_user, auth_header


def _producer_user(db, phone="0501234570"):
    producer = make_producer(db, name="חוות קצב")
    producer.phone = phone
    db.commit()
    user = make_user(db, role="producer")
    user.producer_id = producer.id
    db.commit()
    return user


class TestOtpConfirmRateLimit:
    def test_fourth_confirm_within_a_minute_is_429(self, client, db):
        """3 wrong-code confirms burn the quota (400 each); the 4th → 429.

        SlowAPIMiddleware counts every request against the bucket regardless
        of outcome, so wrong codes are enough — no valid token needed.
        """
        user = _producer_user(db)
        statuses = [
            client.post(
                "/producers/me/verify-phone/confirm",
                json={"code": "000000"},
                headers=auth_header(user),
            ).status_code
            for _ in range(4)
        ]
        assert statuses[:3] == [400] * 3  # wrong code, but under the limit
        assert statuses[3] == 429  # 3/minute exhausted

    def test_send_limit_is_3_per_10_minutes(self, client, db):
        """Companion pin for the send endpoint the checklist got right:
        3 sends per 10 minutes, 4th → 429."""
        user = _producer_user(db, phone="0501234571")
        statuses = [
            client.post(
                "/producers/me/verify-phone",
                headers=auth_header(user),
            ).status_code
            for _ in range(4)
        ]
        assert statuses[:3] == [200] * 3
        assert statuses[3] == 429
