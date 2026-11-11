"""
Module:   resend_client
Purpose:  One place that configures the Resend SDK: the API key, and a 10 s
          HTTP timeout instead of the SDK's 30 s default. `requests` applies
          it twice — 10 s to connect, then 10 s of read INACTIVITY — so a
          stalled call is bounded at ~20 s, not 10 (no wall-clock cap; DNS is
          unbounded). Still well under the 30 + 30 it was.
Touches:  Resend (module-level `resend.api_key` and `resend.default_http_client`).
Does NOT: send anything — services/email.py sends mail and
          services/newsletter_sync.py manages contacts; both call this first.
Related:  docs/audits/2026-11-db-release-phase0.md (why a slow send matters:
          until MEH-2886 chunk 2, a background send held a DB connection for
          as long as Resend took); resend/http_client_requests.py (the SDK's
          `RequestsClient(timeout=30)`).
History:  MEH-2886 chunk 4 (creation).
"""

from __future__ import annotations

# MEH-2886: a code constant, not an env var — Sapir 10/11 ("10s timeout on
# Resend"). 10 s is well above a normal send (well under 1 s) and a third of
# the SDK default, so one stuck call ties up a worker thread for 10 s, not 30.
RESEND_TIMEOUT_SECONDS = 10


def configure_resend(api_key: str):
    """Set the key and the timeout, and return the SDK module.

    Idempotent: the HTTP client is replaced only when it is not already ours,
    so concurrent background tasks never swap it under each other.
    """
    import resend  # lazy import — only needed when a key is configured

    resend.api_key = api_key
    # getattr, not attribute access: several tests install a stub `resend`
    # module without these names, and a raise here would be swallowed by the
    # callers' fail-open and silently send nothing (MEH-2886 review). The same
    # guard keeps real mail flowing if a future SDK renames them — the stock
    # 30 s client is then simply left in place.
    stock_client_type = getattr(resend, "RequestsClient", None)
    client = getattr(resend, "default_http_client", None)
    # DO NOT widen to isinstance — only the SDK's own stock client is replaced;
    # a client someone else installed (or a subclass) is left alone.
    if (
        stock_client_type is not None
        and type(client) is stock_client_type
        and getattr(client, "_timeout", None) != RESEND_TIMEOUT_SECONDS
    ):
        resend.default_http_client = stock_client_type(timeout=RESEND_TIMEOUT_SECONDS)
    return resend
