"""SEN-004 (MEH-775): the per-email rate-limit key must never return an
empty string.

slowapi SKIPS the limit entirely when key_func returns a falsy value
("Skipping limit: … Empty value found in parameters."), so an empty/decoded-
empty body left the auth routes (/auth/register, /auth/register/producer,
/auth/forgot-password) with no per-email rate limiting — observed in
production via Sentry (SEN-004). The key now falls back to a single shared
bucket instead of skipping; the per-IP limit on the same route is the second
layer.
"""
from types import SimpleNamespace

from app.rate_limit import NO_EMAIL_BUCKET, email_from_body


def _req(body, path="/auth/register/producer"):
    # email_from_body reads request._body and request.url.path only.
    return SimpleNamespace(_body=body, url=SimpleNamespace(path=path))


# --- the SEN-004 failure class: key must be non-empty (no slowapi skip) ---
def test_missing_body_returns_fallback_not_empty():
    assert email_from_body(_req(None)) == NO_EMAIL_BUCKET


def test_empty_body_returns_fallback():
    assert email_from_body(_req(b"")) == NO_EMAIL_BUCKET


def test_non_dict_body_returns_fallback():
    assert email_from_body(_req(b"[1, 2, 3]")) == NO_EMAIL_BUCKET


def test_missing_email_key_returns_fallback():
    assert email_from_body(_req(b'{"foo": "bar"}')) == NO_EMAIL_BUCKET


def test_empty_string_email_returns_fallback():
    assert email_from_body(_req(b'{"email": "   "}')) == NO_EMAIL_BUCKET


def test_non_string_email_returns_fallback():
    assert email_from_body(_req(b'{"email": 123}')) == NO_EMAIL_BUCKET


def test_undecodable_body_returns_fallback():
    assert email_from_body(_req(b"\xff\xfenot json")) == NO_EMAIL_BUCKET


# --- normal traffic unchanged: real email → normalized per-email key ---
def test_valid_email_normalized():
    assert email_from_body(_req(b'{"email": "  Alice@Example.COM "}')) == "alice@example.com"


def test_fallback_bucket_is_non_empty():
    # Guards the invariant directly: slowapi only skips on a falsy key.
    assert NO_EMAIL_BUCKET
    assert isinstance(NO_EMAIL_BUCKET, str)
