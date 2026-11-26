"""
Module:   admin_category_writes
Purpose:  The admin's create, rename and delete of a category, with the guards
          that keep the taxonomy safe: a duplicate name, a seeded (system) row,
          a licensed row, and a category still linked to businesses.
Touches:  categories (INSERT / UPDATE / DELETE); reads producer_categories.
Does NOT: route or authenticate — routers/admin_extra.py keeps the routes and
          require_admin. Does not list categories (list_categories_admin stays
          in the router) or derive the slug rule (services/category_slug.py).
Related:  backend/app/routers/admin_extra.py (create_category,
          update_category, delete_category) ·
          backend/app/services/category_slug.py resolve_unique_slug ·
          frontend/messages/he.json admin.content.categories.
History:  MEH-3537 (moved verbatim from routers/admin_extra.py; the guards are
          MEH-1297, MEH-1456, MEH-1571, MEH-2139, MEH-3255).
"""

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Category, ProducerCategory
from app.schemas.schemas import CategoryCreate, CategoryIn
from app.services.category_slug import resolve_unique_slug

# MEH-1571: shared Hebrew copy for the two update_category guards. Named
# constants rather than inline strings at the raise site — REUSES:
# backend/app/services/license_validation.py:27 (LICENSE_REQUIRED_ERROR_HE),
# the same pattern for the same regulatory surface. Mirrored in
# frontend/messages/{he,en}.json under admin.content.categories.
#
# DO NOT soften the rename message into "try a different name" — it must say
# WHY the rename is refused (a licensing requirement) and WHERE it belongs
# (a migration), or the admin retries in the UI and files a bug instead.
#
# The closing sentence says «הסמל» and not «האימוג'י» (Sapir, 06/09, rule 22):
# MEH-2163 moves the category glyphs to a slug-keyed registry, so the word
# "emoji" names an implementation that is on its way out. Same amendment, same
# reason, as CATEGORY_SYSTEM_RENAME_ERROR_HE below. English twin in en.json:
# "The symbol can still be updated."
CATEGORY_LICENSE_RENAME_ERROR_HE = (
    "לקטגוריה הזאת יש דרישת רישיון של משרד הבריאות שמזוהה לפי השם. "
    "שינוי השם מבטל את הדרישה עבור בתי העסק בקטגוריה, ולכן הוא נעשה במיגרציה "
    "ולא במסך הניהול. אפשר לעדכן את הסמל."
)
CATEGORY_NAME_TAKEN_ERROR_HE = "קטגוריה בשם זה כבר קיימת"

# MEH-1456 chunk 2b — the seeded rows declare their own ownership
# (`categories.is_system`, revision b7d3e5a9c1f4). Same shape as the licensing
# guard above and for the same reason: a rename or a delete of a seed row is a
# reviewed, reversible Alembic revision (the MEH-927 pattern), not a text field
# in the admin panel. Industry precedent on the card §2.6 — Oracle Siebel
# "Protect Seed Data", IBM RDU `WRITE_PROTECTED`: ownership is a column on the
# row, never a hardcoded list in application code.
#
# No escape hatch in v1, deliberately. Siebel and IBM both ship one; here a
# second authority over the same row is exactly what this closes, and the
# sanctioned path already exists (a migration).
#
# Copy approved by Sapir 06/09 (rule 22), with one amendment she made on
# approval: the closing sentence says «הסמל» and not «האימוג'י», because
# MEH-2163 moves the category glyphs to a slug-keyed registry and the word
# "emoji" goes stale the day that lands. English twin, approved with it:
# "This is a system category — its name is set in code and changes only in a
# migration, not in the admin screen. The symbol can still be updated."
# Recorded here rather than as an en.json key because nothing reads such a
# mirror (the MEH-1571 pair at the top of this block has one and it is dead).
CATEGORY_SYSTEM_RENAME_ERROR_HE = (
    "זו קטגוריית מערכת — השם שלה נקבע בקוד ומשתנה רק במיגרציה, "
    "לא במסך הניהול. אפשר לעדכן את הסמל."
)
CATEGORY_SYSTEM_DELETE_ERROR_HE = (
    "זו קטגוריית מערכת ואי אפשר למחוק אותה ממסך הניהול. הסרה נעשית במיגרציה."
)


# MEH-3911: static routes under frontend/app/[locale]/producers/ — a category
# with one of these slugs would never be reachable at /producers/<slug>/<region>.
RESERVED_CATEGORY_SLUGS = frozenset({"diet"})


def create_category_row(db: Session, data: CategoryCreate) -> Category:
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(status_code=400, detail="קטגוריה בשם זה כבר קיימת")
    # MEH-2139 chunk 2: the column default (models.py) already derives a slug
    # from the name, so this line would work without the argument. It is passed
    # explicitly HERE because this is the one writer whose input is arbitrary
    # user text — the default cannot query the session to dodge a collision, and
    # a collision would surface as a 500 from the UNIQUE constraint instead of a
    # category that simply got `-2` appended.
    # MEH-3911: an English slug typed by the admin wins; a taken one is a
    # clear 400, not a silent `-2` (the admin chose that word on purpose).
    # MEH-3911: a static segment under /producers/ would shadow the category page.
    if data.slug in RESERVED_CATEGORY_SLUGS:
        raise HTTPException(
            status_code=400, detail="הכתובת הזאת שמורה לאתר, בחרו כתובת אחרת"
        )
    if data.slug and db.query(Category.id).filter(Category.slug == data.slug).first():
        raise HTTPException(
            status_code=400, detail="הכתובת באנגלית כבר בשימוש בקטגוריה אחרת"
        )
    cat = Category(
        name=data.name,
        emoji=data.emoji,
        slug=data.slug or resolve_unique_slug(db, data.name),
        requires_license=data.requires_license,  # MEH-3255
    )
    db.add(cat)
    # MEH-2139: `resolve_unique_slug` above is a SELECT and this is the INSERT,
    # so the two are not atomic — a concurrent create whose name transliterates
    # to the same base slug can pass the same check and take the slug first.
    # Both requests then insert the same value and the loser hits
    # `uq_categories_slug` as an unhandled IntegrityError -> 500 with a psycopg2
    # message. The window is small and the admin team is one person, so this is
    # unlikely rather than impossible; it is handled because a 500 here is
    # indistinguishable from the app being broken, while 409 says what happened.
    #
    # Deliberately NOT a retry loop: a second attempt would need a fresh
    # `resolve_unique_slug` on a rolled-back session and could lose the race
    # again, which trades a clear error for an unbounded one. The admin retries
    # the request and `-2` is free by then.
    #
    # `rollback()` is required, not tidiness — the session is unusable after an
    # IntegrityError, and returning without it poisons the next request that
    # borrows this connection.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="הקטגוריה נוצרה במקביל בבקשה אחרת. נסי שוב.",
        ) from None
    db.refresh(cat)
    return cat


def update_category_row(db: Session, category_id: int, data: CategoryIn) -> Category:
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="הקטגוריה לא נמצאה")

    # Emoji-only edits skip both guards — nothing about the licensing lookup or
    # the UNIQUE constraint depends on the emoji.
    if data.name != cat.name:
        # MEH-1456 chunk 2b: ownership first. Every LICENSE_REQUIRED_CATEGORIES
        # name is also a seeded row, so the licensing guard below would answer
        # for both and tell an admin about a licensing requirement when the
        # actual reason is that the row belongs to the seed. Specific before
        # general — and an unlicensed seed row (most of the 18) reaches only
        # this one.
        if cat.is_system:
            raise HTTPException(status_code=422, detail=CATEGORY_SYSTEM_RENAME_ERROR_HE)
        # MEH-3255: the licence rule now reads the row's column, so a rename
        # no longer moves a category out of it. The guard stays (a licensed
        # category keeps its name, as before), keyed on the column.
        if cat.requires_license:
            raise HTTPException(
                status_code=422, detail=CATEGORY_LICENSE_RENAME_ERROR_HE
            )
        # REUSES: create_category_row above (moved from routers/admin_extra.py) — its
        # duplicate-name SELECT. Same shape, scoped to OTHER rows so re-saving
        # a row under its own name is not a false collision.
        if (
            db.query(Category)
            .filter(Category.name == data.name, Category.id != cat.id)
            .first()
        ):
            raise HTTPException(status_code=422, detail=CATEGORY_NAME_TAKEN_ERROR_HE)

    cat.name = data.name  # type: ignore[assignment]
    cat.emoji = data.emoji  # type: ignore[assignment]
    db.commit()
    db.refresh(cat)
    return cat


def delete_category_row(db: Session, category_id: int) -> dict[str, Any]:
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="הקטגוריה לא נמצאה")
    # MEH-1456 chunk 2b: a seeded row is not deletable from here even when the
    # MEH-1297 count below is zero — an empty system category is still the
    # taxonomy's, and removing it is a migration. Ordered first so the admin is
    # told the real reason instead of "0 businesses are linked".
    if cat.is_system:
        raise HTTPException(status_code=422, detail=CATEGORY_SYSTEM_DELETE_ERROR_HE)
    # MEH-1297: block deleting a category still linked to producers — a silent
    # cascade would orphan those businesses (uncategorised → invisible).
    linked = (
        db.query(func.count(ProducerCategory.producer_id))
        .filter(ProducerCategory.category_id == category_id)
        .scalar()
    )
    if linked:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק — {linked} בתי עסק משויכים לקטגוריה זו",
        )
    db.delete(cat)
    db.commit()
    return {"detail": "Category deleted"}
