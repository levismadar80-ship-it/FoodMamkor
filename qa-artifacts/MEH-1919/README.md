# MEH-1919 — /register success-affordance noise

390px Chromium captures from `frontend/e2e/qa-meh1919-register-success.mjs`,
run against a local `next start` build of the same commit.

- `before/` — the harness run against the pre-MEH-1919 component (6 assertion
  failures, all on the success path).
- `after/` — the same harness against the shipped component (16/16 pass).

Same script, same viewport, same fixtures — only the component differs, so the
pair is a controlled comparison rather than two unrelated screenshots.

| Frame | What changed |
|---|---|
| `1-name-valid-blurred-390` | before: green border + Check + "✓ תקין" on a filled name — after: neutral border, nothing |
| `3-email-blurred-valid-390` | before: green border + Check + "✓ תקין" — after: green border only |
| `5-email-error-390`, `6-name-error-390` | identical in both — the error path is untouched |

A re-run writes to `latest/` so it cannot overwrite either reference.
