"""MEH-334: boot-time guard for FRONTEND_URL/ENV mismatch.

Pure unit tests on the helper — no FastAPI lifespan, no DB. The helper
returns issue strings; the lifespan only logs them. WARNING-only by
design (boot must continue on drift so rollback strategies still work).

Recurrence prevention for MEH-332.
"""
import pytest

from app.startup import _check_frontend_url_consistency


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
