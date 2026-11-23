"""MEH-3715: app/utils/money.py, which replaced two `_agorot` and two `shekels` copies."""

from decimal import Decimal

from app.utils.money import agorot_of, shekels_text


def test_agorot_of_whole_and_fraction():
    assert agorot_of(Decimal("15")) == 1500
    assert agorot_of(Decimal("12.50")) == 1250


def test_shekels_text_drops_round_decimals():
    assert shekels_text(1500) == "15"
    assert shekels_text(1250) == "12.50"
    assert shekels_text(1205) == "12.05"
