# Emergency Override — When to Skip the Central Component Protocol

Skipping the 4-step protocol for a central component is legitimate in exactly two scenarios:

## Allowed Skips

| Scenario | What to skip | What NOT to skip |
|---|---|---|
| Production hotfix — every minute matters | Step 3 (regression test) — write it post-merge | Steps 1, 2, 4 — never skip |
| Docs/comments only — zero logic change | Steps 2, 3 (adversarial + test) | Steps 1, 4 — still read + log |

When in doubt: follow the full protocol. The 4 steps take less than 5 minutes.

## Emergency Log

If you skip any step, append an entry to `.claude/emergency-log.json` before merging:

```json
{
  "date": "YYYY-MM-DD",
  "pr": "#NNN",
  "file": "backend/app/routers/producers.py",
  "skipped_steps": [3],
  "reason": "Production hotfix — MEH-XXX, user data visible to wrong account",
  "followup_issue": "MEH-XXX+1 — add regression test post-merge"
}
```

The file is append-only (a JSON array). Create it with `[]` on first use.

## Schema

| Field | Type | Description |
|---|---|---|
| `date` | `YYYY-MM-DD` string | Date of the override |
| `pr` | `#NNN` string | PR number where the skip occurred |
| `file` | relative path string | Central component that was edited |
| `skipped_steps` | number[] (1–4) | Which protocol steps were skipped |
| `reason` | string | Why the override was necessary |
| `followup_issue` | string | Linear/GitHub issue to complete the skipped step |

## Accountability

Emergency overrides are visible in PRs (the log file appears in the diff).
Any override without a `followup_issue` is not a valid override — open the issue first.
