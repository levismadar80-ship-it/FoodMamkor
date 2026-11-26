"""MEH-3911 — «עוגות וקינוחים» (cakes and desserts) is created from the admin,
so its slug comes from transliteration, never from the frozen NAME_TO_SLUG
table. The frontend keys it by that slug (category-taxonomy, CategoryIcons,
CategorySelector REST_DESC_SLUGS, category_names / rest_descs i18n keys); if
either side changes, those keys go dead without an error. Same shape as
tests/test_meh3738_cooked_food_slug.py."""

from app.services.category_slug import NAME_TO_SLUG, slug_for_name


def test_cakes_is_not_in_the_frozen_table():
    # precondition: otherwise the slug below comes from the table, not
    # transliteration, and this tests the wrong branch
    assert "עוגות וקינוחים" not in NAME_TO_SLUG


def test_cakes_slug_is_the_transliteration():
    assert slug_for_name("עוגות וקינוחים") == "avgvt-vkynvchym"
