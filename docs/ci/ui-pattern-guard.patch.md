# `UI pattern guard` — workflow patch (MEH-999)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot wire this
job itself. The script is merged and runnable today; this doc is the exact YAML
for **Sapir** to apply to `.github/workflows/pr-checks.yml`.

Same shape as [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md).

---

## What it guards

`scripts/checks/ui-pattern-guard.sh` — three grep-level rules against the
producer-dashboard consistency defects found in the 26/07 QA sweep:

| Rule | Fails when |
|---|---|
| 1 | A manage-list page (`events` · `experiences` · `recipes` · `group-buys` · `followers`) renders a `t("…empty…")` string without importing `EmptyState`. |
| 2 | A dashboard page hand-rolls a back link (arrow + `/producer/dashboard*` href) without importing `BackLink`. |
| 3 | A BackLink-owned `.back` / `.back_link` value in `frontend/messages/he.json` contains a `←`/`→` text arrow. |

Escape hatch: `guard-ok: <reason>` in a comment within ±1 line (the `rtl-ok`
convention from `.claude/hooks/check-rtl.sh`).

Runtime is ~1s: no checkout of history, no Node, no install.

---

## Step 1 — add the job

Insert alongside the other lightweight always-run gates (near `qa-artifacts-size`,
`pr-checks.yml:76`):

```yaml
  ui-pattern-guard:
    name: UI pattern guard
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: actions/checkout@v7
      - name: Guard producer-dashboard UI patterns (MEH-999)
        run: bash scripts/checks/ui-pattern-guard.sh
```

No `paths-filter` gating: the script is ~1s and always-run keeps it off the
"skipped required check reports as Expected" trap (MEH-892) if it is ever
promoted to a directly-required context.

## Step 2 — wire it into the `CI gate (required)` aggregator

Three edits inside the existing `ci-gate` job (`pr-checks.yml:644`):

**2a.** add to `needs:` (after `- qa-artifacts-size`, `pr-checks.yml:650`):

```yaml
      - ui-pattern-guard
```

**2b.** add to the step `env:` block (after `R_QA_SIZE`, `pr-checks.yml:669`):

```yaml
          R_UI_PATTERN: ${{ needs.ui-pattern-guard.result }}
```

**2c.** add to the always-required leg (after the `qa-artifacts size cap`
`check` call, `pr-checks.yml:708`):

```bash
          check "UI pattern guard" "$R_UI_PATTERN"
```

It belongs in the **stack-independent** block, not behind
`if [ "$FRONTEND_TOUCHED" = "true" ]`: rule 3 reads `frontend/messages/he.json`,
which a docs/config-only PR never touches, so the guard is a no-op there and
costs nothing — while `always()` + the existing `ok()` helper (which treats
`skipped` as pass) keeps docs-only PRs green.

**No ruleset change is needed.** `CI gate (required)` is already a required
context on ruleset 15240090; adding a leg to its aggregator makes the guard
blocking without touching the ruleset — the same mechanism `qa-artifacts-size`
uses (MEH-1156).

---

## Verification already done (CC side)

- Exits **0** on post-MEH-999 `staging`.
- Each rule proven to actually fire (fail → restore → pass):
  - rule 1 — dropped the `EmptyState` import from `dashboard/events/page.js` → 3 violations, exit 1
  - rule 2 — hand-rolled `<Link href="/producer/dashboard/tools">← …</Link>` on the recipes page → 1 violation, exit 1
  - rule 3 — restored `"back": "← חזרה לאירועים שלי"` in `he.json` → 1 violation (`he.json:4331`), exit 1
- Escape hatch verified: the same rule-2 violation with `guard-ok: …` on the
  preceding line → exit 0.

## Known gap to close later

Rule 3 is scoped to the namespaces MEH-999 migrated. Two keys ending in `.back`
still carry a `→` and are **not** flagged — `recipes.detail.back` and the
admin-panel `back` (both `frontend/messages/he.json`). Their pages do not use
`BackLink`, so stripping the arrow from the string would leave them with no
arrow at all. Widen `NAMESPACES` in the script as each page is migrated; the
gap is documented in the script header too.
