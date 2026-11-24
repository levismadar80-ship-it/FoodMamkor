"""
Module:   google_code_exchange
Purpose:  Swap the one-time authorization code from our own Google button
          (GIS code client, popup, redirect_uri "postmessage") for a
          Google-signed ID token, and accept it only when it was issued to
          our client and the email is verified.
Touches:  oauth2.googleapis.com/token (one POST per sign-in).
Does NOT: sign anyone in or touch the database. The browser posts the
          returned ID token to the routes that already take one
          (/auth/google, /auth/register/producer/oauth, owner-invite,
          account delete), which verify it again exactly as before.
Related:  services/oauth_verifiers.py (verify_google_token, the aud check),
          routers/auth_google_code.py (the route).
History:  MEH-3690 (creation).
"""

from enum import Enum
import logging
from typing import TYPE_CHECKING

from app.config import settings
from app.services.oauth_verifiers import verify_google_token

if TYPE_CHECKING:
    import httpx

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
# GIS popup mode: the code was delivered to the page by postMessage, and
# Google requires the literal "postmessage" as redirect_uri when swapping it.
GIS_POPUP_REDIRECT_URI = "postmessage"
_TIMEOUT_SECONDS = 10.0


class ExchangeFailure(Enum):
    NOT_CONFIGURED = "not_configured"
    UNREACHABLE = "unreachable"
    REFUSED = "refused"


def exchange_google_code(code: str) -> str | ExchangeFailure:
    """Return a verified Google ID token for `code`, or why there is none."""
    if not settings.google_client_id or not settings.google_client_secret:
        return ExchangeFailure.NOT_CONFIGURED
    import httpx

    try:
        resp = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": GIS_POPUP_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as e:
        logger.warning("[GOOGLE CODE] token endpoint unreachable: %s", type(e).__name__)
        return ExchangeFailure.UNREACHABLE
    # Google's answer also carries an access token (and may carry a refresh
    # token). We use neither: they are dropped here, never stored or logged.
    id_token = _id_token_from(resp)
    if id_token is None:
        return ExchangeFailure.REFUSED
    # DO NOT skip this because the token came straight from Google over TLS:
    # it is the same aud/iss/exp check /auth/google runs, and the one place a
    # token minted for another client id would be stopped here (MEH-3690).
    # email_verified: stricter than /auth/google, which never checked it. A
    # Google account whose email Google has not verified cannot sign in with
    # our button (MEH-3690 review; /auth/google itself: MEH-3813).
    claims = verify_google_token(id_token)
    if not claims or claims.get("email_verified") is not True:
        return ExchangeFailure.REFUSED
    return id_token


def _id_token_from(resp: "httpx.Response") -> str | None:
    """The id_token of a 200 answer, or None (logging only Google's error code)."""
    try:
        body = resp.json()
    except ValueError:
        body = None
    if not isinstance(body, dict):
        body = {}
    if resp.status_code != 200:
        # invalid_grant = a used, expired or forged code. Log the error code
        # only, never the body.
        logger.info("[GOOGLE CODE] refused: %s %s", resp.status_code, body.get("error", "-"))
        return None
    id_token = body.get("id_token")
    return id_token if isinstance(id_token, str) and id_token else None
