import logging
import secrets
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# SECURITY FIX #1 (docs/SECURITY.md): the previous default was the literal
# string "change-me-in-production" which made JWT forgery trivial if
# the env var wasn't set. Now:
#   - Dev: a per-process random secret is generated if JWT_SECRET_KEY
#     isn't set, so local dev still works without config but each restart
#     invalidates tokens (which is fine locally).
#   - Prod: if ENV=production is set AND no JWT_SECRET_KEY was provided,
#     the app refuses to start. See `_validate_production_secrets`.
_DEV_SECRET_SENTINEL = "__ephemeral_dev_secret__"


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgres@localhost:5432/mehamakor"
    # MEH-408 Phase 3: environment-aware DB URL. pydantic-settings maps these
    # field names to DATABASE_URL_PRODUCTION and DATABASE_URL_STAGING env vars.
    # _load_settings() below resolves which one to use based on ENV.
    database_url_production: str = ""
    database_url_staging: str = ""
    secret_key: str = (
        _DEV_SECRET_SENTINEL  # overridden by SECRET_KEY / JWT_SECRET_KEY env
    )
    algorithm: str = "HS256"
    # MEH-326: short-TTL access token (15 min) paired with a 14-day refresh
    # token delivered via HttpOnly cookie. The frontend axios interceptor
    # silently calls /auth/refresh on 401 and retries the original request,
    # so users no longer feel the rotation. Backward compat: tokens issued
    # before this PR (no `scope` claim) keep validating until natural expiry
    # — see get_current_user fail-open at backend/app/auth.py.
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14

    # Environment flag (dev|staging|production). Set via ENV=production.
    env: str = "development"

    # SECURITY FIX #7 (CORS). Comma-separated list via env. Default is dev
    # hosts only — production MUST set CORS_ORIGINS explicitly.
    cors_origins: str = "http://localhost:3000,http://localhost:8000"

    # Cloudinary
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # Google OAuth
    google_client_id: str = ""

    # Apple Sign In
    apple_client_id: str = ""

    # WhatsApp Cloud API (MEH-508 — direct Meta Graph, replaces Twilio).
    # phone_number_id + access_token come from Meta WhatsApp Business
    # Manager (MEH-507 Section C). business_id is reserved for future
    # template-management calls; api_version pins the Graph endpoint.
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_business_id: str = ""
    whatsapp_api_version: str = "v21.0"
    admin_whatsapp_to: str = ""

    # MEH-509 PR2c — inbound webhook receiver (GET challenge + POST receive).
    # `whatsapp_app_secret` is the Meta App Secret used to compute the
    # X-Hub-Signature-256 HMAC over each POST body; `whatsapp_verify_token`
    # is the static token Meta sends in the GET subscription challenge.
    # Empty defaults are fail-closed: empty app_secret → all POST signatures
    # fail verification; empty verify_token → all GET challenges return 403.
    # Configured in Railway via WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN.
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = ""

    # Email — Resend HTTP API (replaces smtplib; Railway blocks SMTP ports)
    # Sign up at resend.com, verify mehamakor.online domain, copy the API key.
    resend_api_key: str = ""
    # MEH-453: extracted from email.py module constant. Override per env via
    # EMAIL_FROM_ADDRESS in Railway. Phase 2 will flip the default to .co.il.
    email_from_address: str = "מהמקור <noreply@mehamakor.online>"
    # Admin account — used as the notification recipient AND as the initial
    # admin user seeded on first boot (see seed_data.py).
    # Leave admin_password empty in local dev to skip the admin seed.
    admin_email: str = ""
    admin_password: str = ""
    # Destination for public contact-form submissions (POST /contact). Set
    # independently from admin_email so the public inbox can be a distinct
    # address (e.g. a branded Gmail alias). Falls back to admin_email when
    # unset so existing installs keep working.
    contact_email: str = ""

    # App
    frontend_url: str = "http://localhost:3000"

    # Anthropic (home-product moderation)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-6"

    # MEH-54: VAPID keys for Web Push notifications. Generate with:
    #   python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.private_pem().decode()); print(v.public_key.public_bytes_raw().hex())"
    # Leave empty to disable push (fail-open — alerts still send via WhatsApp if opted in).
    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_subject: str = "mailto:admin@mehamakor.online"

    # MEH-509 PR2b: after-hours watchdog feature flag. Default False so the
    # 5-min APScheduler job does not run until PR2c (the Meta webhook
    # receiver) ships and creates rows in `inbound_messages`. Set
    # WATCHDOG_ENABLED=true in Railway staging first for smoke, then
    # production. Pytest leaves it False — the watchdog never starts under
    # tests, which exercise run_watchdog() directly via the public API.
    watchdog_enabled: bool = False

    class Config:
        env_file = ".env"
        # Read JWT_SECRET_KEY env var into .secret_key (the more canonical name).
        # pydantic-settings reads both SECRET_KEY and JWT_SECRET_KEY via env
        # aliases below.

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def _load_settings() -> Settings:
    """Initialize Settings with a generated dev secret if needed."""
    import os

    # Let JWT_SECRET_KEY override SECRET_KEY too (both names accepted)
    if not os.environ.get("SECRET_KEY") and os.environ.get("JWT_SECRET_KEY"):
        os.environ["SECRET_KEY"] = os.environ["JWT_SECRET_KEY"]

    s = Settings()

    # MEH-408 Phase 3: resolve database_url based on ENV.
    # Priority: DATABASE_URL_<ENV> → DATABASE_URL (deprecated fallback).
    _env = s.env.lower()
    if _env == "production" and s.database_url_production:
        s.database_url = s.database_url_production
    elif _env == "staging" and s.database_url_staging:
        s.database_url = s.database_url_staging
    elif _env in ("production", "staging"):
        logger.warning(
            "DATABASE_URL_%s not set — falling back to DATABASE_URL "
            "(deprecated; set DATABASE_URL_%s in Railway to suppress this).",
            _env.upper(),
            _env.upper(),
        )
    # dev / test: s.database_url already carries DATABASE_URL (or localhost default).

    if s.secret_key == _DEV_SECRET_SENTINEL:
        if s.env.lower() == "production":
            # SECURITY FIX #1: fail-fast in production with no secret set
            raise RuntimeError(
                "SECURITY: JWT_SECRET_KEY (or SECRET_KEY) must be set in "
                "production. Generate one with: python -c "
                '"import secrets; print(secrets.token_hex(32))"'
            )
        # Dev mode: generate ephemeral secret so the app still boots without
        # config. Tokens become invalid on every restart, which is fine for dev.
        s.secret_key = secrets.token_hex(32)
        logger.warning(
            "SECURITY: JWT_SECRET_KEY not set — generated an ephemeral dev "
            "secret. DO NOT run this process in production without setting "
            "JWT_SECRET_KEY in the environment."
        )

    return s


settings = _load_settings()


# MEH-509 PR2b: business-hours window for the after-hours watchdog.
# Module-level constants (not Pydantic fields) — these are policy, not
# env-driven. Asia/Jerusalem timezone honours DST automatically via
# stdlib zoneinfo (Python ≥3.9). is_within_business_hours() in
# app/services/auto_reply_watchdog.py is the sole consumer.
#
# Schedule: Sun-Thu 09-19, Fri 09-13, Sat closed. Hours are half-open
# (start <= hour < end) so 19:00 itself counts as after-hours.
BUSINESS_HOURS_TIMEZONE: str = "Asia/Jerusalem"
BUSINESS_HOURS: dict[str, tuple[int, int] | None] = {
    "sunday": (9, 19),
    "monday": (9, 19),
    "tuesday": (9, 19),
    "wednesday": (9, 19),
    "thursday": (9, 19),
    "friday": (9, 13),
    "saturday": None,  # closed
}
WATCHDOG_INTERVAL_MINUTES: int = 5
WATCHDOG_LOOKBACK_MINUTES: int = 30
