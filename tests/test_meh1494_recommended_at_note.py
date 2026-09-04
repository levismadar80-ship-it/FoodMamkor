"""
Module:   test_meh1494_recommended_at_note
Purpose:  Chunk A guard for producers.recommended_at / recommended_note — the
          two columns exist with the declared shape, a new producer carries
          NULL in both, and recommended_note is ABSENT from every public
          response schema by name.
Touches:  The test DB via `db` (make_producer inserts one row). No HTTP.
Does NOT: assert the admin toggle stamps recommended_at, or the annual review
          list — both are chunk B and have no code yet.
Related:  backend/app/models/models.py (Producer.recommended_at / _note);
          backend/alembic/versions/20260904_2230_e2a7c9d4b6f1_*.py;
          backend/app/schemas/schemas.py (ProducerListOut / ProducerDetailOut)
History:  MEH-1494 chunk A (creation, night session 04/09).
"""

from conftest import make_producer

from app.models.models import Producer
from app.schemas.schemas import ProducerDetailOut, ProducerListOut


# ── The absence control ───────────────────────────────────────────────────
# Against origin/staging both attributes raise AttributeError — the columns
# do not exist there.
def test_columns_exist_with_declared_shape():
    at = Producer.recommended_at.property.columns[0]
    note = Producer.recommended_note.property.columns[0]
    assert at.nullable is True and note.nullable is True
    assert at.type.timezone is True, (
        "a pick date without a timezone is a MEH-1883 bug waiting to happen"
    )
    assert at.server_default is None and note.server_default is None


def test_new_producer_has_no_pick_date_and_no_note(db):
    p = make_producer(db)
    db.refresh(p)
    assert p.recommended_at is None
    assert p.recommended_note is None
    # No backfill from the boolean either: the date is unknown, not "now".
    assert p.is_recommended in (False, None)


# ── The privacy guard ─────────────────────────────────────────────────────
# The note is the editor's internal reasoning about a real business. It must
# never ride a public schema. Asserted by NAME on both public shapes so that
# adding it to a base class the two inherit from also goes red.
def test_recommended_note_is_absent_from_public_schemas():
    for schema in (ProducerListOut, ProducerDetailOut):
        assert "recommended_note" not in schema.model_fields, schema.__name__
