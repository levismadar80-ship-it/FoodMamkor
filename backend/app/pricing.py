"""
Module:   pricing
Purpose:  The server's copy of the price list (ADR-042) and the two fee
          calculations the billing ledger needs. Money is in agorot, as ints.
Touches:  nothing — pure data and pure functions.
Does NOT: charge anyone (nothing is billed in the launch phase), own the
          WORDS (frontend/messages) or the rules (ADR-042). The numbers here
          mirror `frontend/lib/pricing.js` and `docs/PRICING.md`;
          tests/test_meh3179_pricing_mirror.py fails when the three differ.
Related:  frontend/lib/pricing.js (the site's copy) · docs/PRICING.md ·
          app/services/billing_ledger.py (the only caller).
History:  MEH-3179 (creation, 2026-11-14).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

AGOROT_PER_SHEKEL: Final = 100


@dataclass(frozen=True)
class PriceList:
    version: int
    effective_from: str
    subscription_monthly_agorot: int
    subscription_yearly_agorot: int
    paid_booking_percent: int
    rescue_bag_fee_agorot: int
    # A subscriber pays the subscription and these reduced rates (no monthly cap).
    subscriber_booking_percent: int
    subscriber_bag_fee_agorot: int
    # A month is billed only when its PAID bookings reached this amount.
    threshold_paid_bookings_agorot: int
    notice_days: int
    # MEH-3197: months a launch-period joiner pays the subscriber's rates
    # without a subscription; days to report a wrong count; notice of a change.
    launch_joiner_months: int
    dispute_days: int
    price_change_notice_days: int
    # Days without commission for a business that joins after charging started.
    trial_days: int


# DO NOT edit a version a business may already have agreed to — add a new
# entry and move CURRENT_PRICE_LIST_VERSION (same rule as lib/pricing.js).
PRICE_LISTS: Final[dict[int, PriceList]] = {
    1: PriceList(
        version=1,
        effective_from="2026-11-14",
        subscription_monthly_agorot=49 * AGOROT_PER_SHEKEL,
        subscription_yearly_agorot=490 * AGOROT_PER_SHEKEL,
        paid_booking_percent=5,
        rescue_bag_fee_agorot=2 * AGOROT_PER_SHEKEL,
        subscriber_booking_percent=2,
        subscriber_bag_fee_agorot=1 * AGOROT_PER_SHEKEL,
        threshold_paid_bookings_agorot=1000 * AGOROT_PER_SHEKEL,
        notice_days=60,
        launch_joiner_months=12,
        dispute_days=14,
        price_change_notice_days=60,
        trial_days=90,
    ),
}

CURRENT_PRICE_LIST_VERSION: Final = 1

# THE SWITCH (MEH-3180). "launch" = nothing is billed and every paid tool is
# open to every business, whatever its billing state. "billing" = a business
# whose state is `page_only` or `unpaid` cannot open NEW paid bookings
# (app/services/capabilities.py). It is a constant on purpose, not an
# environment variable: turning billing on is a reviewed change with Sapir's
# approval, never a setting someone flips in a console.
# Typed `str`, not Final: tests switch it on to prove the gate closes.
BILLING_PHASE: str = "launch"
BILLING_PHASES: Final = ("launch", "billing")


def billing_is_on() -> bool:
    return BILLING_PHASE == "billing"


def current_price_list() -> PriceList:
    return PRICE_LISTS[CURRENT_PRICE_LIST_VERSION]


def booking_fee_agorot(base_agorot: int, price_list: PriceList | None = None) -> int:
    """The commission on one paid booking, rounded half up to a whole agora."""
    pl = price_list or current_price_list()
    if base_agorot <= 0:
        return 0
    return (base_agorot * pl.paid_booking_percent + 50) // 100


def rescue_bag_fee_agorot(quantity: int, price_list: PriceList | None = None) -> int:
    """The fixed fee for `quantity` collected rescue bags."""
    pl = price_list or current_price_list()
    return max(quantity, 0) * pl.rescue_bag_fee_agorot


def subscriber_booking_fee_agorot(
    base_agorot: int, price_list: PriceList | None = None
) -> int:
    """The reduced commission a subscriber pays on one paid booking."""
    pl = price_list or current_price_list()
    if base_agorot <= 0:
        return 0
    return (base_agorot * pl.subscriber_booking_percent + 50) // 100


def subscriber_bag_fee_agorot(
    quantity: int, price_list: PriceList | None = None
) -> int:
    """The reduced fixed fee a subscriber pays for `quantity` collected bags."""
    pl = price_list or current_price_list()
    return max(quantity, 0) * pl.subscriber_bag_fee_agorot
