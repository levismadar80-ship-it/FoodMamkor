"""MEH-3715 — one agorot ↔ shekels helper in the backend (app/utils/money.py).

The outputs below are the outputs of the copies it replaced; the last two
tests fail if a second local definition of either conversion comes back.
"""

import re
from decimal import Decimal
from pathlib import Path

import pytest

from app.utils.money import agorot_from_shekels, shekels_text

APP = Path(__file__).resolve().parents[1] / "backend" / "app"


@pytest.mark.parametrize(
    ("shekels", "agorot"),
    [
        (Decimal(0), 0),
        (Decimal(15), 1500),
        (Decimal("12.5"), 1250),
        (Decimal("12.34"), 1234),
        # half-even on the third decimal, as Decimal.to_integral_value rounds
        (Decimal("0.005"), 0),
        (Decimal("0.015"), 2),
    ],
)
def test_agorot_from_shekels(shekels: Decimal, agorot: int) -> None:
    assert agorot_from_shekels(shekels) == agorot


@pytest.mark.parametrize(
    ("agorot", "text"),
    [
        (0, "0"),
        (1500, "15"),
        (1250, "12.50"),
        (1205, "12.05"),
        (99, "0.99"),
        (100000, "1000"),
    ],
)
def test_shekels_text(agorot: int, text: str) -> None:
    assert shekels_text(agorot) == text


# Source text, not behaviour (testing.md MEH-3531): "a second copy exists" is a
# fact about the code, which nothing runs. The two conversions are run above.
def _sources() -> list[tuple[Path, str]]:
    return [
        (p, p.read_text(encoding="utf-8"))
        for p in APP.rglob("*.py")
        if p.name != "money.py"
    ]


def test_no_second_agorot_conversion() -> None:
    srcs = _sources()
    assert len(srcs) > 50, (
        "control: app/ sources not found — the scan is looking in the wrong place"
    )
    pattern = re.compile(r"\*\s*_?AGOROT_PER_SHEKEL\)\.to_integral_value\(\)")
    offenders = [str(p.relative_to(APP)) for p, s in srcs if pattern.search(s)]
    assert offenders == [], f"use app.utils.money.agorot_from_shekels: {offenders}"


def test_no_second_shekels_text() -> None:
    pattern = re.compile(r"divmod\(int\(agorot\),\s*(100|_?AGOROT_PER_SHEKEL)\)")
    offenders = [str(p.relative_to(APP)) for p, s in _sources() if pattern.search(s)]
    assert offenders == [], f"use app.utils.money.shekels_text: {offenders}"
