# Central Components — Vibe Coding Responsibility Protocol (MEH-128)

Central components are files where a logic bug causes silent production failures or security
regressions. Syntax errors are caught by CI; logic errors may not surface until users are affected.

## What Makes a File "Central"?

A file is central if an undetected logic error in it could:
- Bypass authentication or authorization
- Break the primary producer/consumer user flows
- Corrupt database state silently
- Expose private data to unauthenticated users

## Central Component List

See `.claude/central-components.json` for the authoritative list. Current entries:

### Frontend critical (40+ Linear issue appearances — highest breakage frequency)

| File | Why it's central |
|---|---|
| `frontend/app/map/MapClient.jsx` | Primary map page — state corruption invisible at build time |
| `frontend/components/MapComponent.jsx` | Leaflet wrapper — z-index, tile, marker logic shared across views |
| `frontend/app/producers/page.jsx` | Producer detail page — auth gating, CTA layout, review section |
| `frontend/app/page.js` | Homepage — hero, stats bar, category grid, Friday mode |
| `frontend/app/layout.js` | Root layout — font loading, RTL dir, global providers |
| `frontend/lib/language-context.js` | Language/RTL context — affects every component in the tree |

### Frontend medium (frequent co-changes, regression-prone)

| File | Why it's central |
|---|---|
| `frontend/components/ProducerCard.jsx` | Rendered 100+ times per page — undefined prop = blank list |
| `frontend/components/Header.jsx` | Auth state, nav links — breaks session UI globally |
| `frontend/components/BottomNav.jsx` | Mobile nav — z-index collisions, active-state bugs |
| `frontend/components/Footer.jsx` | Newsletter form, legal links — appears on every page |

### Backend critical

| File | Why it's central |
|---|---|
| `backend/app/main.py` | App entry point — middleware, CORS, route registration |
| `backend/app/routers/auth.py` | Registration + login — duplicate-user, token issuance, BackgroundTasks |
| `backend/app/config.py` | Settings — env var defaults, missing key → silent misconfiguration |

## 4-Step Protocol (mandatory before shipping an edit)

1. **Read the full file first.** Do not edit based on partial knowledge. Use `Read` with no
   offset/limit to get the complete file before writing a single line.
2. **Run `/adversarial-review` after editing** — even if the build fails (Rule 20 exception).
   Logic risk > syntax risk for central components.
3. **Add or update a regression test** if you changed any logic path (not just formatting).
   File: `tests/test_api.py` (backend) or `frontend/__tests__/` (frontend).
4. **Update HANDOFF.md** in the same commit: what changed, why, and any side effects discovered.

## Pre-Edit Warning

`.claude/pre-edit-guard.js` (wired as a PreToolUse hook) emits a warning to stdout whenever
`Edit`, `Write`, or `MultiEdit` targets a central component. This warning is **non-blocking**
(exits 0) — it is a nudge, not a gate.

If the warning fires and you are doing a routine doc-string or comment edit: proceed normally.
If the warning fires and you are changing logic: follow the 4-step protocol above.

## Adding New Central Components

1. Add the path to `.claude/central-components.json`
2. Add a row to the table above with the risk rationale
3. Commit both in the same PR that warrants the addition
