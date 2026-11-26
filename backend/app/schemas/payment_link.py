"""
Module:   payment_link
Purpose:  The business's own prepay link inside producers.payment_info
          (MEH-3895, option A of docs/research/rescue-prepay-2026-11.md): one
          validator for the write, one reader that says when a buyer is shown it.
Does NOT: move money or check that the link pays anything. The money goes from
          the buyer straight to the business (Bit / PayBox / its own clearing);
          Mehamakor never holds it. The rest of payment_info is validated in
          schemas._payment_info_validator.
Related:  backend/app/schemas/schemas.py _payment_info_validator ·
          frontend/lib/payment-info.js (prepayLink, the same rule client-side)
History:  MEH-3895 (creation)
"""

from typing import Any
from urllib.parse import urlsplit

PAYMENT_LINK_MAX = 300
# The two timings in which money moves before pickup. On «באיסוף» a link would
# tell the buyer to pay for something she pays for at the counter.
PREPAY_TIMINGS = ("advance", "deposit")


def payment_link(raw: Any) -> str | None:
    """Normalise the optional link; None when empty. 422 (ValueError) on
    anything that is not a plain https URL a buyer can safely be sent to.

    https only: no javascript:/data:, no http (the page is https and the link
    carries a payment). No user:password@ part, which is how a link shows one
    host and opens another. Any host: Bit, PayBox, Morning, PayPlus and the
    business's own clearing all issue links, and a closed list would turn away
    a real one. Every business is approved by hand, and the page prints the
    host next to the button, so the buyer sees where she is sent.
    """
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("הקישור לתשלום חייב להיות טקסט")
    link = raw.strip()
    if not link:
        return None
    if len(link) > PAYMENT_LINK_MAX:
        raise ValueError(f"הקישור לתשלום ארוך מדי (עד {PAYMENT_LINK_MAX} תווים)")
    if any(c.isspace() for c in link):
        raise ValueError("בקישור לתשלום אסור שיהיו רווחים")
    parts = urlsplit(link)
    if parts.scheme.lower() != "https" or not parts.hostname or "." not in parts.hostname:
        raise ValueError("הקישור לתשלום צריך להתחיל ב-https://")
    if parts.username or parts.password:
        raise ValueError("הקישור לתשלום לא יכול לכלול שם משתמש או סיסמה")
    return link


def prepay_link(info: Any) -> str | None:
    """The link a buyer is shown, or None: only a stored link, and only when
    the business said the money is paid before pickup."""
    if not isinstance(info, dict):
        return None
    link = info.get("link")
    if not isinstance(link, str) or not link:
        return None
    return link if info.get("timing") in PREPAY_TIMINGS else None


def payment_link_host(link: str | None) -> str | None:
    """The host printed beside the button («דרך www.bitpay.co.il»)."""
    if not link:
        return None
    host = urlsplit(link).hostname
    return host.removeprefix("www.") if host else None
