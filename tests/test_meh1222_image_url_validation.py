"""MEH-1222 — malformed image URLs rejected at the write boundary.

Console showed a 404 storm through next/image on obviously-invalid image
sources ("bread.jpg", "http.ad.jpg", "https://bread.jpg") that had been
accepted into image fields with no validation. These pure-Pydantic tests
prove the write-path schemas now reject that garbage while still accepting
real (Cloudinary) URLs. No HTTP, no DB, no auth fixtures required.

The validator is stronger than the existing http(s)-scheme guard: it also
rejects a bare filename pasted as the host (netloc ending in an image
extension) — the "https://bread.jpg" class the scheme check alone lets
through — while a real Cloudinary URL (extension in the PATH) passes.
"""
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.schemas import (
    EventCreate,
    ExperienceCreate,
    HomeProductCreate,
    ProducerRecipeCreate,
    ProducerUpdate,
    ProductCreate,
)

GOOD = "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg"
# The three evidence strings from the ticket + a no-scheme filename.
BAD_URLS = ["bread.jpg", "http.ad.jpg", "https://bread.jpg", "ftp://x.com/a.jpg"]


# ---------- ProductCreate.image_url (scalar) ----------


def _product(image_url):
    return ProductCreate(name="לחם", price_min=Decimal("10"), image_url=image_url)


@pytest.mark.parametrize("bad", BAD_URLS)
def test_product_image_url_junk_rejected(bad):
    with pytest.raises(ValidationError):
        _product(bad)


def test_product_image_url_valid_accepted():
    assert _product(GOOD).image_url == GOOD


def test_product_image_url_empty_becomes_none():
    assert _product("").image_url is None
    assert _product(None).image_url is None


# ---------- ProducerUpdate.images (list) ----------


def test_producer_images_list_rejects_any_bad_member():
    with pytest.raises(ValidationError):
        ProducerUpdate(images=[GOOD, "https://bread.jpg"])


def test_producer_images_list_accepts_valid_and_drops_blanks():
    obj = ProducerUpdate(images=[GOOD, "", "  "])
    assert obj.images == [GOOD]


# ---------- HomeProductCreate.photo + .images (public form) ----------


def test_home_product_photo_junk_rejected():
    with pytest.raises(ValidationError):
        HomeProductCreate(title="לחם שיפון", photo="bread.jpg")


def test_home_product_images_junk_rejected():
    with pytest.raises(ValidationError):
        HomeProductCreate(title="לחם שיפון", images=["https://bread.jpg"])


def test_home_product_valid_accepted():
    obj = HomeProductCreate(title="לחם שיפון", photo=GOOD, images=[GOOD])
    assert obj.photo == GOOD and obj.images == [GOOD]


# ---------- ExperienceCreate / EventCreate / ProducerRecipeCreate ----------


def test_experience_image_url_junk_rejected():
    with pytest.raises(ValidationError):
        ExperienceCreate(
            title="סדנת אפייה",
            description="תיאור ארוך מספיק עבור הוולידציה של השדה",
            event_date=date(2026, 12, 1),
            location_type="home",
            image_url="https://bread.jpg",
        )


def test_event_image_url_junk_rejected():
    with pytest.raises(ValidationError):
        EventCreate(title="אירוע קהילתי", category="בישול", image_url="bread.jpg")


def test_recipe_image_url_junk_rejected():
    with pytest.raises(ValidationError):
        ProducerRecipeCreate(
            title="עוגת שוקולד",
            ingredients="קמח, סוכר, ביצים, שוקולד",
            instructions="לערבב את כל החומרים ולאפות כחצי שעה",
            image_url="http.ad.jpg",
        )


def test_recipe_image_url_valid_accepted():
    obj = ProducerRecipeCreate(
        title="עוגת שוקולד",
        ingredients="קמח, סוכר, ביצים, שוקולד",
        instructions="לערבב את כל החומרים ולאפות כחצי שעה",
        image_url=GOOD,
    )
    assert obj.image_url == GOOD
