"""MEH-3401 — the frontend keys «קפה» by the slug "kph" (CategorySelector
REST_DESC_SLUGS, map-chips pantry group, rest_descs i18n key). The row is
created from the admin, so its slug comes from transliteration, never from the
frozen NAME_TO_SLUG table. If either side changes, the frontend keys go dead
without an error; this pins the value they rely on."""

from app.services.category_slug import NAME_TO_SLUG, slug_for_name


def test_coffee_is_not_in_the_frozen_table():
    # precondition: otherwise the slug below comes from the table, not
    # transliteration, and this tests the wrong branch
    assert "קפה" not in NAME_TO_SLUG


def test_coffee_slug_is_kph():
    assert slug_for_name("קפה") == "kph"
