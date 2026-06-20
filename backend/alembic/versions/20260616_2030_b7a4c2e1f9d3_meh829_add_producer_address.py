"""meh829 add producer address

Revision ID: b7a4c2e1f9d3
Revises: 382128b23383
Create Date: 2026-06-16 20:30:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7a4c2e1f9d3'
down_revision: Union[str, None] = '382128b23383'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('producers', sa.Column('address', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('producers', 'address')
