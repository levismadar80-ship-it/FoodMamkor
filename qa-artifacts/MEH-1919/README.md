# MEH-1919 — /register success-affordance noise

390px Chromium captures from `frontend/e2e/qa-meh1919-register-success.mjs`,
run against a local `next start` build of the same commit.

- `before/` — the harness run against the pre-MEH-1919 component (6 assertion
  failures, all on the success path).
- `after/` — the first pass: name success removed, email reduced to a
  border-primary tint (16/16 against the assertions **as they stood then**).
- `after-removal/` — the follow-up (Sapir, 06/08): email success removed too,
  17/17. This is the shipped state; `after/` is a superseded intermediate and
  is kept only so the three-way comparison stays readable.

Same script, same viewport, same fixtures — only the component differs, so the
pair is a controlled comparison rather than two unrelated screenshots.

| Frame | What changed |
|---|---|
| `1-name-valid-blurred-390` | before: green border + Check + "✓ תקין" on a filled name — after: neutral border, nothing |
| `3-email-blurred-valid-390` | before: green border + Check + "✓ תקין" · after: green border only · **after-removal: neutral border, byte-identical to the pristine field** (`rgb(229,223,211)`) |
| `5-email-error-390`, `6-name-error-390` | identical in all three — the error path was never touched (`rgb(179,38,30)`) |

A re-run writes to `latest/` so it cannot overwrite either reference.
