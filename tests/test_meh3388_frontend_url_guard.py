"""MEH-3388 — FRONTEND_URL fails closed in production.

Every link in every email is built from settings.frontend_url, and its default
is http://localhost:3000 (backend/app/config.py). The only earlier guard,
startup._check_frontend_url_consistency, logs a WARNING and returns, so a
production boot with a missing or wrong value sent customers to localhost.

Production = ENV=production OR RAILWAY_ENVIRONMENT=production (the same
definition as the SUPER_ADMIN_EMAIL guard, MEH-2890). Outside production
nothing changes: the localhost default still boots.
"""

import pytest

from app import config

OWNER = "owner@example.com"
PROD_URL = "https://mehamakor.co.il"


def _boot(monkeypatch, *, env, frontend_url, railway=""):
    """Run the real settings loader against a controlled environment. Every
    var is SET (possibly to ""), never deleted: a real env var beats the
    dotenv file, so a developer's local .env cannot leak into the test."""
    monkeypatch.setenv("ENV", env)
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", railway)
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("SUPER_ADMIN_EMAIL", OWNER)
    monkeypatch.setenv("FRONTEND_URL", frontend_url)
    return config._load_settings()


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "   ",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://staging.mehamakor.online",
        "https://STAGING.mehamakor.online",
    ],
)
def test_production_refuses_to_boot_with_a_non_production_frontend_url(monkeypatch, bad):
    with pytest.raises(RuntimeError, match="FRONTEND_URL"):
        _boot(monkeypatch, env="production", frontend_url=bad)


def test_railway_production_refuses_too_even_when_env_is_unset(monkeypatch):
    """RAILWAY_ENVIRONMENT is set by Railway itself, so a forgotten ENV
    cannot skip the check."""
    with pytest.raises(RuntimeError, match="FRONTEND_URL"):
        _boot(monkeypatch, env="development", railway="production",
              frontend_url="http://localhost:3000")


def test_production_boots_with_the_production_site(monkeypatch):
    s = _boot(monkeypatch, env="production", frontend_url=PROD_URL)
    assert s.frontend_url == PROD_URL


@pytest.mark.parametrize("env", ["development", "staging", "test"])
def test_outside_production_localhost_still_boots(monkeypatch, env):
    s = _boot(monkeypatch, env=env, frontend_url="http://localhost:3000")
    assert s.frontend_url == "http://localhost:3000"
