"""
Module:   test_category_slug
Purpose:  Pin the three branches of `slug_for_name` and the two collision
          resolvers. Before this file the only evidence that the
          transliteration and SHA1 paths worked was a throwaway probe in a
          session scratchpad — which proved the change and left nothing behind.
Touches:  DB only in the two collision tests (`db` fixture).
Does NOT: cover the one-time backfill. That lives in revision a7c3e91d5f28 and
          carries its own copy of the fixed table on purpose (a migration must
          not import app code); `test_fixed_table_matches_the_revision` is the
          pin that keeps the two copies honest.
Related:  backend/app/services/category_slug.py
History:  MEH-2139 chunk 2 (creation, after the CI reviewer noted that the
          seeder's integration test reaches only the fixed-table branch —
          all 18 seeded names are in NAME_TO_SLUG).
"""

import os
import subprocess
import sys

import pytest

from app.models.models import Category
from app.services.category_slug import (
    NAME_TO_SLUG,
    SLUG_MAX,
    bulk_slugs,
    resolve_unique_slug,
    slug_for_name,
    transliterate,
)

# ── the three branches ───────────────────────────────────────────────────────


def test_fixed_table_branch_returns_the_frontend_token():
    """A seeded name resolves to the token the frontend uses as an i18n key.

    This is the branch the seeder's integration test already exercises; it is
    here so the three branches read as one table rather than being split
    across files.
    """
    assert slug_for_name("חלב וגבינות") == "dairy"
    assert slug_for_name("בשר") == "meat"
    # Whitespace is stripped before the lookup, so a padded name still hits it.
    assert slug_for_name("  דבש  ") == "honey"


def test_transliteration_branch_for_a_name_not_in_the_table():
    """An admin-created Hebrew name transliterates to ASCII.

    The assertion is on the PROPERTY (ascii, non-empty, no stray separators),
    not on one exact string — pinning the exact output would make every future
    table refinement a test edit, and the property is what callers rely on.
    """
    name = "גבינות עיזים"
    assert name not in NAME_TO_SLUG  # precondition, or this tests the wrong branch
    slug = slug_for_name(name)
    assert slug and slug.isascii()
    assert not slug.startswith("category-")  # i.e. it did NOT fall to SHA1
    assert not slug.startswith("-") and not slug.endswith("-")
    assert "--" not in slug


def test_sha1_branch_for_a_name_with_nothing_transliterable():
    """A punctuation-only name still gets a stable, non-empty slug.

    Returning "" here would push a NOT NULL violation onto a caller that cannot
    fix it — which is the whole reason this branch exists.
    """
    assert transliterate("!!!") == ""  # the precondition that forces the branch
    slug = slug_for_name("!!!")
    assert slug.startswith("category-")
    assert len(slug) > len("category-")


def test_final_forms_map_to_their_base_letter():
    """«ם» and «מ» transliterate identically — a word-final letter is the same
    letter. Without this, «שלום» and «שלומ» would produce different slugs."""
    assert transliterate("ם") == transliterate("מ")
    assert transliterate("ך") == transliterate("כ")
    assert transliterate("ן") == transliterate("נ")
    assert transliterate("ץ") == transliterate("צ")


def test_slug_never_exceeds_the_column_width():
    """VARCHAR(50). A slug longer than that is an IntegrityError at insert."""
    long_name = "גבינה " * 40
    assert len(slug_for_name(long_name)) <= SLUG_MAX


# ── the property the code comment CLAIMS, tested the only way that can fail ──


def test_sha1_fallback_is_stable_ACROSS_PROCESSES():
    """The SHA1 branch must survive a restart. Calling it twice in ONE process
    cannot show that.

    `slug_for_name` uses sha1 rather than `hash()` because Python randomises
    string hashing per process (PYTHONHASHSEED). An in-process assertion is
    green for BOTH implementations — `hash()` is perfectly stable within a
    single interpreter — so it would pass against the bug it exists to reject.
    This spawns two interpreters with *different, explicit* seeds instead.

    Measured while writing the module: three `hash("!!!")` runs returned
    47676004 / 50954049 / 13075338.
    """
    # Load the module BY FILE PATH rather than importing `app.services…`.
    # The module imports only `hashlib` and `re` — it does not need the `app`
    # package — so a package import would drag FastAPI and SQLAlchemy into two
    # fresh interpreters for nothing. That is not merely slow: it is CPU
    # contention, and `TestLoginTimingEqualization` (test_api.py) is a p95
    # latency assertion whose own docstring says a contended runner invalidates
    # the measurement. Measured on this machine: with the package-import form
    # in the same run, that test needed 1 rerun; with it absent, 0. Loading by
    # path also isolates the subject — the child cannot pass or fail for a
    # reason living in app startup.
    module_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "backend",
        "app",
        "services",
        "category_slug.py",
    )
    code = (
        "import importlib.util as u;"
        f"spec = u.spec_from_file_location('category_slug_child', {module_path!r});"
        "mod = u.module_from_spec(spec); spec.loader.exec_module(mod);"
        "print(mod.slug_for_name('!!!'))"
    )

    outs = []
    for seed in ("1", "999999"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        r = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
        )
        # CONTROL: a non-zero exit means the child never reached the function,
        # and two empty strings compare equal — a green that proves nothing.
        assert r.returncode == 0, f"child failed (seed={seed}): {r.stderr[-800:]}"
        out = r.stdout.strip()
        assert out.startswith("category-"), f"child printed {out!r}, not a SHA1 slug"
        outs.append(out)

    assert outs[0] == outs[1], (
        f"the fallback slug changed across interpreters ({outs[0]} vs {outs[1]}) — "
        "that is the `hash()` behaviour this branch exists to avoid"
    )


# ── the two collision resolvers ──────────────────────────────────────────────


def test_resolve_unique_slug_suffixes_only_on_a_real_collision(db):
    """No collision → the base slug, untouched. Collision → -2, -3, …"""
    assert resolve_unique_slug(db, "חלב וגבינות") == "dairy"

    db.add(Category(name="חלב וגבינות", emoji="🧀", slug="dairy"))
    db.commit()
    # A DIFFERENT name that maps to the same base must not be handed `dairy`.
    assert resolve_unique_slug(db, "חלב וגבינות") == "dairy-2"


def test_bulk_slugs_avoids_collisions_WITHIN_one_batch(db):
    """The seeder inserts 18 rows in one statement, so per-row resolution would
    not see its siblings. Two names that reduce to the same base must still
    come back distinct."""
    db.add(Category(name="חלב וגבינות", emoji="🧀", slug="dairy"))
    db.commit()

    out = bulk_slugs(db, ["חלב וגבינות", "בשר"])
    assert out["בשר"] == "meat"  # untouched — no collision
    assert out["חלב וגבינות"] == "dairy-2"  # the taken one was stepped over
    assert len(set(out.values())) == len(out)  # and nothing repeated


def test_bulk_slugs_returns_one_entry_per_input_name(db):
    """A dropped name would mean a row inserted with slug=None, which the
    NOT NULL constraint turns into an insert failure at seed time."""
    names = list(NAME_TO_SLUG)[:5]
    out = bulk_slugs(db, names)
    assert sorted(out) == sorted(names)
    assert all(out[n] for n in names)


# ── the two copies of the fixed table ────────────────────────────────────────


def test_fixed_table_matches_the_revision_copy():
    """`a7c3e91d5f28` carries its own copy of NAME_TO_SLUG because a migration
    must not import app code. That duplication is deliberate — this pins the
    two copies together so a future edit to one is caught here rather than by a
    category quietly falling out of the popular grid."""
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parent.parent
    matches = list(
        (root / "backend" / "alembic" / "versions").glob("*a7c3e91d5f28*.py")
    )
    # CONTROL: a renamed or deleted revision file makes `text` empty, and an
    # empty corpus satisfies every "is in" check below vacuously.
    assert len(matches) == 1, (
        f"expected exactly 1 chunk-1 revision, found {len(matches)}"
    )
    text = matches[0].read_text(encoding="utf-8")
    assert len(text) > 500, "revision file read back suspiciously short"

    for name, slug in NAME_TO_SLUG.items():
        assert name in text, f"{name!r} is in the service table but not in the revision"
        assert re.search(rf'["\']{re.escape(slug)}["\']', text), (
            f"slug {slug!r} is in the service table but not in the revision"
        )


@pytest.mark.parametrize("bad", ["", "   ", None])
def test_blank_names_still_produce_a_slug(bad):
    """`slug_for_name` is total. A blank name is a data problem, but returning
    None here would convert it into a NOT NULL violation at insert time, where
    the message names a constraint instead of the cause."""
    slug = slug_for_name(bad)
    assert slug and slug.startswith("category-")
