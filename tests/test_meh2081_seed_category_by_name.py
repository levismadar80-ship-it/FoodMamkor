"""MEH-2081 — seed() must resolve category ids BY NAME, never by position.

The bug: ``seed_categories`` inserts categories without explicit ids
(autoincrement, ``ON CONFLICT DO NOTHING`` on ``name``), while ``PRODUCERS``
hardcoded ``"category_ids": [1]``. Those two facts are only compatible on a
pristine database where the id sequence happens to start at 1 and has no holes.
``seed_categories``'s own docstring records staging having holes at ids 1, 5,
13, 15 with 'בשר' living at id 22 — so on that shape the literal ``1`` either
violates the FK or silently links the wrong category. Either way the exception
latches ``db_init_status="failed"`` (startup.py:167 → :193).

WHY THE CONSTRUCTION BELOW, AND NOT "DELETE CATEGORY 1"
------------------------------------------------------
The obvious test — remove id 1 and assert seed() raises — proves less than it
appears to. It passes against a hypothetical implementation that swallows the
FK error, and it depends on the engine enforcing FKs at all.

This test instead SHIFTS the id space with a decoy row, so the two
implementations disagree about *which category a producer is linked to* rather
than about whether an error is raised:

    old code  → links to category_id=1  → the DECOY  → wrong name  → FAILS
    new code  → resolves "בשר" by name  → correct id → PASSES

Deterministic, engine-independent, and it discriminates on the exact condition
that changed. Demonstrated failing against the pre-fix implementation before
this file was committed — see the PR body.
"""

import pytest

from app.models import Category, Producer, ProducerCategory
from seed_data import PRODUCERS, seed


# The decoy occupies whatever id the sequence hands out FIRST, so every real
# category is pushed past it. Name deliberately absent from CATEGORIES.
DECOY_NAME = "קטגוריית דמה MEH-2081"


@pytest.fixture
def _shifted_category_ids(db):
    """Insert a decoy category so no seeded category can land on the first id."""
    db.add(Category(name=DECOY_NAME, emoji="🚧"))
    db.commit()
    decoy = db.query(Category).filter(Category.name == DECOY_NAME).one()
    return decoy


def test_seed_links_producers_to_categories_by_name(db, _shifted_category_ids):
    """Every seeded producer links to the categories its entry NAMES."""
    decoy = _shifted_category_ids
    seed()

    # CONTROL — run it first and read it. If seed() produced no producers, every
    # assertion below is vacuously true and this file would report a green while
    # testing nothing.
    seeded = db.query(Producer).filter(Producer.slug.isnot(None)).all()
    by_slug = {p.slug: p for p in seeded}
    expected_slugs = {p["slug"] for p in PRODUCERS}
    assert expected_slugs <= by_slug.keys(), (
        "CONTROL FAILED: seed() did not create the sample producers "
        f"(missing {sorted(expected_slugs - by_slug.keys())}). "
        "Every assertion below is void."
    )

    id_to_name = {c.id: c.name for c in db.query(Category).all()}

    for entry in PRODUCERS:
        producer = by_slug[entry["slug"]]
        linked_ids = [
            row.category_id
            for row in db.query(ProducerCategory).filter(
                ProducerCategory.producer_id == producer.id
            )
        ]
        linked_names = sorted(id_to_name[cid] for cid in linked_ids)
        assert linked_names == sorted(entry["category_names"]), (
            f"{entry['slug']}: expected {sorted(entry['category_names'])}, "
            f"got {linked_names}"
        )

        # The decoy holds the id the old implementation hardcoded. Nothing may
        # link to it — this is the assertion the pre-fix code fails.
        assert decoy.id not in linked_ids, (
            f"{entry['slug']} linked to the decoy category (id {decoy.id}). "
            "That means the category id was assumed from list position rather "
            "than resolved by name — the MEH-2081 regression."
        )


def test_producers_declare_category_names_not_ids():
    """No entry may carry a hardcoded id. Guards the data, not just the loop.

    The resolution loop could be correct while a new PRODUCERS entry
    reintroduces `category_ids`, so the shape is asserted directly.
    """
    for entry in PRODUCERS:
        assert "category_ids" not in entry, (
            f"{entry['slug']}: 'category_ids' is a hardcoded id list. Use "
            "'category_names' — ids are autoincrement and the sequence has holes."
        )
        assert entry.get("category_names"), (
            f"{entry['slug']}: missing 'category_names'."
        )
        for name in entry["category_names"]:
            assert isinstance(name, str), (
                f"{entry['slug']}: category_names must be strings, got {name!r}."
            )


def test_seed_raises_on_unknown_category_name(db, monkeypatch):
    """A name absent from the categories table fails loud, never silently skips.

    A missing link would leave a producer uncategorised and invisible to the
    category filter — the failure mode worth a crash rather than a shrug.
    """
    import seed_data

    bogus = dict(PRODUCERS[0])
    bogus["category_names"] = ["קטגוריה שאינה קיימת בכלל"]
    monkeypatch.setattr(seed_data, "PRODUCERS", [bogus])

    with pytest.raises(ValueError, match="absent from the categories table"):
        seed_data.seed()
