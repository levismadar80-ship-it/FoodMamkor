"""MEH-334: boot-time guard for FRONTEND_URL/ENV mismatch.

Pure unit tests on the helper — no FastAPI lifespan, no DB. The helper
returns issue strings; the lifespan only logs them. WARNING-only by
design (boot must continue on drift so rollback strategies still work).

Recurrence prevention for MEH-332.

MEH-1164 (F6): also covers _check_email_delivery_config — the fail-loud
guard for a missing RESEND_API_KEY on staging/production. Unlike the
FRONTEND_URL guard, a non-None result is fatal (the caller raises), so
dev/test MUST stay a no-op.
"""
import pytest

from app.startup import (
    _check_email_delivery_config,
    _check_frontend_url_consistency,
)


@pytest.mark.parametrize(
    "env,url",
    [
        ("staging", "https://staging.mehamakor.online"),
        ("production", "https://mehamakor.online"),
        ("development", "http://localhost:3000"),
    ],
)
def test_consistent_envs_return_no_issues(env, url):
    assert _check_frontend_url_consistency(env, url) == []


def test_staging_pointing_at_production_warns():
    issues = _check_frontend_url_consistency("staging", "https://mehamakor.online")
    assert len(issues) == 1
    assert "staging" in issues[0].lower()


def test_production_pointing_at_staging_warns():
    issues = _check_frontend_url_consistency("production", "https://staging.mehamakor.online")
    assert len(issues) == 1
    assert "staging" in issues[0].lower()


def test_production_pointing_at_localhost_warns():
    issues = _check_frontend_url_consistency("production", "http://localhost:3000")
    assert len(issues) == 1


def test_development_pointing_at_prod_domain_warns():
    issues = _check_frontend_url_consistency("development", "https://mehamakor.online")
    assert len(issues) == 1
    assert "mehamakor.online" in issues[0]


# MEH-674: an unrecognized ENV value (typo) matches none of the drift branches
# and would otherwise pass silently, disabling the guard. It must warn.
@pytest.mark.parametrize("env", ["stage", "prod", "dev", "STAGNG", "qa"])
def test_unrecognized_env_warns(env):
    issues = _check_frontend_url_consistency(env, "http://localhost:3000")
    assert any("unrecognized ENV value" in i for i in issues)


def test_recognized_envs_never_flagged_as_unrecognized():
    for env, url in [
        ("staging", "https://staging.mehamakor.online"),
        ("production", "https://mehamakor.online"),
        ("development", "http://localhost:3000"),
    ]:
        issues = _check_frontend_url_consistency(env, url)
        assert not any("unrecognized" in i for i in issues)


# --- MEH-1164 (F6): RESEND_API_KEY email-delivery fail-loud guard ------------


@pytest.mark.parametrize("env", ["staging", "production", "STAGING", "Production"])
def test_missing_key_on_delivery_env_is_fatal(env):
    """staging/production with no key → a fatal message (caller raises)."""
    msg = _check_email_delivery_config(env, "")
    assert msg is not None
    assert "RESEND_API_KEY" in msg
    assert env.lower() in msg


@pytest.mark.parametrize("env", ["staging", "production"])
def test_present_key_on_delivery_env_is_ok(env):
    """A configured key on a delivery env is fine — no fatal message."""
    assert _check_email_delivery_config(env, "re_live_xxx") is None


@pytest.mark.parametrize("env", ["development", "dev", "", "test", None])
def test_missing_key_off_delivery_env_is_noop(env):
    """Dev/test/unknown envs keep the intentional email fail-open no-op — a
    missing key must NEVER block boot outside staging/production."""
    assert _check_email_delivery_config(env, "") is None


@pytest.mark.parametrize("key", [None, ""])
def test_blank_or_missing_key_is_fatal(key):
    """A blank ("" — Railway var present but empty) OR absent (None) key on a
    delivery env is fatal. `not key` handles both; parametrizing None locks the
    unset case explicitly (MEH-1164 claude[bot] review)."""
    assert _check_email_delivery_config("staging", key) is not None
