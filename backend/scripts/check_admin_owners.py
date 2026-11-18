"""
Module:   check_admin_owners
Purpose:  READ-ONLY count of accounts that are an admin AND have a business
          linked (role='admin' and producer_id set). From MEH-3376 on, no route
          can create that state; this finds the rows that were created before.
Touches:  Reads `users` (id, role, producer_id, created_at). SELECT only.
Does NOT: change anything. A row found here is fixed by a person: such an
          account can no longer be demoted (409) or detached from the panel.
          It prints ids, never emails or names.
Related:  backend/app/routers/admin_extra.py update_user_role (the two 409s),
          tests/test_meh3376_demote_owner_409.py.
History:  MEH-3376 (creation).

Run (Sapir, Git Bash, against staging or production):
    railway run python backend/scripts/check_admin_owners.py

Exit 0 = none. Exit 1 = at least one such account.
"""

import os
import sys

# Make `backend/` importable as package root when run directly (script shim).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from sqlalchemy.orm import Session  # noqa: E402  # imports follow sys.path.insert

from app.database import SessionLocal  # noqa: E402
from app.models.models import User  # noqa: E402


def admin_owners(db: Session) -> list[User]:
    """Accounts with role 'admin' and a linked business, oldest first."""
    return (
        db.query(User)
        .filter(User.role == "admin", User.producer_id.isnot(None))
        .order_by(User.created_at)
        .all()
    )


def main() -> int:
    with SessionLocal() as db:
        rows = admin_owners(db)
        print(f"admin accounts with a linked business: {len(rows)}")
        for u in rows:
            print(
                f"  user_id={u.id} producer_id={u.producer_id} created_at={u.created_at}"
            )
    return 1 if rows else 0


if __name__ == "__main__":
    raise SystemExit(main())
