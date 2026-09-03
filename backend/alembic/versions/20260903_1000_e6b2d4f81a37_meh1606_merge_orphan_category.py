"""MEH-1606: merge the orphan category «קרמים ושמנים» into «קוסמטיקה טבעית»
— re-point every FK first, delete the orphan row LAST.

Data-only migration — no DDL, no new table (EXPECTED_TABLES unchanged), no
column change.

Why the row exists: «קרמים ושמנים» is the pre-MEH-1098 NAME of the category
now called «קוסמטיקה טבעית». The MEH-1098 rename edited seed_data.CATEGORIES
only (name, not emoji — "🌸" on both sides), and the seed of that era was
name-keyed, so the next boot found no row named «קוסמטיקה טבעית», INSERTed a
fresh one, and left the old-named row alive beside it — the MEH-1104
duplicate (seed_data.py:296-301). MEH-1107 and MEH-1530 fixed the SEED so it
cannot happen again; neither touched the row that already existed. On
production it is `id 26` (docs/audits/2026-08-pre-launch-blockers.md:182) and
production therefore carries 19 categories where the taxonomy has 18.

Why it must be a merge and not a delete: `producer_categories.category_id`
is `ON DELETE CASCADE` (baseline ef8fb1858f5b:226, models.py:857-859). A bare
DELETE would silently unlink every business filed under the orphan. So:
re-point, prove zero references remain, and only then delete.

Phase 0 — every table with a FK to `categories.id`, at head:

  producer_categories.category_id   the ONLY live FK. Composite PK
                                    (producer_id, category_id) — baseline
                                    ef8fb1858f5b:228, models.py:852-859 —
                                    so a producer linked to BOTH rows makes a
                                    naive UPDATE violate the PK. Handled as
                                    delete-the-orphan-side-of-each-pair, then
                                    UPDATE the rest. It also carries
                                    `position` (f3a8c2d61e9b, MEH-1297:
                                    0 = primary), with NO unique on
                                    (producer_id, position); the survivor
                                    side of a pair inherits LEAST(position)
                                    so a business whose PRIMARY was the
                                    orphan keeps its primary, and the affected
                                    producers' positions are re-compacted to
                                    0..n-1 with the exact row_number() rule
                                    f3a8c2d61e9b:47-61 used.
  recipes.category_id               baseline ef8fb1858f5b:461-465 — the table
                                    was DROPPED by d7e3c9a82f5b (MEH-587) and
                                    has no model. Not at head; nothing to do.

Tables that name a category WITHOUT an FK — reported, deliberately left:
  category_requests.requested_name  free text a producer typed (models.py:
                                    1995); not a reference to a row.
  outreach_leads.category           String(100) free text (models.py:779).
  admin_settings                    key/value Text; no category key exists
                                    (grep over backend/app, 03/09).
  frontend/messages/he.json         copy keyed by SLUG ("cosmetics"), not by
                                    row — untouched by a row merge.

Category columns that could collide on merge: `name` UNIQUE
(categories_name_key) and `slug` UNIQUE (uq_categories_slug, a7c3e91d5f28).
Neither is written on the survivor here, so neither can collide on the way
UP. Both matter on the way DOWN — see downgrade().

Guards, all by NAME (ids differ per environment — seed_data.py:302-308):
  orphan absent                 -> no-op. staging and CI never had the row,
                                   so this revision is a logged no-op there.
  survivor absent, orphan here  -> RAISE. Nothing to merge into; a delete
                                   would be the MEH-1104 data loss.
  references remain after the   -> RAISE. The DELETE never runs on a row
  re-point                         something still points at.

Counts are logged through the alembic logger (97669fe803f5:36-41) so they
land in CI's `alembic upgrade head` output and Railway's boot log.

Prod expectation: `SELECT COUNT(*) FROM categories` reads exactly 18 after
apply. Sapir runs the FK counts (FK_COUNT_SQL below, with the orphan's id)
on production BEFORE apply; this revision is NOT merged by CC (drop-class,
ADR-007 R2).

Revision ID: e6b2d4f81a37
Revises: 7c1e2a9f4b3d
Create Date: 2026-09-03 10:00:00
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "e6b2d4f81a37"
down_revision: str | None = "7c1e2a9f4b3d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

logger = logging.getLogger("alembic.runtime.migration")

ORPHAN_NAME = "קרמים ושמנים"
SURVIVOR_NAME = "קוסמטיקה טבעית"

# What downgrade() re-creates. The slug is what a7c3e91d5f28's backfill gave
# the orphan (its name is not in NAME_TO_SLUG, so it was transliterated:
# _transliterate("קרמים ושמנים") == "krmym-vshmnym", verified 03/09). The emoji
# is the one the row was seeded with — MEH-1098 renamed "name only" (a0ce303d).
ORPHAN_SLUG = "krmym-vshmnym"
ORPHAN_EMOJI = "🌸"

# The count Sapir runs on production before apply, for each FK table. There is
# one FK table at head, so there is one query; keep it as a single string so
# the number in the boot log and the number in the Railway console are answers
# to the same question.
FK_COUNT_SQL = "SELECT COUNT(*) FROM producer_categories WHERE category_id = :cid"

# A producer linked to BOTH rows: the orphan-side row of each such pair.
PAIR_SQL = """
    SELECT o.producer_id, o.position
    FROM producer_categories o
    WHERE o.category_id = :orphan
      AND EXISTS (
          SELECT 1 FROM producer_categories s
          WHERE s.producer_id = o.producer_id AND s.category_id = :survivor
      )
"""


def _category_id(conn: Connection, name: str) -> int | None:
    return conn.execute(
        sa.text("SELECT id FROM categories WHERE name = :name"), {"name": name}
    ).scalar_one_or_none()


def _fk_count(conn: Connection, category_id: int) -> int:
    return conn.execute(sa.text(FK_COUNT_SQL), {"cid": category_id}).scalar_one()


def _resolve_pairs(conn: Connection, orphan: int, survivor: int) -> list:
    """Delete the orphan side of every both-linked pair, keeping the better
    (lower) position on the survivor side. Returns the affected producer ids."""
    ids = {"orphan": orphan, "survivor": survivor}
    pairs = conn.execute(sa.text(PAIR_SQL), ids).fetchall()
    if not pairs:
        return []
    # 0 = primary (MEH-1297). If the orphan WAS the primary, the survivor row
    # takes that slot rather than demoting the business's primary category.
    conn.execute(
        sa.text(
            """
            UPDATE producer_categories AS s
            SET position = LEAST(s.position, o.position)
            FROM producer_categories AS o
            WHERE s.producer_id = o.producer_id
              AND s.category_id = :survivor
              AND o.category_id = :orphan
            """
        ),
        ids,
    )
    conn.execute(
        sa.text(
            """
            DELETE FROM producer_categories o
            WHERE o.category_id = :orphan
              AND EXISTS (
                  SELECT 1 FROM producer_categories s
                  WHERE s.producer_id = o.producer_id
                    AND s.category_id = :survivor
              )
            """
        ),
        ids,
    )
    return [row.producer_id for row in pairs]


def _recompact_positions(conn: Connection, producer_ids: list) -> None:
    """f3a8c2d61e9b's 0..n-1 rule, restricted to the producers that just lost a
    row, so their remaining links have no hole where the orphan link was."""
    if not producer_ids:
        return
    conn.execute(
        sa.text(
            """
            UPDATE producer_categories AS pc
            SET position = sub.rn
            FROM (
                SELECT producer_id,
                       category_id,
                       row_number() OVER (
                           PARTITION BY producer_id
                           ORDER BY position, category_id
                       ) - 1 AS rn
                FROM producer_categories
                WHERE producer_id IN :ids
            ) AS sub
            WHERE pc.producer_id = sub.producer_id
              AND pc.category_id = sub.category_id
            """
        ).bindparams(sa.bindparam("ids", expanding=True)),
        {"ids": producer_ids},
    )


def merge_orphan_category(conn: Connection) -> dict:
    """The whole upgrade, on a plain connection so tests can drive it.

    Returns the counts it logged. `applied` is False on the no-op path."""
    orphan = _category_id(conn, ORPHAN_NAME)
    if orphan is None:
        logger.info("[MEH-1606] no category named %r — nothing to merge", ORPHAN_NAME)
        return {"applied": False}

    survivor = _category_id(conn, SURVIVOR_NAME)
    if survivor is None:
        raise RuntimeError(
            f"MEH-1606 aborted: {ORPHAN_NAME!r} (id {orphan}) is present but "
            f"{SURVIVOR_NAME!r} is not. There is nothing to merge into; "
            "seed the survivor (or rename the orphan) before applying."
        )

    before = _fk_count(conn, orphan)
    logger.info(
        "[MEH-1606] producer_categories rows on orphan id %s before: %s",
        orphan,
        before,
    )

    pair_producers = _resolve_pairs(conn, orphan, survivor)
    moved = conn.execute(
        sa.text(
            "UPDATE producer_categories SET category_id = :survivor "
            "WHERE category_id = :orphan"
        ),
        {"orphan": orphan, "survivor": survivor},
    ).rowcount
    _recompact_positions(conn, pair_producers)

    remaining = _fk_count(conn, orphan)
    if remaining:
        raise RuntimeError(
            f"MEH-1606 aborted: {remaining} producer_categories row(s) still "
            f"reference orphan id {orphan} after the re-point; refusing to DELETE."
        )

    deleted = conn.execute(
        sa.text("DELETE FROM categories WHERE id = :orphan"), {"orphan": orphan}
    ).rowcount
    if deleted != 1:
        raise RuntimeError(
            f"MEH-1606 aborted: expected to delete exactly 1 category row "
            f"(id {orphan}), deleted {deleted}."
        )

    stats = {
        "applied": True,
        "orphan_id": orphan,
        "survivor_id": survivor,
        "links_before": before,
        "pairs_collapsed": len(pair_producers),
        "links_moved": moved,
    }
    logger.info(
        "[MEH-1606] merged %r (id %s) into %r (id %s): %s link(s) before, "
        "%s both-linked pair(s) collapsed, %s link(s) re-pointed, orphan deleted",
        ORPHAN_NAME,
        orphan,
        SURVIVOR_NAME,
        survivor,
        before,
        len(pair_producers),
        moved,
    )
    return stats


def upgrade() -> None:
    merge_orphan_category(op.get_bind())


def downgrade() -> None:
    """Re-create the orphan ROW only.

    The original id (26 on production) cannot come back: `categories.id` is
    an autoincrement sequence that has moved on, and forcing a value into it
    would be exactly the id-keyed assumption MEH-1107 made and MEH-1530
    removed. The links are NOT moved back either — after the upgrade they are
    indistinguishable from links that always pointed at the survivor, so any
    "restore" would be a guess. Same conclusion as 97669fe803f5 / 7c1e2a9f4b3d:
    a documented partial revert, not a silent one.
    """
    conn = op.get_bind()
    if _category_id(conn, ORPHAN_NAME) is not None:
        logger.info("[MEH-1606] downgrade: %r already present — no-op", ORPHAN_NAME)
        return
    # `slug` is NOT NULL + UNIQUE. The backfilled value is free again once the
    # orphan is gone; if something else claimed it meanwhile, step aside rather
    # than fail the rollback over a display-only identifier.
    slug = ORPHAN_SLUG
    taken = conn.execute(
        sa.text("SELECT 1 FROM categories WHERE slug = :slug"), {"slug": slug}
    ).scalar_one_or_none()
    if taken:
        slug = f"{ORPHAN_SLUG}-restored"
    conn.execute(
        sa.text(
            "INSERT INTO categories (name, slug, emoji) VALUES (:name, :slug, :emoji)"
        ),
        {"name": ORPHAN_NAME, "slug": slug, "emoji": ORPHAN_EMOJI},
    )
    logger.info(
        "[MEH-1606] downgrade: re-created %r (new id, no links restored)",
        ORPHAN_NAME,
    )
