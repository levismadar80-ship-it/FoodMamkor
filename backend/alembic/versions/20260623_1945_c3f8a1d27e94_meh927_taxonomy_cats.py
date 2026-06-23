"""meh927 taxonomy: merge wellness dupes + split meat/fish

Revision ID: c3f8a1d27e94
Revises: b7a4c2e1f9d3
Create Date: 2026-06-23 19:45:00.000000+00:00

MEH-927 category taxonomy consolidation (19 -> 18 rows):
  - DELETE 'תכשירי צמחים' + 'תוספי תזונה'  (overlap merged into the kept
    'צמחי מרפא ותוספים' row).
  - SPLIT 'בשר ודגים' -> 'בשר' + 'דגים'.

0 producers on all 3 deleted rows (confirmed on Railway, MEH-927). The
upgrade GUARD re-checks this at apply time and raises rather than letting
the producer_categories FK (ondelete=CASCADE) silently drop any link.

Deletes/inserts are keyed by NAME (not id) so the revision is immune to
seed-ordering id drift.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f8a1d27e94"
down_revision: Union[str, None] = "b7a4c2e1f9d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Rows removed by this revision (merge dupes + the combined meat/fish row).
_DELETED = ("תכשירי צמחים", "תוספי תזונה", "בשר ודגים")


def upgrade() -> None:
    bind = op.get_bind()
    # Fail-loud guard: refuse to delete a category any producer is linked to.
    linked = bind.execute(
        sa.text(
            "SELECT count(*) FROM producer_categories pc "
            "JOIN categories c ON c.id = pc.category_id "
            "WHERE c.name IN (:n1, :n2, :n3)"
        ),
        {"n1": _DELETED[0], "n2": _DELETED[1], "n3": _DELETED[2]},
    ).scalar()
    if linked:
        raise RuntimeError(
            f"MEH-927 aborted: {linked} producer_categories row(s) reference a "
            f"category slated for deletion {_DELETED}. Re-map those producers "
            "before running this migration."
        )

    bind.execute(
        sa.text("DELETE FROM categories WHERE name IN (:n1, :n2, :n3)"),
        {"n1": _DELETED[0], "n2": _DELETED[1], "n3": _DELETED[2]},
    )
    bind.execute(
        sa.text(
            "INSERT INTO categories (name, emoji) VALUES (:name, :emoji) "
            "ON CONFLICT (name) DO NOTHING"
        ),
        [{"name": "בשר", "emoji": "🥩"}, {"name": "דגים", "emoji": "🐟"}],
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("DELETE FROM categories WHERE name IN (:n1, :n2)"),
        {"n1": "בשר", "n2": "דגים"},
    )
    bind.execute(
        sa.text(
            "INSERT INTO categories (name, emoji) VALUES (:name, :emoji) "
            "ON CONFLICT (name) DO NOTHING"
        ),
        [
            {"name": "בשר ודגים", "emoji": "🥩"},
            {"name": "תכשירי צמחים", "emoji": "🌿"},
            {"name": "תוספי תזונה", "emoji": "💊"},
        ],
    )
