"""
Module:   check_no_demo_data
Purpose:  READ-ONLY scan of a target database for demo/test entities, so the
          staging→main release checklist can gate on production being clean of
          them (MEH-1199). Codifies the reverse direction of the
          seed_demo_business.py guard: that script keeps demo data OUT of prod;
          this one verifies none already leaked IN.
Touches:  Reads DB tables producers (name, admin_notes) and users (email).
          NO WRITES — SELECT only. Never DELETE, UPDATE, or INSERT. Prints a
          table; a human decides what to do with any hit.
Does NOT: delete or clean anything (that is a human decision — see MEH-1189
          for the one-off cleanup). Does NOT seed (seed_demo_business.py owns
          the staging seed). Does NOT match on producer.description — NAME only,
          to bound false-positives (see ADR-029 §False-positive analysis).
Related:  backend/scripts/seed_demo_business.py::_assert_not_production() (the
          forward guard this complements) · docs/decisions/ADR-029-*.md
          (the policy) · docs/DEPLOYMENT.md "before promoting staging → main".
History:  MEH-1199 (creation).

Run (Sapir, Git Bash, against production before a release):
    railway run python backend/scripts/check_no_demo_data.py
Local / machine-readable:
    python backend/scripts/check_no_demo_data.py            # human table
    python backend/scripts/check_no_demo_data.py --json     # JSON
    python backend/scripts/check_no_demo_data.py --markers "test,demo"

Exit 0 = clean. Exit 1 = at least one demo/test entity found.
"""

import argparse
import json
import os
import sys
from urllib.parse import urlparse

# Make `backend/` importable as package root when run directly (script shim).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.database import SessionLocal, engine  # noqa: E402  # imports follow sys.path.insert
from app.models.models import Producer, User  # noqa: E402  # imports follow sys.path.insert

# Substring markers matched (case-insensitive) against Producer.name ONLY.
# NAME-only is a deliberate false-positive bound — see ADR-029. "תסס" is the
# Hebrew root of תסיסה (fermentation), so a real sourdough/ferment business
# (e.g. "מאפיית תסס") WILL match; the script never deletes, it flags for a
# human, so this is an accepted flag, not a silent action. Documented honestly
# in the ADR rather than dropped.
DEFAULT_MARKERS = ["בדיקה", "test", "demo", "twt", "תסס"]

# admin_notes marker for seeded demo rows (seed_demo_business.py writes
# "DEMO BUSINESS — …"). Case-insensitive substring.
ADMIN_NOTE_MARKER = "DEMO"

# Users seeded for demo/tests use @example.com (seed_demo_business.py +
# tests/conftest convention). Suffix match, case-insensitive.
EXAMPLE_EMAIL_SUFFIX = "@example.com"


def _db_host() -> str:
    """Best-effort hostname of the configured DB, for the report header."""
    return (
        urlparse(str(engine.url).replace("postgresql+psycopg2", "postgresql")).hostname
        or "?"
    ).lower()


def scan(db, markers: list[str] | None = None) -> dict:
    """Run the read-only scan. Returns a structured result dict.

    Three independent SELECT queries — no query mutates state:
    - producers whose admin_notes contain "DEMO" (case-insensitive)
    - producers whose name contains any marker (case-insensitive, NAME only)
    - users whose email ends in @example.com (case-insensitive)
    """
    markers = markers if markers is not None else DEFAULT_MARKERS

    admin_notes_hits = [
        {
            "id": str(p.id),
            "name": p.name,
            "status": p.status,
            "admin_notes": (p.admin_notes or "").strip(),
        }
        for p in db.query(Producer)
        .filter(Producer.admin_notes.ilike(f"%{ADMIN_NOTE_MARKER}%"))
        .order_by(Producer.id)
        .all()
    ]

    name_hits = []
    # ilike per marker; a producer can match more than one marker, so collect
    # matched markers per row and de-duplicate by producer id. Keyed by the
    # stringified UUID (Producer.id is a UUID) so the annotation is truthful and
    # the key matches the JSON-safe "id" stored in the row.
    seen_ids: dict[str, dict] = {}
    for marker in markers:
        for p in (
            db.query(Producer)
            .filter(Producer.name.ilike(f"%{marker}%"))
            .order_by(Producer.id)
            .all()
        ):
            row = seen_ids.setdefault(
                str(p.id),
                {
                    "id": str(p.id),
                    "name": p.name,
                    "status": p.status,
                    "matched_markers": [],
                },
            )
            if marker not in row["matched_markers"]:
                row["matched_markers"].append(marker)
    name_hits = sorted(seen_ids.values(), key=lambda r: r["id"])

    email_hits = [
        {"id": str(u.id), "email": u.email, "role": u.role}
        for u in db.query(User)
        .filter(User.email.ilike(f"%{EXAMPLE_EMAIL_SUFFIX}"))
        .order_by(User.id)
        .all()
    ]

    total = len(admin_notes_hits) + len(name_hits) + len(email_hits)
    return {
        "db_host": _db_host(),
        "markers": markers,
        "clean": total == 0,
        "total_hits": total,
        "hits": {
            "producers_admin_notes_demo": admin_notes_hits,
            "producers_name_marker": name_hits,
            "users_example_com": email_hits,
        },
    }


def _print_table(result: dict) -> None:
    """Human-readable report."""
    print(f"=== demo/test data scan — DB host: {result['db_host']} ===")
    print(f"markers (name-only, case-insensitive): {', '.join(result['markers'])}")
    print()

    admin_hits = result["hits"]["producers_admin_notes_demo"]
    print(
        f"Producers — admin_notes contains '{ADMIN_NOTE_MARKER}' ({len(admin_hits)}):"
    )
    if admin_hits:
        for h in admin_hits:
            note = h["admin_notes"].replace("\n", " ")
            note = (note[:60] + "…") if len(note) > 60 else note
            print(f"  {h['id']}  [{h['status']}] {h['name']}  — {note}")
    else:
        print("  (none)")
    print()

    name_hits = result["hits"]["producers_name_marker"]
    print(f"Producers — name matches a test marker ({len(name_hits)}):")
    if name_hits:
        for h in name_hits:
            print(
                f"  {h['id']}  [{h['status']}] {h['name']}  "
                f"— matched: {', '.join(h['matched_markers'])}"
            )
    else:
        print("  (none)")
    print()

    email_hits = result["hits"]["users_example_com"]
    print(f"Users — email ends in '{EXAMPLE_EMAIL_SUFFIX}' ({len(email_hits)}):")
    if email_hits:
        for h in email_hits:
            print(f"  {h['id']}  [{h['role']}] {h['email']}")
    else:
        print("  (none)")
    print()

    if result["clean"]:
        print("RESULT: clean — no demo/test entities found (exit 0)")
    else:
        print(
            f"RESULT: {result['total_hits']} hit(s) found — review each row above; "
            "the script never deletes (exit 1)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read-only scan for demo/test entities in the target DB "
        "(exit 1 if any found). Never writes."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable JSON instead of the human table",
    )
    parser.add_argument(
        "--markers",
        type=str,
        default=None,
        help="comma-separated override of the name-marker list "
        f"(default: {','.join(DEFAULT_MARKERS)})",
    )
    args = parser.parse_args()

    markers = (
        [m.strip() for m in args.markers.split(",") if m.strip()]
        if args.markers is not None
        else None
    )

    db = SessionLocal()
    try:
        result = scan(db, markers=markers)
    finally:
        db.close()

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        _print_table(result)

    sys.exit(0 if result["clean"] else 1)


if __name__ == "__main__":
    main()
