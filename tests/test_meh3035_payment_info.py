"""MEH-3035 chunk 1 — producers.payment_info (how a business takes payment).

Shape (JSONB, nullable): {"methods": [...], "timing": str | None, "note": str | None}
  methods  subset of PAYMENT_METHODS, unique, order normalised to the list order
  timing   one of PAYMENT_TIMINGS, or None
  note     optional free line, stripped, ≤ 80 chars, ≥ 3 letters (MEH-555)
An all-empty value is stored as NULL (= the business said nothing).
Chunk 1 is the column, the validator and the public read. The owner write
path opens in chunk 2 with the dashboard editor (producer_me standing rule).
"""
import pytest
from pydantic import ValidationError
from sqlalchemy import inspect

from conftest import make_producer
from app.schemas.schemas import PAYMENT_METHODS, PAYMENT_TIMINGS, ProducerUpdate


def _upd(v):
    return ProducerUpdate(payment_info=v).payment_info


def test_column_exists_and_is_nullable_jsonb(db):
    cols = {c["name"]: c for c in inspect(db.get_bind()).get_columns("producers")}
    assert "payment_info" in cols
    assert cols["payment_info"]["nullable"] is True
    assert "JSON" in str(cols["payment_info"]["type"]).upper()


def test_the_fixed_lists_are_the_approved_ones():
    assert PAYMENT_METHODS == ("bit", "paybox", "bank_transfer", "cash", "credit_card")
    assert PAYMENT_TIMINGS == ("advance", "on_pickup", "deposit")


def test_none_clears():
    assert _upd(None) is None


def test_valid_value_is_normalised():
    out = _upd({"methods": ["cash", "bit", "cash"], "timing": "deposit", "note": "  מקדמה של 30% בהזמנה  "})
    assert out == {"methods": ["bit", "cash"], "timing": "deposit", "note": "מקדמה של 30% בהזמנה"}


def test_all_empty_is_stored_as_null():
    assert _upd({"methods": [], "timing": None, "note": "   "}) is None
    assert _upd({}) is None


def test_select_all_is_five_methods():
    out = _upd({"methods": list(reversed(PAYMENT_METHODS))})
    assert out == {"methods": list(PAYMENT_METHODS), "timing": None, "note": None}


@pytest.mark.parametrize(
    "bad",
    [
        {"methods": ["paypal"]},
        {"methods": "bit"},
        {"methods": ["bit"] * 6 + ["cash"] * 0 + ["bitcoin"]},
        {"timing": "later"},
        {"note": "א" * 81},
        {"note": "12345"},
        {"color": "red"},
        ["bit"],
        "bit",
    ],
)
def test_invalid_values_are_422(bad):
    with pytest.raises(ValidationError):
        _upd(bad)


def test_note_at_80_chars_is_accepted():
    note = "מקדמה " + "א" * 74
    assert len(note) == 80
    assert _upd({"note": note})["note"] == note


def test_public_detail_returns_payment_info(client, db):
    p = make_producer(db)
    p.payment_info = {"methods": ["bit", "cash"], "timing": "on_pickup", "note": None}
    db.commit()
    r = client.get(f"/producers/{p.id}")
    assert r.status_code == 200, r.text
    assert r.json()["payment_info"] == {"methods": ["bit", "cash"], "timing": "on_pickup", "note": None}


def test_public_detail_null_when_unset(client, db):
    p = make_producer(db)
    r = client.get(f"/producers/{p.id}")
    assert r.json()["payment_info"] is None
