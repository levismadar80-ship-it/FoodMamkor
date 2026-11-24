"""
Module:   money
Purpose:  The agorot ↔ shekels conversions that order and rescue code shared as
          copies — one definition of each.
Does NOT: compute prices, fees or VAT (app/pricing.py, mutation-tested), and
          does not round to whole shekels for display (a different output, kept
          where it is used).
History:  MEH-3715 (creation: replaces _agorot in services/product_order_create.py
          and routers/product_order_offer.py, shekels in services/rescue_emails.py
          and _shekels in services/product_order_outbox.py — byte-identical copies).
"""

from decimal import Decimal

AGOROT_PER_SHEKEL = 100


def agorot_from_shekels(shekels: Decimal) -> int:
    """Decimal shekels → integer agorot. Rounds as Decimal.to_integral_value does
    (half-even), the behaviour of the two copies this replaces."""
    return int((shekels * AGOROT_PER_SHEKEL).to_integral_value())


def shekels_text(agorot: int) -> str:
    """1500 → "15", 1250 → "12.50" — no trailing ".00" on a round amount."""
    whole, rest = divmod(int(agorot), AGOROT_PER_SHEKEL)
    return str(whole) if rest == 0 else f"{whole}.{rest:02d}"
