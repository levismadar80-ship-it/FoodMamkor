# guard-ok: backend/pyproject.toml is deny-listed for CC, so this file is not in [tool.mypy].files yet; it passes mypy --strict (PR body). Sapir adds the line.
"""
Module:   admin_audit
Purpose:  One append-only row for every successful change an admin makes:
          who, what (method + route template), on what, when, from where.
Touches:  admin_audit_log (INSERT only), through its own short session.
Does NOT: decide who is an admin, and does not log reads, refused requests or
          changes that did not go through. It never updates or deletes a row.
          Telemetry sent with get_current_user_lenient is not an admin action
          and is not logged.
Related:  auth.py get_current_user (the single caller of schedule — every
          signed-in request passes there, whatever gate the route uses),
          models/admin_ops.py AdminAuditLog, routers/admin_extra.py
          (GET /admin/audit-log), database.py:161 get_db (why a task, and why
          a session of its own).
History:  MEH-3306 (creation — rulings 17/11: «מי דחתה את העסק שלי» had no answer).

How the row gets written. `get_current_user` runs before the route. For an
admin account and a mutating method it queues `write` as a BackgroundTask. FastAPI runs a
request's tasks only when the route returned normally, so a 404 / 409 / 422
— where nothing changed — queues nothing that runs. The task opens its own
session, inserts, commits and closes: the request's session was already given
back to the pool (MEH-2886), and borrowing it again would hold a connection
through every later task (MEH-2889).

A failed write is logged and swallowed. The admin's action has already been
committed by then; raising would only cancel the request's other tasks (its
emails) and tell the admin her action failed when it did not.
"""

import re
from typing import Any

import structlog
from fastapi import BackgroundTasks, Request

from app.database import SessionLocal
from app.models.admin_ops import AdminAuditLog
from app.rate_limit import resolve_client_ip

logger = structlog.get_logger("mehamakor.admin_audit")

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# The attribute a route's note is parked on (the admin's own User instance —
# the one object both the dependency and the route hold).
_NOTE_ATTR = "_admin_audit_note"

_TARGET_VALUE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
# A before/after string must look like a code (a role, a status): lower-case
# ASCII, digits, `_` and `-`. That shape cannot be an email, a phone number,
# a Hebrew name or a sentence — the docstring of note() is not the guard.
_CODE_VALUE = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")


def schedule(request: Request, background_tasks: BackgroundTasks, actor: Any) -> None:
    """Queue the audit row for this request, if it is a change."""
    if request.method not in MUTATING_METHODS:
        return
    note: dict[str, Any] = {}
    setattr(actor, _NOTE_ATTR, note)
    target_type, target_id = _target(request)
    row = {
        "actor_id": actor.id,
        "action": f"{request.method} {_route_template(request)}"[:160],
        "target_type": target_type,
        "target_id": target_id,
        "ip": str(resolve_client_ip(request)[0] or "")[:64] or None,
    }
    background_tasks.add_task(write, row, note)


def note(
    actor: Any,
    *,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """A route's reduced before/after for the row being written.

    Values are kept only when they are a bool, an int, None or a code-like
    string (a role, a status — see _CODE_VALUE). Anything else is dropped:
    the log outlives the data it describes.
    """
    holder = getattr(actor, _NOTE_ATTR, None)
    if holder is None:  # a read, or not an admin request: nothing to attach to
        return
    if before is not None:
        holder["before"] = _reduced(before)
    if after is not None:
        holder["after"] = _reduced(after)


def write(row: dict[str, Any], note: dict[str, Any]) -> None:
    """Insert one row. `note` is read HERE, after the route ran, so it holds
    whatever the route attached."""
    try:
        with SessionLocal() as db:
            db.add(AdminAuditLog(**row, details=note or None))
            db.commit()
    except Exception:  # noqa: BLE001 — see module docstring: never fail the request's tasks
        logger.error(
            "admin_audit.write_failed", action=row.get("action"), exc_info=True
        )


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return str(path) if path else request.url.path


def _target(request: Request) -> tuple[str | None, str | None]:
    """The first `*_id` path parameter (`user_id` → ("user", "<uuid>")); with
    none, the first parameter of any name."""
    params = [
        (name, str(value))
        for name, value in request.path_params.items()
        if _TARGET_VALUE.match(str(value))
    ]
    for name, text in params:
        if name.endswith("_id"):
            return name[:-3][:40], text
    if params:
        name, text = params[0]
        return name[:40], text
    return None, None


def _reduced(values: dict[str, Any]) -> dict[str, Any]:
    kept: dict[str, Any] = {}
    for key, value in values.items():
        if value is None or isinstance(value, (bool, int)):
            kept[str(key)[:40]] = value
        elif isinstance(value, str) and _CODE_VALUE.match(value):
            kept[str(key)[:40]] = value
    return kept
