# MEH-3151 — `.github/pull_request_template.md`: no line hands a check to a person

`.github/**` cannot be written from the CC shell (security.md § permissions.deny).
Apply **after MEH-3150** (it edits the same section). Claude in Chrome commits it;
CC then verifies the PR diff byte-for-byte.

Why: Sapir, 14/11/2026 — «לא עושים בדיקות ידניות יותר… אני לא בודקת כלום».
The two "Tested on …" lines and the "hit manually" line ask a human to test.

```diff
-## Manual checks (required before marking Ready for Review)
+## Self-checks by the session (required before marking Ready for Review)
@@
-- [ ] Tested on mobile: iOS Safari + Android Chrome (skip for docs-only)
-- [ ] Tested on desktop
+- [ ] UI change: 375 + 1440 screenshots in `qa-artifacts/MEH-XXXX/`, read by the session (rule 23); preview 390 WebKit + 1280 Chromium (rule 38). Skip for docs-only
+- [ ] Anything a simulator cannot prove is listed under «סיכון שנותר» — never as a step for a person (MEH-3151)
@@
-- [ ] Any endpoint that queries the new column(s) was hit manually after
-      the migration ran
+- [ ] Any endpoint that queries the new column(s) was called by the session
+      against a DB built with `alembic upgrade head` (not `create_all`)
```
