"""MEH-3738 — «בישול לפי הזמנה» (cooked to order) is created from the admin,
so its slug comes from transliteration, never from the frozen NAME_TO_SLUG
table. The frontend keys it by that slug (category-taxonomy, CategoryIcons,
CategorySelector REST_DESC_SLUGS, category_names / rest_descs i18n keys); if
either side changes, those keys go dead without an error. Same shape as
tests/test_meh3401_coffee_slug.py."""

from app.services.category_slug import NAME_TO_SLUG, slug_for_name


def test_cooked_food_is_not_in_the_frozen_table():
    # precondition: otherwise the slug below comes from the table, not
    # transliteration, and this tests the wrong branch
    assert "בישול לפי הזמנה" not in NAME_TO_SLUG


def test_cooked_food_slug_is_the_transliteration():
    assert slug_for_name("בישול לפי הזמנה") == "byshvl-lpy-hzmnh"
