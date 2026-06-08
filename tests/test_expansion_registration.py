"""Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B4.

Registration flow gaps NOT already covered by test_producer_license.py
(empty-string license) or test_producer_declaration.py (declaration in
isolation):
  - whitespace-only license treated as missing (RG-3 — only "" is tested
    today, not "   ");
  - the declaration guard fires INDEPENDENTLY of license validity and
    BEFORE it (auth.py:424 precedes :433) — a combination not exercised.

Backend tests — CI Postgres is the healer.
"""
from tests.conftest import make_category

BAKERY = "לחמים ואפייה"  # license-required category
LICENSE_REQUIRED_HE = "מספר רישיון יצרן חובה לקטגוריה זו"
DECLARATION_REQUIRED_HE = "יש לאשר את הצהרת הרישוי כדי להמשיך"


def _payload(category_ids, *, license_number=None, declaration_accepted=True,
             email="exp@example.com"):
    body = {
        "email": email,
        "name": "יצרנית",
        "password": "Zx7Yp9Mq2Lr4",
        "producer_name": "עסק הרחבה",
        "phone": "0501234567",
        "category_ids": category_ids,
        "primary_contact_method": "whatsapp",
        "declaration_accepted": declaration_accepted,
    }
    if license_number is not None:
        body["producer_license_number"] = license_number
    return body


def test_whitespace_only_license_treated_as_missing(client, db):
    """A license of "   " is normalized to "not supplied" → 422.

    Kills RG-3: a guard that only checks `== ""` (not `.strip()`) would let
    whitespace through. Existing suite tests "" but not "   ".
    """
    bakery = make_category(db, name=BAKERY, emoji="🍞")
    resp = client.post(
        "/auth/register/producer",
        json=_payload([bakery.id], license_number="   ",
                      email="ws-license@example.com"),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == LICENSE_REQUIRED_HE


def test_declaration_guard_fires_even_with_valid_license(client, db):
    """declaration_accepted=False → 422 even when a valid license IS present.

    Proves the declaration guard (auth.py:424) is independent of, and runs
    before, the license guard (auth.py:433). Kills RG-1 when stacked with a
    satisfied license (the existing declaration test only checks it in
    isolation with no license context).
    """
    bakery = make_category(db, name=BAKERY, emoji="🍞")
    resp = client.post(
        "/auth/register/producer",
        json=_payload([bakery.id], license_number="1234567",
                      declaration_accepted=False,
                      email="decl-first@example.com"),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == DECLARATION_REQUIRED_HE
