"""
Module:   app_runtime_role
Purpose:  The SQL that creates the app's own database role (MEH-3307): it can
          read and write rows, and use the chat tools' `mcp_reader` role, but it
          cannot create, alter or drop anything. The migrations keep the
          schema owner (MIGRATION_DATABASE_URL, app/database.py).
Touches:  Postgres roles and grants, only when its SQL is run by the schema
          owner — this script itself only prints it.
Does NOT: Run against any database, read any secret, or change a URL. The
          runbook (docs/DEPLOYMENT.md «Two database roles») says who runs the
          SQL, where, and in which order the Railway variables change.
History:  MEH-3307 (creation).

Usage (prints the SQL; the password stays a placeholder that is replaced in
the database console and never written down):

    python scripts/app_runtime_role.py
"""

from __future__ import annotations

ROLE = "app_runtime"
PASSWORD_PLACEHOLDER = "REPLACE_WITH_THE_RAILWAY_GENERATED_PASSWORD"

# The chat tools switch to this role inside a READ ONLY transaction
# (app/services/chat_db_tools.py), so the app's role must be a member of it.
READER_ROLE = "mcp_reader"


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def role_sql(password: str, role: str = ROLE) -> list[str]:
    """Statements, in order, to run as the schema owner. Idempotent: running
    them again only resets the password and re-applies the same grants."""
    pw = _literal(password)
    return [
        # LOGIN, and nothing else: no superuser, no CREATEDB, no CREATEROLE.
        # $role$ and not $$: a password with "$$" in it cannot end the block.
        f"""DO $role$
BEGIN
    CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
        PASSWORD {pw};
EXCEPTION WHEN duplicate_object THEN
    ALTER ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
        PASSWORD {pw};
END
$role$""",
        # Postgres 15+ already denies this; older servers grant it to PUBLIC,
        # which would let the app's role create tables in public.
        "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
        f"GRANT USAGE ON SCHEMA public TO {role}",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
        f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO {role}",
        # Tables and sequences a later migration creates (as the owner, the
        # role running this) get the same rights without a new step.
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role}",
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        f"GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {role}",
        f"GRANT {READER_ROLE} TO {role}",
    ]


def main() -> int:
    for statement in role_sql(PASSWORD_PLACEHOLDER):
        print(statement + ";\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
