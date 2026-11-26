"""
Module:   prepay_copy
Purpose:  How a bag paid ahead through the business's own link (MEH-3895) is
          described in the reservation emails: the buyer's code email and its
          reminder, and the business's «נשמר סל» email (MEH-3897).
Does NOT: send anything, or import a service (rescue_emails imports this, so
          it stays a leaf). The refund notes are services/prepay_refunds.py.
Related:  app/schemas/payment_link.py::prepay_link · frontend messages/he.json
          «prepay» (the bag page's same lines)
History:  MEH-3897 (creation)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from app.schemas.payment_link import prepay_link


@dataclass(frozen=True)
class Prepay:
    """The business's link, read while the Session was open."""

    link: str
    deposit: bool

    @property
    def host(self) -> str:
        """Same rule as frontend/lib/payment-info.js linkHost."""
        host = urlsplit(self.link).hostname or ""
        return host[4:] if host.startswith("www.") else host


def prepay_from_info(info: Any) -> Prepay | None:
    """None unless the buyer is shown the link (payment_link.prepay_link)."""
    link = prepay_link(info)
    if link is None:
        return None
    return Prepay(
        link=link, deposit=isinstance(info, dict) and info.get("timing") == "deposit"
    )


# --- the copy lines for a reservation (the buyer's and the business's) ------


def buyer_pay_lines(p: Prepay, code: str, price: str) -> list[str]:
    """The buyer's code email (and its reminder), in place of «אומרים אותו
    בקופה ומשלמים X ₪». The ask / via / note lines are the bag page's
    (messages/he.json «prepay»), so the email and the page say the same."""
    ask = (
        f"הסל עולה {price} ₪. בית העסק מבקש מקדמה"
        if p.deposit
        else f"בית העסק מבקש לשלם מראש {price} ₪"
    )
    counter = (
        "בקופה אומרים את הקוד ומשלמים את היתרה."
        if p.deposit
        else "בקופה אומרים את הקוד ומקבלים את הסל."
    )
    return [
        f"{ask}. לתשלום: {p.link}",
        f"התשלום עובר ישירות לבית העסק, דרך {p.host}. "
        f"בהערה לתשלום כתבו את הקוד {code}, כדי שבית העסק ידע של מי התשלום.",
        counter,
    ]


def business_pay_line(p: Prepay, code: str, price: str) -> str:
    """The business's reservation email, in place of «בקופה אומרים את הקוד
    ומשלמים X ₪» — a business that asks for money ahead checks it arrived."""
    if p.deposit:
        return (
            f"קוד האיסוף: {code}. הסל עולה {price} ₪. ביקשנו לשלם מקדמה בקישור "
            "התשלום שלכם, עם הקוד בהערה לתשלום. את היתרה גובים בקופה."
        )
    return (
        f"קוד האיסוף: {code}. ביקשנו לשלם מראש {price} ₪ בקישור התשלום שלכם, "
        "עם הקוד בהערה לתשלום. אם התשלום לא התקבל, גובים אותו בקופה."
    )
