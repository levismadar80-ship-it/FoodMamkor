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
    secret_key: str = _DEV_SECRET_SENTINEL  # overridden by SECRET_KEY / JWT_SECRET_KEY env
    algorithm: str = "HS256"
    # SECURITY FIX #1: access tokens used to live 7 days. Shortened to 24h
    # as a compromise — no refresh-token infra yet, so 15min (the spec ideal)
    # would cause constant re-login. Rotate by re-login once a day.
    access_token_expire_minutes: int = 60 * 24  # 24 hours

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

    # Twilio WhatsApp
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = ""
    admin_whatsapp_to: str = ""

    # SMTP Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # Admin account — used both as the SMTP notification recipient AND as
    # the initial admin user seeded on first boot (see seed_data.py).
    # Leave admin_password empty in local dev to skip the admin seed.
    admin_email: str = ""
    admin_password: str = ""

    # App
    frontend_url: str = "http://localhost:3000"

    # Anthropic (home-product moderation)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-6"

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

    if s.secret_key == _DEV_SECRET_SENTINEL:
        if s.env.lower() == "production":
            # SECURITY FIX #1: fail-fast in production with no secret set
            raise RuntimeError(
                "SECURITY: JWT_SECRET_KEY (or SECRET_KEY) must be set in "
                "production. Generate one with: python -c "
                "\"import secrets; print(secrets.token_hex(32))\""
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
