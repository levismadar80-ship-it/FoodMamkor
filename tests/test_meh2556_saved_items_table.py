"""MEH-2556 — the `saved_items` table (chunk 1/5 of MEH-2555).

The table holds the recipes, events and experiences a user saved. The API that
writes it is chunk 2 (MEH-2557); these cases pin the three rules the DB itself
owns, because chunk 2 relies on them instead of re-checking in Python:

- one save per (user, type, item) — a double tap cannot create two rows;
- only the three known types — a typo in the API cannot store a fourth;
- deleting the account deletes its saves (DELETE /auth/me).

Each case asserts the DB's answer, not "the constraint exists", so dropping a
constraint from the revision turns it red.
"""

import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import SAVED_ITEM_TYPES, SavedItem
from tests.conftest import auth_header, make_user

REVISION = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/20261029_1430_9c534d477f2b_meh2556_saved_items.py"
)


def _save(db, user, item_type="recipe", item_id=None):
    row = SavedItem(
        user_id=user.id, item_type=item_type, item_id=item_id or uuid.uuid4()
    )
    db.add(row)
    db.commit()
    return row


def test_one_user_can_save_each_known_type(db):
    user = make_user(db, email="saver-2556@example.com")
    for item_type in SAVED_ITEM_TYPES:
        _save(db, user, item_type)
    stored = {r.item_type for r in db.query(SavedItem).filter_by(user_id=user.id)}
    assert stored == {"recipe", "event", "experience"}


def test_saving_the_same_item_twice_is_refused(db):
    user = make_user(db, email="twice-2556@example.com")
    item_id = uuid.uuid4()
    _save(db, user, "event", item_id)
    with pytest.raises(IntegrityError):
        _save(db, user, "event", item_id)
    db.rollback()
    assert db.query(SavedItem).filter_by(user_id=user.id).count() == 1


def test_same_item_id_under_another_type_or_user_is_a_separate_save(db):
    """The UNIQUE is on all three columns — not on item_id alone."""
    first = make_user(db, email="a-2556@example.com")
    second = make_user(db, email="b-2556@example.com")
    item_id = uuid.uuid4()
    _save(db, first, "recipe", item_id)
    _save(db, first, "event", item_id)
    _save(db, second, "recipe", item_id)
    assert db.query(SavedItem).filter_by(item_id=item_id).count() == 3


def test_an_unknown_type_is_refused_by_the_db(db):
    user = make_user(db, email="type-2556@example.com")
    with pytest.raises(IntegrityError):
        _save(db, user, "product")
    db.rollback()
    assert db.query(SavedItem).filter_by(user_id=user.id).count() == 0


def test_deleting_the_account_deletes_its_saves(client, db):
    user = make_user(db, email="gone-2556@example.com")
    keeper = make_user(db, email="keeper-2556@example.com")
    _save(db, user, "recipe")
    _save(db, user, "event")
    _save(db, keeper, "recipe")
    user_id = user.id

    resp = client.delete("/auth/me", headers=auth_header(user))
    assert resp.status_code == 200, resp.text

    db.expire_all()
    assert db.query(SavedItem).filter_by(user_id=user_id).count() == 0
    assert db.query(SavedItem).filter_by(user_id=keeper.id).count() == 1


def test_python_type_list_matches_the_revision_check():
    """SAVED_ITEM_TYPES (models.py) and the CHECK in the revision are two
    copies of one list; this fails the moment they disagree."""
    source = REVISION.read_text(encoding="utf-8")
    check = re.search(r"item_type IN \(([^)]*)\)", source)
    assert check, "CHECK clause not found in the revision"
    in_revision = tuple(re.findall(r"'([a-z_]+)'", check.group(1)))
    assert in_revision == SAVED_ITEM_TYPES


def test_model_check_is_built_from_the_python_list():
    """The model's CHECK text equals the revision's CHECK text, so ORM-created
    test schemas enforce exactly what production enforces."""
    (model_check,) = [
        c for c in SavedItem.__table__.constraints if c.name == "saved_items_item_type_check"
    ]
    source = REVISION.read_text(encoding="utf-8")
    assert str(model_check.sqltext) in source
