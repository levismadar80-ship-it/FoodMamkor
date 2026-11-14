"""MEH-3179 — the server's price list equals the site's and the document's.

Three copies of the same numbers exist: `backend/app/pricing.py` (what the
ledger computes with), `frontend/lib/pricing.js` (what the site shows) and
`docs/PRICING.md` (what people read). `PricingCopyGuard.test.js` holds the
last two equal; this holds the first equal to both, so a price can't be
changed on the page and keep its old value in the ledger.
"""

import re
from pathlib import Path

from app.pricing import AGOROT_PER_SHEKEL, booking_fee_agorot, current_price_list

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "frontend" / "lib" / "pricing.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "PRICING.md").read_text(encoding="utf-8")


def _js_number(key: str) -> int:
    found = re.findall(rf"\b{key}:\s*(\d+)", JS)
    assert len(found) == 1, f"{key}: expected one value in pricing.js, got {found}"
    return int(found[0])


def test_the_reader_finds_the_numbers_it_is_asked_for():
    """Control: the regex reads real values, so an equality below means something."""
    assert _js_number("monthly") > 0
    assert re.search(r'effectiveFrom:\s*"\d{4}-\d{2}-\d{2}"', JS)


def test_backend_price_list_equals_the_sites():
    pl = current_price_list()
    assert pl.version == _js_number("version")
    assert pl.effective_from == re.search(r'effectiveFrom:\s*"([\d-]+)"', JS).group(1)
    assert pl.subscription_monthly_agorot == _js_number("monthly") * AGOROT_PER_SHEKEL
    assert pl.subscription_yearly_agorot == _js_number("yearly") * AGOROT_PER_SHEKEL
    assert pl.paid_booking_percent == _js_number("paidBookingPercent")
    assert pl.rescue_bag_fee_agorot == _js_number("rescueBagFee") * AGOROT_PER_SHEKEL
    assert pl.monthly_cap_agorot == _js_number("monthlyCap") * AGOROT_PER_SHEKEL
    assert pl.threshold_bookings_per_month == _js_number("thresholdBookingsPerMonth")
    assert pl.notice_days == _js_number("noticeDays")


def test_backend_price_list_equals_the_document():
    pl = current_price_list()
    monthly = pl.subscription_monthly_agorot // AGOROT_PER_SHEKEL
    yearly = pl.subscription_yearly_agorot // AGOROT_PER_SHEKEL
    bag = pl.rescue_bag_fee_agorot // AGOROT_PER_SHEKEL
    assert f"| חודשי | {monthly} ₪ לחודש |" in DOC
    assert f"| שנתי | {yearly} ₪ לשנה" in DOC
    assert f"| הרשמה לאירוע בתשלום | {pl.paid_booking_percent}% ממחיר ההרשמה |" in DOC
    assert f"| שקית הצלה שנאספה | {bag} ₪ לשקית |" in DOC
    assert f"מ-{pl.threshold_bookings_per_month} הזמנות ומעלה בחודש" in DOC
    assert f"{pl.notice_days} יום בכתב" in DOC


def test_the_worked_example_on_the_price_list_is_what_the_ledger_computes():
    example = _js_number("exampleBookingPrice")
    assert booking_fee_agorot(example * AGOROT_PER_SHEKEL) == 10 * AGOROT_PER_SHEKEL


def test_rounding_is_half_up_to_a_whole_agora():
    assert booking_fee_agorot(1990) == 100  # 99.5 → 100
    assert booking_fee_agorot(1980) == 99
    assert booking_fee_agorot(0) == 0
