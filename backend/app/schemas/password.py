"""MEH-305 — Pydantic password field type.

Pydantic validators are sync, so deny-list / HIBP / reuse checks cannot
run here. This field enforces only the length floor at the schema layer
(min_length=12) — the rest run inside the handler via
`app.services.password_policy.validate_password` once MEH-306 wires it.

MEH-395: a `BeforeValidator` strips whitespace before `min_length` runs,
so "          aa" is rejected at the schema layer (post-strip 2 chars)
instead of slipping past the floor and reaching the handler. The service
strips again as defense-in-depth (callers that bypass Pydantic still
get the same normalization).
"""

from typing import Annotated

from pydantic import BeforeValidator, Field


def _strip_password(v: object) -> object:
    """MEH-395: normalize whitespace before length validation.

    Returns non-strings unchanged so Pydantic raises its own
    type error rather than swallowing a wrong type.
    """
    if isinstance(v, str):
        return v.strip()
    return v


PasswordField = Annotated[
    str,
    BeforeValidator(_strip_password),
    Field(
        min_length=12,
        max_length=200,
        description="Password — additional checks via password_policy service",
    ),
]
