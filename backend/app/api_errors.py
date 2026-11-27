"""
Module:   api_errors
Purpose:  Build the `{code, message, params}` error detail (MEH-1943) that an
          HTTPException carries, so the copy a person reads lives in
          frontend/messages/*.json under `error.api.<code>` and the backend
          sends a stable code plus the facts the copy needs.
Does NOT: hold copy of its own. `message` is the transition fallback for the
          consumers that do not resolve codes yet, and it must equal the
          he.json string word for word —
          scripts/checks/backend-error-copy-guard.sh checks that.
Related:  frontend/lib/errors.js (`errorMessage` resolves `error.api.<code>`),
          backend/app/auth.py `_EMAIL_UNVERIFIED_DETAIL` (MEH-1164, the first
          instance of this shape).
History:  MEH-1943 (creation).
"""

from __future__ import annotations

from typing import Any


def api_error_detail(code: str, message: str, **params: Any) -> dict[str, Any]:
    """Return the detail for `HTTPException(detail=...)`.

    `message` is the he.json template for `error.api.<code>`, written with the
    same `{name}` placeholders that next-intl reads; each placeholder is filled
    from `params`, so the fallback sentence and the localized one say the same
    thing.
    """
    return {
        "code": code,
        "message": message.format(**params) if params else message,
        "params": params,
    }
