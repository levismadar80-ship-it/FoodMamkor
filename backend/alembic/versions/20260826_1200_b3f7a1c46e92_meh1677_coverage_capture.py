"""MEH-1677: coverage-request city capture + coverage_cta_enabled opt-out.

Two columns, one revision, both nullable-safe for existing rows:

1. ``producer_whatsapp_clicks.city`` (String(60), NULL) -- the city a
   "לא מגיעים אליך?" click was asking about. NULL on every pre-existing row
   and on every ORDINARY WhatsApp click: only the coverage CTA sends a city,
   so NULL keeps its plain meaning of "not a coverage click" rather than
   becoming a lossy default. Without this the city of every coverage request
   is discarded at the moment of the click and cannot be recovered later,
   which is the whole point of capturing it before launch (MEH-1676 builds
   the dashboard card on top of this history).

2. ``producers.coverage_cta_enabled`` (Boolean, NOT NULL, server_default
   true) -- the business's opt-out. It ships in THIS revision, unused by any
   toggle UI, so the opt-out does not cost a second RED schema change later.
   ``server_default`` (not a Python-side default) is deliberate and required:
   existing rows are backfilled by the DDL itself, and any writer that goes
   around the ORM still gets `true`.

Revision ID: b3f7a1c46e92
Revises: d4a9c31e6f82
Create Date: 2026-08-26

Hand-written (NOT --autogenerate), per MEH-836 / docs/MIGRATIONS.md.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b3f7a1c46e92"
down_revision: str | None = "d4a9c31e6f82"
branch_labels: str | None = None
depends_on: str | None = None

# String(60) mirrors the 60-char cap the endpoint enforces after trim
# (schemas._coverage_city_validator). The column and the validator are two
# halves of one bound; changing either alone re-opens the truncation the cap
# exists to prevent.
_CITY_LEN = 60


def upgrade() -> None:
    op.add_column(
        "producer_whatsapp_clicks",
        sa.Column("city", sa.String(_CITY_LEN), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column(
            "coverage_cta_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    # Exact reverse of upgrade(). Both are plain column removals: neither
    # column carries an index, a constraint, or a foreign key, so nothing
    # else has to be torn down first. Data in them does not survive a
    # downgrade, which is correct -- these two columns ARE the feature.
    op.drop_column("producers", "coverage_cta_enabled")
    op.drop_column("producer_whatsapp_clicks", "city")
