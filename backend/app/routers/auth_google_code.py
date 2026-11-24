"""
Module:   routers/auth_google_code
Purpose:  POST /auth/google/code — our own Google button's one server step:
          swap the code from Google's popup for a verified Google ID token.
Does NOT: sign anyone in, create an account or set a cookie. The browser
          posts the returned ID token to the route it already used with
          Google's rendered button (routers/auth.py /auth/google,
          routers/auth_register_producer.py, owner-invite, account delete).
Related:  services/google_code_exchange.py (the swap and the checks).
History:  MEH-3690 (creation).
"""

from fastapi import APIRouter, HTTPException, Request

from app.rate_limit import limiter
from app.schemas.schemas import GoogleCodeRequest, GoogleCodeResponse
from app.services.google_code_exchange import ExchangeFailure, exchange_google_code

router = APIRouter(prefix="/auth", tags=["auth"])

_FAILURES = {
    ExchangeFailure.NOT_CONFIGURED: (
        503,
        "התחברות עם Google לא פעילה כרגע. אפשר להתחבר עם מייל וסיסמה.",
    ),
    ExchangeFailure.UNREACHABLE: (502, "לא הצלחנו להתחבר ל-Google. נסו שוב בעוד רגע."),
    ExchangeFailure.REFUSED: (401, "ההתחברות עם Google לא הושלמה. נסו שוב."),
}


@router.post(
    "/google/code",
    response_model=GoogleCodeResponse,
    responses={
        401: {
            "description": "Google refused the code or the token failed verification"
        },
        502: {"description": "Google's token endpoint could not be reached"},
        503: {"description": "Google sign-in is not configured on this server"},
    },
)
# REUSES: backend/app/routers/auth.py:404 — same ceiling as /auth/google,
# one code swap per sign-in.
@limiter.limit("10/minute")
def google_code(request: Request, data: GoogleCodeRequest) -> GoogleCodeResponse:
    """Swap a Google authorization code for a verified Google ID token."""
    result = exchange_google_code(data.code)
    if isinstance(result, ExchangeFailure):
        status, detail = _FAILURES[result]
        raise HTTPException(status_code=status, detail=detail)
    return GoogleCodeResponse(id_token=result)
