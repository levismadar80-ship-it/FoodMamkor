# Directory: `backend/app/routers/`

## Purpose
FastAPI route handlers grouped by domain (producers, auth, admin, etc.).
Each module declares one `APIRouter`; registration happens centrally in
`backend/app/router_registry.py`.

## Canonical pattern
`backend/app/routers/producers.py:1-50` — the reference shape for any
new router:
- imports order: stdlib → third-party → `app.auth` → `app.database` →
  `app.models` → `app.rate_limit` → `app.schemas.schemas` → `app.services.*`
- `router = APIRouter(tags=["<domain>"])` at module scope
- per-route stack: `@router.<verb>("/path", response_model=…)` →
  `@limiter.limit("N/window")` → handler taking `request: Request` first,
  then `body`, then `user = Depends(<auth-dep>)`, then `db: Session = Depends(get_db)`

## Conventions specific to this dir
- **Auth deps** (`backend/app/auth.py`): `get_current_user:222`,
  `get_current_user_optional:271`, `get_current_user_lenient:311`,
  `require_admin:344`, `require_verified_email:374`. Order matters — see
  Workflow regression rule 6.
- **Optional auth is a THREE-state contract (MEH-1627).** Picking the wrong
  dep is silent, so pick deliberately:

  | Dep | No Bearer | Valid | **Invalid / expired** |
  |---|---|---|---|
  | `get_current_user_optional` | `None` | `User` | **401** (client refreshes + retries) |
  | `get_current_user_lenient` | `None` | `User` | `None` (403 still raised for blocked) |

  **Default to `_optional`.** `_lenient` exists for exactly one situation:
  the caller physically cannot retry — fire-and-forget telemetry sent via
  `navigator.sendBeacon` / `fetch(keepalive:true)` as the tab unloads, which
  has no response handler, so a 401 loses the event outright. Only the two
  click-tracking endpoints in `producers.py` qualify. Reaching for `_lenient`
  to quiet a 401 anywhere else re-creates the MEH-1627 bug: an expired token
  silently downgrades a logged-in user to anonymous, and the handler then
  takes its anonymous branch — which is how a producer upgrade turned into an
  unrecoverable 422.
- **Rate limiting**: always via `from app.rate_limit import limiter`;
  per-route limits, never inline (`.claude/rules/security.md`).
- **Schemas**: pure-Pydantic models in `backend/app/schemas/schemas.py`
  per ADR-006 R1. Do not declare request/response models inline in router
  files — relocate via the same package.
- **Hebrew errors**: `raise HTTPException(status_code=…, detail="<עברית>")`.
  Use feminine grammar unless the surface is a functional UI string
  (gerund) — see brand voice in `.claude/rules/workflow.md` § brand voice.

## Gotchas
- `httpx.Client()` must be passed to the Anthropic SDK explicitly —
  `httpx 0.28+` renamed `proxies=` to `proxy=` (`.claude/rules/backend.md`).
- Resend, never SMTP — Railway blocks ports 25/465/587
  (`.claude/rules/backend.md`).
- Rate-limit key uses `X-Real-IP` not `request.client.host` (MEH-256;
  Railway proxy strips client IP).
- AI fail-open never bypasses auth (`.claude/rules/security.md`).

## Cross-refs
- `backend/app/router_registry.py` — central registration site.
- `backend/app/auth.py` — JWT, fingerprint binding, deps.
- `backend/app/rate_limit.py` — slowapi limiter instance.
- `.ai/diagrams/api-routes.md` — keep in sync (Workflow rule 12).
