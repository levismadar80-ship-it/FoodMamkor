# Night batch 5 — ledger (2026-06-06)

Autonomous overnight implementer session. P1/P2 fixes + API fuzz layer.
All work landed as **DRAFT** PRs; merges remain Sapir's. Sequential off
fresh `staging`. Safety net (merged mutation suite `test_expansion_*` /
`__tests__/expansion/`) never modified.

## Task ledger

| Task | Branch | PR | CI | Adversarial review | Sapir-terminal / DEFER |
|---|---|---|---|---|---|
| 1 — WhatsApp Graph parse (AUD-009/010) | `feature/whatsapp-delivery-aud009` | **#991** | pytest ✅ / ruff ✅ (fixed format round) | errors-family — no BLOCK | Alembic revision (outbound_messages table) — verbatim in PR body |
| 2 — availability validation + tz (AUD-039/040) | `feature/availability-validation-aud039` | **#995** | pending (ruff pre-checked ✅ local) | types-family — no BLOCK | admin required-`vacation_until` parity DEFERRED (Phase 0 §8 Q3); read-path tz alignment DEFERRED (AV-3 boundary) |
| 3 — useAdminAction (UIS Pattern A) | `feature/use-admin-action-uis` | **#1001** | build ✅ / vitest 443 ✅ / lint 0-err ✅ (local) | coverage-family — no BLOCK | DEFER: none — all 10 sites mechanical |
| 4 — schemathesis fuzz (MEH-214) | `feature/schemathesis-fuzz` | this PR | green via `importorskip` skip until dep lands | (infra) | **Sapir-terminal:** add `schemathesis` to dev group + `uv lock` |

## Task 1 — WhatsApp
- `_post` no longer treats any non-error HTTP status as delivered; new
  `WhatsAppSendResult` + classifier parse the Graph body (wamid / error
  code), outcomes `accepted`/`failed`/`window_expired`. Bool façade kept →
  all call sites byte-compatible. New `tests/test_whatsapp_delivery_parsing.py`.
- Sapir-terminal Alembic revision (delivery-status persistence) verbatim
  in PR #991 body — NOT created under `alembic/` per repo rule.

## Task 2 — availability
- `app/utils/clock.py` (`israel_now`/`israel_today`) +
  `app/services/availability_validation.py` (permissive transition matrix +
  `resolve_vacation_until`). Wired into both producer endpoints + a narrow
  admin `ProducerUpdate` validator. Past `vacation_until` rejected in Israel tz.
- Read-path auto-clear LEFT on `date.today()` to preserve the merged
  suite's AV-3 boundary (Israel-ahead-of-UTC would flake it).
- batch-4's Phase 0 doc landed on staging mid-flight (add/add conflict);
  adopted theirs + appended §9 implementation-decisions addendum.

## Task 3 — useAdminAction
- Shared `frontend/lib/use-admin-action.js` (`run(key, fn, onError?)` +
  `isBusy(key)`; synchronous per-key `inFlight` ref → real double-fire
  block; central `errorMessage()` toast → no new i18n keys). Wired into all
  10 CRITICAL Pattern-A sites (reports ×4, users, content ×2, producers ×3;
  `isBusy` threaded through `AdminProducersTable`). 7-case hook unit test.

## Task 4 — schemathesis fuzz
- `tests/test_fuzz_schemathesis.py` — unauth (admin DELETEs excluded) +
  authed (admin JWT) passes over the app's openapi, in-process ASGI,
  `@pytest.mark.fuzz`, `FUZZ_MAX_EXAMPLES` env-tunable.
- **Sapir-terminal:** `schemathesis` could not be added to
  `backend/pyproject.toml` — the file is guard-protected by
  `protect-lint-config.sh` (MEH-442). Verbatim dep + `uv lock` instructions
  in the PR body. Until applied, `importorskip` skips the module → CI green.

### FUZZ findings
- **None yet** — the suite can't execute in-sandbox (no Postgres) and skips
  in CI until the dep lands. First real run (after Sapir adds the dep) will
  populate `FUZZ-001..` here. Per MEH-214: findings only, fixes are morning
  triage — do NOT weaken a check to make the suite pass.

## BLOCKED
- None of the four tasks fully blocked. Two guard-driven hand-offs (Alembic
  in Task 1, pyproject in Task 4) routed to Sapir-terminal steps rather than
  bypassing the guardrails.
