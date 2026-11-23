"""
Module:   money
Purpose:  Agorot ↔ shekels for order and rescue code: a shekel Decimal as
          whole agorot, and agorot as the short text an email shows.
Does NOT: the billing ledger's conversion (None → 0, clamped at 0, half-up):
          that stays `shekels_to_agorot` in app/services/billing_ledger.py,
          which is under mutation testing and is different on purpose.
Related:  app/pricing.py AGOROT_PER_SHEKEL (the one constant).
History:  MEH-3715 (creation; folded `_agorot` ×2 and `shekels`/`_shekels`).
"""

from decimal import Decimal

from app.pricing import AGOROT_PER_SHEKEL


def agorot_of(shekels: Decimal) -> int:
    """Decimal("12.50") → 1250 (banker's rounding, as both callers had)."""
    return int((shekels * AGOROT_PER_SHEKEL).to_integral_value())


def shekels_text(agorot: int) -> str:
    """1500 → "15", 1250 → "12.50" — no trailing ".00" on a round price."""
    whole, rest = divmod(int(agorot), AGOROT_PER_SHEKEL)
    return str(whole) if rest == 0 else f"{whole}.{rest:02d}"
