"""
Module:   test_meh1287_in_season_until
Purpose:  Chunk A guard for producers.in_season_until — the column exists as
          a nullable DATE, a new producer carries NULL, and the field is NOT
          owner-writable (absent from ProducerUpdate by name).
Touches:  The test DB via `db` (make_producer inserts one row). No HTTP.
Does NOT: assert the homepage module or its >=3 render gate — chunk B.
Related:  backend/app/models/models.py (Producer.in_season_until);
          backend/alembic/versions/20260904_2300_f5b8d2c7a3e9_*.py;
          backend/app/schemas/schemas.py (ProducerUpdate)
History:  MEH-1287 chunk A (creation, night session 04/09).
"""

import sqlalchemy as sa
from conftest import make_producer

from app.models.models import Producer
from app.schemas.schemas import ProducerUpdate


# ── The absence control ───────────────────────────────────────────────────
# Against origin/staging this raises AttributeError — the column does not
# exist there.
def test_column_is_a_nullable_date():
    col = Producer.in_season_until.property.columns[0]
    assert col.nullable is True
    # A DATE, not a timestamp: the bound is an Israel calendar day, and a
    # timestamp here would re-create the MEH-1883 timezone class of bug.
    assert isinstance(col.type, sa.Date) and not isinstance(col.type, sa.DateTime)
    assert col.server_default is None


def test_new_producer_is_not_in_season(db):
    p = make_producer(db)
    db.refresh(p)
    assert p.in_season_until is None


# ── The anti-self-curation guard ──────────────────────────────────────────
# Seasonality is the editor's decision. If this field ever lands on the owner
# write schema, a business could put itself on the homepage.
def test_not_owner_writable():
    assert "in_season_until" not in ProducerUpdate.model_fields
