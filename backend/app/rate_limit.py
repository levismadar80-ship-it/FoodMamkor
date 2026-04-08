"""Shared rate limiter instance used across all routers.

SECURITY FIX #2 (SECURITY.md): brute-force protection via slowapi.
Limits are applied per-IP. The limiter is registered on the FastAPI
app in main.py (see `app.state.limiter = limiter` + the exception
handler). Each router that wants to protect an endpoint imports
`limiter` from here and adds a `@limiter.limit("N/timeframe")`
decorator under the `@router.post(...)` decorator.

Decorated endpoints MUST accept `request: Request` as the first
parameter — slowapi reads it via introspection.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
