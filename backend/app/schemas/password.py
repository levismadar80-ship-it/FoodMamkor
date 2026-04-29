"""MEH-305 — Pydantic password field type.

Pydantic validators are sync, so deny-list / HIBP / reuse checks cannot
run here. This field enforces only the length floor at the schema layer
(min_length=12) — the rest run inside the handler via
`app.services.password_policy.validate_password` once MEH-306 wires it.
"""

from typing import Annotated

from pydantic import Field

PasswordField = Annotated[
    str,
    Field(
        min_length=12,
        max_length=200,
        description="Password — additional checks via password_policy service",
    ),
]
