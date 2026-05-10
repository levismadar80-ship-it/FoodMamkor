"""MEH-556 — Extend MEH-555 letter validation to 3 sibling fields.

Tests for ProducerCreate.name, HomeProductCreate.title,
ExperienceCreate.title — all must reject strings with fewer than
3 Hebrew/Latin letter characters.

Note: these are schema-layer tests that don't require HTTP endpoints,
avoiding the local .env jwt_secret_key conflict (CI has no .env file).
"""
import pytest
from pydantic import ValidationError


# ---------- ProducerCreate.name ----------


def test_producer_name_junk_rejected(client):
    """'???' has 0 letter chars → 422 from /auth/register/producer."""
    r = client.post(
        "/auth/register/producer",
        json={
            "email": "test_junk@example.com",
            "name": "Valid Name",
            "password": "SecurePass12!",
            "producer_name": "???",
            "primary_contact_method": "whatsapp",
            "phone": "+972501234567",
        },
    )
    assert r.status_code == 422


def test_producer_name_valid_accepted(client):
    """'מאפיית רחל' has many letter chars → 201."""
    r = client.post(
        "/auth/register/producer",
        json={
            "email": "valid_bakery@example.com",
            "name": "Valid Name",
            "password": "SecurePass12!",
            "producer_name": "מאפיית רחל",
            "primary_contact_method": "whatsapp",
            "phone": "+972501234568",
        },
    )
    assert r.status_code == 201


# ---------- HomeProductCreate.title ----------


def test_home_product_title_junk_rejected(client):
    """'???' has 0 letter chars → 422 from /home-products."""
    # Must be logged in as a user — register first
    reg = client.post(
        "/auth/register",
        json={"email": "hp_junk@example.com", "name": "Test User", "password": "SecurePass12!"},
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    r = client.post(
        "/home-products",
        json={"title": "???", "price": "10.00"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_home_product_title_valid_accepted(client):
    """'לחם שיפון' has letter chars → created (201 or 200)."""
    reg = client.post(
        "/auth/register",
        json={"email": "hp_valid@example.com", "name": "Test User", "password": "SecurePass12!"},
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    r = client.post(
        "/home-products",
        json={"title": "לחם שיפון", "price": "10.00"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code in (200, 201)


# ---------- ExperienceCreate.title ----------


def test_experience_title_junk_rejected(client):
    """'!?!?' has 0 letter chars → 422 from /experiences."""
    reg = client.post(
        "/auth/register",
        json={"email": "exp_junk@example.com", "name": "Test User", "password": "SecurePass12!"},
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    r = client.post(
        "/experiences",
        json={
            "title": "!?!?",
            "description": "תיאור ארוך מספיק עבור הוולידציה של השדה",
            "event_date": "2026-12-01",
            "location_type": "home",
            "city": "תל אביב",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_experience_title_valid_accepted(client):
    """'סדנת אפייה' has letter chars → created."""
    reg = client.post(
        "/auth/register",
        json={"email": "exp_valid@example.com", "name": "Test User", "password": "SecurePass12!"},
    )
    assert reg.status_code == 200
    token = reg.json()["access_token"]

    r = client.post(
        "/experiences",
        json={
            "title": "סדנת אפייה",
            "description": "תיאור ארוך מספיק עבור הוולידציה של השדה",
            "event_date": "2026-12-01",
            "location_type": "home",
            "city": "תל אביב",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code in (200, 201)
