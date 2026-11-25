"""meh3735_group_buy_no_show

Revision ID: f3a7c91e2b64
Revises: d6a8b0c2e4f5
Create Date: 2026-11-24 13:00:00.000000+00:00

MEH-3735: «לא הגיע» for group buys, as rescue bags have it.

- group_buy_commits.pickup_code: four digits the participant shows at pickup.
  The business sees codes and quantities, never names (MEH-1651), the same
  trade as rescue_orders.pickup_code.
- group_buy_commits.handed_at / no_show_at: the business's mark after pickup.
  At most one is set (CHECK).
- users.group_buy_block_cleared_at: the admin release. The block is counted
  from no_show_at inside 30 days and after this moment, like
  rescue_block_cleared_at (b2e6d4a17c93).

Expand-only (ADR-007): four nullable columns, a UNIQUE and two CHECKs. The
previous container never reads them. Every existing commit gets a code here,
unique within its group; a commit inserted by the old container between this
upgrade and the new one serving has none, and the dashboard shows it without
a code (it can still be marked).

downgrade() drops all of it; the marks and the codes are lost.
"""

import secrets
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3a7c91e2b64"
down_revision: Union[str, None] = "d6a8b0c2e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backfill_codes() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, group_buy_id FROM group_buy_commits ORDER BY group_buy_id")
    ).fetchall()
    used: dict[str, set[str]] = {}
    for commit_id, group_id in rows:
        taken = used.setdefault(str(group_id), set())
        code = f"{secrets.randbelow(10000):04d}"
        while code in taken:
            code = f"{secrets.randbelow(10000):04d}"
        taken.add(code)
        conn.execute(
            sa.text("UPDATE group_buy_commits SET pickup_code = :c WHERE id = :i"),
            {"c": code, "i": commit_id},
        )


def upgrade() -> None:
    op.add_column(
        "group_buy_commits", sa.Column("pickup_code", sa.String(4), nullable=True)
    )
    op.add_column(
        "group_buy_commits", sa.Column("handed_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "group_buy_commits", sa.Column("no_show_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "users",
        sa.Column("group_buy_block_cleared_at", sa.DateTime(), nullable=True),
    )
    _backfill_codes()
    op.create_unique_constraint(
        "uq_group_buy_commits_code", "group_buy_commits", ["group_buy_id", "pickup_code"]
    )
    op.create_check_constraint(
        "group_buy_commits_pickup_code_check",
        "group_buy_commits",
        "pickup_code IS NULL OR pickup_code ~ '^[0-9]{4}$'",
    )
    op.create_check_constraint(
        "group_buy_commits_one_outcome_check",
        "group_buy_commits",
        "handed_at IS NULL OR no_show_at IS NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "group_buy_commits_one_outcome_check", "group_buy_commits", type_="check"
    )
    op.drop_constraint(
        "group_buy_commits_pickup_code_check", "group_buy_commits", type_="check"
    )
    op.drop_constraint("uq_group_buy_commits_code", "group_buy_commits", type_="unique")
    op.drop_column("users", "group_buy_block_cleared_at")
    op.drop_column("group_buy_commits", "no_show_at")
    op.drop_column("group_buy_commits", "handed_at")
    op.drop_column("group_buy_commits", "pickup_code")
