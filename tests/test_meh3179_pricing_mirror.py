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


def _js_block(name: str) -> str:
    """The body of one `name: Object.freeze({ ... })` block in pricing.js."""
    found = re.search(rf"\b{name}: Object\.freeze\(\{{(.*?)\}}\)", JS, re.S)
    assert found, f"{name}: block not found in pricing.js"
    return found.group(1)


def _js_number(key: str, text: str = JS) -> int:
    found = re.findall(rf"\b{key}:\s*(\d+)", text)
    assert len(found) == 1, f"{key}: expected one value, got {found}"
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
    plain, subscriber = _js_block("commission"), _js_block("subscriberCommission")
    assert pl.paid_booking_percent == _js_number("paidBookingPercent", plain)
    assert (
        pl.rescue_bag_fee_agorot
        == _js_number("rescueBagFee", plain) * AGOROT_PER_SHEKEL
    )
    assert pl.subscriber_booking_percent == _js_number("paidBookingPercent", subscriber)
    assert (
        pl.subscriber_bag_fee_agorot
        == _js_number("rescueBagFee", subscriber) * AGOROT_PER_SHEKEL
    )
    assert "monthlyCap" not in JS  # Sapir 14/11: there is no monthly cap
    assert pl.threshold_paid_bookings_agorot == (
        _js_number("thresholdPaidBookingsPerMonth") * AGOROT_PER_SHEKEL
    )
    assert pl.trial_days == _js_number("trialDays")
    assert pl.notice_days == _js_number("noticeDays")
    assert pl.launch_joiner_months == _js_number("launchJoinerMonths")
    assert pl.dispute_days == _js_number("disputeDays")
    assert pl.price_change_notice_days == _js_number("priceChangeNoticeDays")


def test_backend_price_list_equals_the_document():
    pl = current_price_list()
    monthly = pl.subscription_monthly_agorot // AGOROT_PER_SHEKEL
    yearly = pl.subscription_yearly_agorot // AGOROT_PER_SHEKEL
    bag = pl.rescue_bag_fee_agorot // AGOROT_PER_SHEKEL
    assert f"| חודשי | {monthly} ₪ לחודש |" in DOC
    assert f"| שנתי | {yearly} ₪ לשנה" in DOC
    assert f"| הרשמה לאירוע בתשלום | {pl.paid_booking_percent}% ממחיר ההרשמה |" in DOC
    assert f"| שקית הצלה שנאספה | {bag} ₪ לשקית |" in DOC
    sub_bag = pl.subscriber_bag_fee_agorot // AGOROT_PER_SHEKEL
    assert (
        f"מנוי משלם עמלה מופחתת: {pl.subscriber_booking_percent}% במקום "
        f"{pl.paid_booking_percent}%" in DOC
    )
    assert f"ו-{sub_bag} ₪ לשקית במקום {bag} ₪" in DOC
    threshold = pl.threshold_paid_bookings_agorot // AGOROT_PER_SHEKEL
    assert f"הגיעו ל-{threshold} ₪ (הרשמות בתשלום" in DOC
    assert f"עמלה ב-{pl.trial_days} הימים הראשונים" in DOC
    assert f"{pl.notice_days} יום בכתב" in DOC
    assert f"ב-{pl.launch_joiner_months} החודשים הראשונים של החיוב" in DOC
    assert f"**ערעור על ספירה:** {pl.dispute_days} יום" in DOC
    assert f"**שינוי במחירון:** {pl.price_change_notice_days} יום" in DOC


def test_the_worked_example_on_the_price_list_is_what_the_ledger_computes():
    """The page shows exampleFee = price x percent / 100 (pricing.js); the
    ledger must reach the same figure from the same two numbers."""
    example = _js_number("exampleBookingPrice")
    percent = _js_number("paidBookingPercent", _js_block("commission"))
    shown_fee_agorot = example * percent  # (price * percent / 100) shekels, in agorot
    assert shown_fee_agorot > 0
    assert booking_fee_agorot(example * AGOROT_PER_SHEKEL) == shown_fee_agorot


def test_rounding_is_half_up_to_a_whole_agora():
    assert booking_fee_agorot(1990) == 100  # 99.5 → 100
    assert booking_fee_agorot(1980) == 99
    assert booking_fee_agorot(0) == 0
