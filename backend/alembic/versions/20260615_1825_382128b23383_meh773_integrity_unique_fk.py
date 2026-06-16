"""meh773_integrity_unique_fk

Revision ID: 382128b23383
Revises: 7346235e318b
Create Date: 2026-06-15 18:25:56.197051+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '382128b23383'
down_revision: Union[str, None] = '7346235e318b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_unique_constraint(
        "uq_report_reporter_producer", "reports", ["reporter_id", "producer_id"])
    op.create_unique_constraint(
        "uq_referral_one_per_referee", "referral_clicks", ["referee_id"])
    op.drop_constraint("users_producer_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key(
        "users_producer_id_fkey", "users", "producers",
        ["producer_id"], ["id"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("users_producer_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key(
        "users_producer_id_fkey", "users", "producers", ["producer_id"], ["id"])
    op.drop_constraint("uq_referral_one_per_referee", "referral_clicks", type_="unique")
    op.drop_constraint("uq_report_reporter_producer", "reports", type_="unique")