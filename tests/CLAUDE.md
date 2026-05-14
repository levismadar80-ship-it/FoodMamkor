# Directory: `tests/`

## Purpose
Backend pytest suite. Tests live at the **repo root** `tests/`, not
`backend/tests/`. The `backend/` package is added to `sys.path` by
`tests/conftest.py:18-19`.

## Canonical pattern
- `tests/test_api.py` — general API tests organized by `TestX` classes
  (one per router/feature).
- `tests/test_category_requests.py` — MEH-555 reference for adding a
  small focused test module for a new validator/feature.
- `tests/test_auth.py` — auth flows with the HIBP autouse mock pattern.

## Conventions specific to this dir
- **Fixtures** from `tests/conftest.py`: `db` (SQLAlchemy session),
  `client` (`TestClient(app)`), factory helpers `make_user`,
  `make_producer`, `make_category` (lines 95-180). Per-test isolation
  via `_clean_tables` autouse fixture (TRUNCATE CASCADE every test).
- **Auth headers**: `auth_header(user)` from `tests/conftest.py` —
  builds a `Bearer <jwt>` header for the given user.
- **Test database**: `TEST_DATABASE_URL` env var; defaults to
  `postgresql://postgres:postgres@localhost:5432/mehamakor_test`.
- **Rate-limit reset**: `_reset_rate_limiter` autouse fixture clears
  slowapi between tests — do not call again manually.
- **Schema-valid guard payloads**: 401/403/409 tests must send
  schema-valid bodies (Regression rule 6, `.claude/rules/workflow.md`).
  Use the `valid_*_payload()` helpers; a 422 proves nothing about the
  guard.

## Gotchas
- **Test email addresses**: use `@example.com`, never `.test` TLD —
  Pydantic email-validator rejects `.test` (RFC 6761) with 422 before
  the handler runs (HANDOFF.md "Key lessons" #1, MEH-353).
- **Email transport bugs invisible to pytest**: tests mock `_send_*_email`
  at router level, so Resend-side bugs (encoding, MIME) ship green
  (MEH-325). Live "Show original" inspection mandatory before closing
  any email ticket.
- **HIBP autouse mock**: `_mock_hibp_clean` in `conftest.py` is skipped
  for `test_password_policy.py` only — that file manages its own HIBP
  mocks per test.
- **Windows pytest gotcha**: never pipe with `| tail -1` — blocks output;
  run unpiped and wait ~75s for the suite.

## Cross-refs
- `tests/conftest.py` — fixtures, factories, schema bootstrap.
- `docs/TESTING.md` — pytest + Playwright guide.
- `.claude/rules/testing.md` — Definition of Done, Rule 5a, Rule 20.
