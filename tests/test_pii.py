"""MEH-303: pytest for mask_phone PII helper."""
from app.utils.pii import mask_phone


def test_mask_phone_none():
    assert mask_phone(None) == "<missing>"


def test_mask_phone_empty():
    assert mask_phone("") == "<missing>"


def test_mask_phone_too_short():
    assert mask_phone("12") == "***"


def test_mask_phone_israeli_mobile():
    assert mask_phone("0501234567") == "***4567"


def test_mask_phone_international():
    assert mask_phone("+972501234567") == "***4567"


def test_mask_phone_with_separators():
    assert mask_phone("050-123-4567") == "***4567"
