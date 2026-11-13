"""PII masking helpers for log/error output."""


def mask_phone(phone: str | None) -> str:
    """Return a masked phone safe for logs: last 4 digits only.

    None / empty -> '<missing>'. Fewer than 4 digits -> '***'.
    Strips non-digits before slicing so '050-123-4567', '+972501234567',
    and '0501234567' all yield '***4567'.
    """
    if not phone:
        return "<missing>"
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return "***"
    return f"***{digits[-4:]}"


# ---------------------------------------------------------------------------
# MEH-2974 — bearer tokens that travel in a URL path
# ---------------------------------------------------------------------------

import re  # noqa: E402 — kept beside the only block that uses it

# Three shapes, and the repo already encodes exactly these three on the client
# (frontend/lib/claim-token.js). This is the SERVER half, which was missing:
# Sentry's `request_info.url` and the `route` tag are bound from the raw path
# in middleware.py, and `before_send` does no URL redaction — so a sampled
# trace or any captured exception on one of these routes shipped a live
# credential to a third-party processor. Railway's access log keeps its own
# copy; that one is not ours to scrub, and it is recorded as a residual risk.
#
# `producer_claim.py:76-81` is the written decision this restores on the
# server side: it moved the claim preview to a POST specifically so the token
# would stay out of "Railway access logs and the Sentry request context".
#
# The 40-character floor on the two `token_urlsafe` shapes is deliberate and
# matches the client: it is what keeps a build artifact
# (`owner-invite/[token]/page-8f21c0.js`) from being rewritten, so stack frames
# keep pointing at their source.
#
# DO NOT loosen a pattern to "anything after the prefix" — that is the change
#        that silently turns every frame from these routes into `[token]`.
_URL_TOKEN_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # /claim/<compact JWT> — three base64url segments, header always "eyJ".
    (re.compile(r"/claim/eyJ[\w-]*\.[\w-]+\.[\w-]+"), "/claim/[token]"),
    # /owner-invite/<token_urlsafe(32)> — the page, and /auth/owner-invite/…,
    # which this matches as a substring.
    (re.compile(r"/owner-invite/[\w-]{40,}"), "/owner-invite/[token]"),
    # /registration(s)/<token_urlsafe(32)> — the sign-up cancel link.
    (re.compile(r"(/registrations?)/[\w-]{40,}"), r"\1/[token]"),
)


def redact_url_tokens(value: str | None) -> str | None:
    """Replace any bearer token carried in a URL path with `[token]`.

    Takes and returns the value unchanged when it is not a string, so a caller
    can wrap a field whose type it does not control without a guard of its own.
    """
    if not isinstance(value, str):
        return value
    for pattern, replacement in _URL_TOKEN_PATTERNS:
        value = pattern.sub(replacement, value)
    return value
