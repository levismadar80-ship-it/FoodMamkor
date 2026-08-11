"""MEH-1626 chunk 2 — domain types applied to the internal input schemas.

Chunk 1 closed the public surfaces; this closes the 19 MIGRATE rows from the
chunk-2 Phase 0 table (the other 10 are documented SKIP/INERT and are the seed
for chunk 3's allowlist).

Parametrized rather than hand-written: the point of a domain type is that every
consumer behaves identically, so the tests should assert exactly that and fail
loudly if one call site drifts.

Related: tests/test_meh1626_domain_types.py (chunk 1) · backend/app/schemas/
schemas.py (the 7 types) · backend/app/routers/users_me.py (the ProfileUpdate
gate this chunk fixes alongside the schema).
"""

import pytest
from app.schemas.schemas import (
    AppleAuthRequest,
    CategoryIn,
    CategoryRequestUpdate,
    HomeProductCreate,
    HomeProductUpdate,
    OutreachLeadCreate,
    OutreachLeadUpdate,
    ProducerAdminCreate,
    ProducerCreate,
    ProducerOAuthSignupRequest,
    ProducerUpdate,
    ProductCreate,
    ProductUpdate,
    ProfileUpdate,
    StaticPageUpdate,
)
from conftest import auth_header, make_producer, make_user
from pydantic import ValidationError

# Minimal payload that satisfies each schema's OTHER required fields, so the
# field under test is the only thing that can fail.
BASE = {
    AppleAuthRequest: {"id_token": "x"},
    CategoryIn: {"name": "דבש"},
    CategoryRequestUpdate: {"status": "approved"},
    HomeProductCreate: {"title": "מרק ירקות"},
    HomeProductUpdate: {},
    OutreachLeadCreate: {"name": "ליד בדיקה"},
    OutreachLeadUpdate: {},
    ProducerAdminCreate: {"name": "מאפיית שקד"},
    # category_ids has validate_default=True (MEH-1153), so the >=1 rule fires
    # on the default [] even though the field is not "required".
    ProducerCreate: {"name": "מאפיית שקד", "category_ids": [1]},
    ProducerOAuthSignupRequest: {"provider": "google", "id_token": "x"},
    ProducerUpdate: {},
    ProductCreate: {"name": "גבינת עיזים", "price_min": 10},
    ProductUpdate: {},
    ProfileUpdate: {},
    StaticPageUpdate: {"title": "מי אנחנו", "body": "תוכן העמוד"},
}


def build(model, **override):
    return model(**{**BASE[model], **override})


# (model, field, bad_value) — every one must 422.
REJECT_CASES = [
    # SanitizedLabelField / SanitizedPersonNameField: empties to nothing
    (CategoryIn, "name", "<b></b>"),
    (OutreachLeadCreate, "name", "   "),
    (OutreachLeadUpdate, "name", "<i></i>"),
    (ProductCreate, "name", "   "),
    (ProductUpdate, "name", "<b></b>"),
    (StaticPageUpdate, "title", "   "),
    (AppleAuthRequest, "name", "<b></b>"),
    (ProducerOAuthSignupRequest, "name", "   "),
    (ProfileUpdate, "name", "   "),
    # SanitizedBusinessNameField: also enforces the >=3-letter floor
    (ProducerAdminCreate, "name", "אב"),
    (ProducerUpdate, "name", "???"),
    # PhoneNumberField
    (HomeProductCreate, "phone", "לא-טלפון"),
    (HomeProductUpdate, "phone", "12"),
    (OutreachLeadCreate, "phone", "abc"),
    (OutreachLeadUpdate, "phone", "555"),
    (ProfileUpdate, "phone", "not-a-phone"),
    # SanitizedUrlField
    (OutreachLeadCreate, "website", "ftp://example.com"),
    (OutreachLeadUpdate, "website", "example.com"),
]


@pytest.mark.parametrize(
    "model,field,bad",
    REJECT_CASES,
    ids=[f"{m.__name__}.{f}" for m, f, _ in REJECT_CASES],
)
def test_bad_input_is_rejected(model, field, bad):
    with pytest.raises(ValidationError):
        build(model, **{field: bad})


# (model, field, good_hebrew, expected_after_normalization)
ACCEPT_CASES = [
    (CategoryIn, "name", "תה", "תה"),  # 2 letters — no floor on labels
    (OutreachLeadCreate, "name", "חוות הזית", "חוות הזית"),
    (OutreachLeadUpdate, "name", "<b>חוות הזית</b>", "חוות הזית"),
    (ProductCreate, "name", "תה", "תה"),  # a real 2-letter product
    (ProductUpdate, "name", "<b>גבינה</b>", "גבינה"),
    (StaticPageUpdate, "title", "מי אנחנו", "מי אנחנו"),
    (AppleAuthRequest, "name", "גל", "גל"),  # 2-letter Hebrew given name
    (ProducerOAuthSignupRequest, "name", "טל", "טל"),
    (ProfileUpdate, "name", "בר", "בר"),
    (ProducerAdminCreate, "name", "<b>מאפיית שקד</b>", "מאפיית שקד"),
    (ProducerUpdate, "name", "מאפיית שקד", "מאפיית שקד"),
    (HomeProductCreate, "phone", "050-123-4567", "0501234567"),
    (HomeProductUpdate, "phone", "052 999 8888", "0529998888"),
    (OutreachLeadCreate, "phone", "0501234567", "0501234567"),
    (OutreachLeadUpdate, "phone", "  0501234567  ", "0501234567"),
    (ProfileUpdate, "phone", "050-123-4567", "0501234567"),
    (OutreachLeadCreate, "website", "https://example.com", "https://example.com"),
    (OutreachLeadUpdate, "website", "http://example.com", "http://example.com"),
]


@pytest.mark.parametrize(
    "model,field,good,expected",
    ACCEPT_CASES,
    ids=[f"{m.__name__}.{f}" for m, f, _, _ in ACCEPT_CASES],
)
def test_good_hebrew_input_is_accepted_and_normalized(model, field, good, expected):
    assert getattr(build(model, **{field: good}), field) == expected


# Sanitize-only fields have no rejection case — the guarantee is that markup
# is stripped while the Hebrew survives intact.
STRIP_CASES = [
    (ProducerCreate, "description"),
    (ProductCreate, "description"),
    (ProductUpdate, "description"),
    (CategoryRequestUpdate, "admin_notes"),
]


@pytest.mark.parametrize(
    "model,field", STRIP_CASES, ids=[f"{m.__name__}.{f}" for m, f in STRIP_CASES]
)
def test_sanitize_only_field_strips_markup_and_keeps_hebrew(model, field):
    obj = build(model, **{field: "<b>תיאור בעברית</b>"})
    assert getattr(obj, field) == "תיאור בעברית"


# ---------- Phase 1b: ProfileUpdate schema + users_me.py gate together ----------
#
# The three behaviours the chunk-1 Phase 0 flagged as a blocking pair. Each one
# is wrong under EITHER half alone: the schema without the router fix silently
# swallows a clear, the router without the schema keeps the unvalidated field.


def test_profile_patch_omitted_name_leaves_it_unchanged(client, db):
    user = make_user(db, email="omit@example.com", name="שרה לוי")
    resp = client.patch("/users/me", json={"city": "חיפה"}, headers=auth_header(user))
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(type(user)).filter_by(id=user.id).one().name == "שרה לוי"


def test_profile_patch_empty_phone_clears_it(client, db):
    """The regression the chunk-1 SKIP was protecting against: before the
    model_fields_set gate, ""→None made this a silent no-op and the user could
    never remove her number."""
    user = make_user(db, email="clear@example.com")
    user.phone = "0501234567"
    db.commit()
    resp = client.patch("/users/me", json={"phone": ""}, headers=auth_header(user))
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(type(user)).filter_by(id=user.id).one().phone is None


def test_profile_patch_whitespace_name_is_422_not_silent(client, db):
    """Must stay a hard 422. Under the migrated schema alone this would have
    become a 200 no-op, which is what made ProfileUpdate a chunk-1 SKIP."""
    user = make_user(db, email="ws@example.com", name="שרה לוי")
    resp = client.patch("/users/me", json={"name": "   "}, headers=auth_header(user))
    assert resp.status_code == 422
    db.expire_all()
    assert db.query(type(user)).filter_by(id=user.id).one().name == "שרה לוי"


def test_profile_patch_valid_phone_persists_normalized(client, db):
    user = make_user(db, email="norm@example.com")
    resp = client.patch(
        "/users/me", json={"phone": "050-123-4567"}, headers=auth_header(user)
    )
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(type(user)).filter_by(id=user.id).one().phone == "0501234567"


# ---------- Phase 1c: the admin_notes verdict, pinned ----------


def test_owner_put_cannot_write_admin_notes(client, db):
    """MEH-1626 chunk 2 Phase 1c — the mass-assignment suspicion, disproved and
    now locked.

    `admin_notes` IS declared on ProducerUpdate, and the owner PUT accepts a
    body containing it, so the field looks writable. It is not: every setattr
    in update_my_producer is gated on _PRODUCER_WRITABLE_FIELDS
    (producer_me.py:289) and admin_notes is absent from that set. This pin is
    the reason nobody has to re-derive that — if a future refactor replaces the
    allowlist with a plain model_dump loop, this goes red.
    """
    from app.models.models import Producer

    producer = make_producer(db, name="חוות שרה", status="approved")
    producer.admin_notes = "הערת אדמין מקורית"
    db.commit()
    owner = make_user(db, email="owner@example.com", role="producer")
    owner.producer_id = producer.id
    owner.is_producer = True
    db.commit()

    resp = client.put(
        "/producers/me",
        json={"admin_notes": "נכתב על ידי בעלת העסק"},
        headers=auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    db.expire_all()
    stored = db.query(Producer).filter(Producer.id == producer.id).one()
    assert stored.admin_notes == "הערת אדמין מקורית"
