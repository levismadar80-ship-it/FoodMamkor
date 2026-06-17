---
description: Run a batch of Linear MEH-XXX tasks autonomously with auto-fix CI failures. Use when user says "run batch", "execute batch", "ship batch", or asks to work through multiple PRs sequentially from autonomy-cache. Do NOT use for single-PR work, design tasks, or Linear issue creation.
---

Run a batch of Linear MEH-XXX tasks end-to-end: branch → implement → push → PR → post-merge verification. Pause for `go` only on YELLOW autonomy classifications; STOP on RED. Closes the loop with Vercel + Sentry MCP verification once merged.

Industry-rationale (preserved from MEH-344 spec): Boris Cherny uses slash commands for inner-loop workflows; "Scaling Claude Code 2026" warns that long lists of bespoke commands are an anti-pattern — keep this file as a single execution playbook, not a framework.

---

## Section 1 — Pre-flight checks

Run these once at the top of every `/batch` invocation. Abort the batch if any check fails.

1. **Read autonomy cache.** `.claude/autonomy-cache.json` must exist and be valid JSON. Expected baseline: 54 GREEN / 45 YELLOW / 44 RED across 143 tasks. Use `jq 'keys | length'` to confirm.
2. **Verify local settings.** `.claude/settings.local.json` must exist with `Bash(*)` allow + the 30 deny patterns from Section 11. If missing → STOP and ask Smadar to restore (gitignored, not recoverable from the repo).
3. **Linear MCP authenticated.** Run a no-op `mcp__6bc1cb1a-…__get_issue` to confirm; on auth error → tell Smadar to run `/mcp auth linear` interactively.
4. **Vercel + Sentry MCPs authenticated.** Run `/mcp` and confirm both servers are connected (HTTP transport, OAuth token live). Section 9 depends on both.
5. **Pre-merge Sentry snapshot.** Capture `search_issues(query="is:unresolved", limit=10)` before any branch is pushed; this is the comparison baseline for Step 2 of post-merge verification.

---

## Section 2 — Per-task workflow (10 steps)

For each MEH-XXX in the batch list, execute in order. Stop the whole batch at the first STOP condition (Section 5).

1. `get_issue(MEH-XXX)` — full description from Linear.
2. **Autonomy gate.** `jq -r --arg id "MEH-XXX" '.[$id] // "RED"' .claude/autonomy-cache.json` → GREEN proceed, YELLOW pause for explicit `go`, RED stop. Missing entry = treat as RED and ask Smadar to classify.
3. **Branch.** `git checkout staging && git pull origin staging && git checkout -b feature/meh-XX-<slug>`.
4. **Implement** per task spec. Skeptic Mode (MEH-450) — surface scope mismatches before editing.
5. **Pre-commit.** `cd frontend && npm run lint` then `pytest tests/test_api.py` — both must pass before commit. ESLint hook is `--max-warnings=0`.
6. **Commit.** Conventional commit with `Closes MEH-XX` in the message body so Linear auto-closes on merge.
7. **Push.** `git push -u origin feature/meh-XX-<slug>`.
8. **Open PR.** Auto-generate description from Linear ticket + diffstat. Base = `staging`. Draft mode by default.
9. **Wait for Vercel READY.** Poll `list_deployments(projectId, since=<push_timestamp>)` until `state === "READY"` or `ERROR`/`CANCELED`. Cap at 10 minutes.
10. **Linear comment.** `save_comment(issueId=MEH-XXX, body=<PR URL + CI status + Vercel URL>)`.

---

## Section 3 — Auto-fix patterns

Three specific CI failures we have seen repeatedly. Fix autonomously; escalate after 1 failed attempt per pattern per PR.

🔧 **Pattern 1 — `package-lock.json` drift** (e.g., `@swc/helpers` 0.5.15 → 0.5.21).
- Trigger: CI fails with `npm error Missing: <pkg>@<version> from lock file`.
- Fix: `cd frontend && npm install && git add package-lock.json && git commit -m "chore(MEH-XX): sync package-lock <pkg> (preempt CI drift)" && git push`.
- **Preemptive**: if any branch in the batch is older than 24h relative to `origin/staging`, run lock-sync **before** opening CI to avoid the cache time-bomb (lesson 6 from the 2026-05-10 batch).

🔧 **Pattern 2 — ESLint warnings on `--max-warnings=0`.**
- Trigger: `npm run lint` fails on the pre-commit hook.
- Fix: `npm run lint -- --fix` first; if not auto-fixable → STOP and surface to Smadar (manual judgment required for stylistic warnings).

🔧 **Pattern 3 — Pre-commit ESLint filename bug** (MEH-518 reference).
- Symptom: hook scans ALL frontend files instead of staged ones.
- Root cause: `bash -c '…'` with `pass_filenames: true` forwards staged filenames to bash positional params (`$0/$1`), not to ESLint.
- Fix in `.pre-commit-config.yaml`: use the `"${@#frontend/}"` pattern to forward filenames with the `frontend/` prefix stripped. If a branch reverted the fix → re-apply.

---

## Section 4 — Brand voice reminder (CRITICAL — MEH-472 hybrid)

⚠️ Mehamakor brand voice = **HYBRID**, NOT pure feminine, per MEH-472 (May 2026):

| Context | Use | Don't use |
|---|---|---|
| Functional UI (loading, errors) | Gerund: `בטעינה...`, `מתעדכן...` | `טוענת...`, `מתעדכנת...` |
| CTAs (call-to-action) | Plural imperative: `הוסיפו`, `הצטרפו` | `הוסיפי`, `הצטרפי` |
| 2nd-person brand voice | `שלך` (gender-flexible) | (already correct) |
| Producer term | `בית עסק` | `יצרן` — לעולם לא! |

**Pre-commit grep guard** before pushing:
```bash
git diff --staged | grep -E "(הוסיפי|הצטרפי|בואי|הזיני)" && echo "STOP — feminine imperative detected" && exit 1 || true
```
Any hit on a copy file → STOP and ask Smadar before proceeding.

**Bucket-A error/loading canary (MEH-846).** ADR-014 locks UI error/loading
to plural/gerund. This guard catches *re-introduced* feminine error/loading
copy. It is anchored to **added** lines (`^\+`) so a future cleanup that
*removes* feminine strings does not block itself, and ellipsis-anchored
(ASCII `...` **and** Unicode `…`) on the loading participles so it skips
prose mentions (legal/FAQ). The list covers the feminine participles plus
the masculine/neutral strays that occur as loading labels (`טוען`, `שומר`,
`בודק`, `מעדכן`, `מייבא`); any *other* gendered loading participle is still
non-compliant under ADR-014 even if absent here — convert it to gerund:
```bash
git diff --staged | grep -E "^\+.*((טוענת|שולחת|שומרת|מוחקת|יוצרת|בודקת|נרשמת|מאמתת|מחפשת|מפרסמת|מתנתקת|מצרפת|מבטלת|מוסיפה|מעלה|טוען|שומר|בודק|מעדכן|מייבא)(\.\.\.|…)|נסי שוב)" && echo "STOP — Bucket-A non-compliant error/loading detected (ADR-014, MEH-846)" && exit 1 || true
```
Any hit → switch to plural/gerund (`נסו שוב`, `בטעינה…`, `טעינת X…`) before proceeding.

---

## Section 5 — STOP conditions

⛔ Stop the batch — do not silently work around — if any of:

- (a) Phase 0/discovery reveals the problem is bigger than the ticket scope.
- (b) The fix needs to touch a production component outside the declared scope.
- (c) >2 failed attempts on the same root cause.
- (d) Cumulative runtime exceeds 30 minutes for the current task.
- (e) Task is RED autonomy (44 tasks classified RED in the cache).
- (f) Brand voice violation detected (Section 4 grep guard).
- (g) Sentry MCP returns auth error → tell Smadar to run `/mcp auth sentry`.
- (h) Vercel deployment FAILED twice → escalate, do not retry blindly.

---

## Section 6 — Hebrew RTL terminal warning

⚠️ Windows Git Bash terminals render Hebrew RTL **visually reversed**. The file content on disk is correct — what you see in `cat`/terminal output is not authoritative.

- **Always verify with `git diff <file>`** before declaring a copy bug.
- Lesson 3 from the 2026-05-10 batch: Smadar reported a "bug" that was actually a terminal display artifact — wasted ~20 minutes.

---

## Section 7 — Linear MEH-XXX integration

- After a PR is opened: `save_comment(issueId=MEH-XXX, body=<PR URL + CI/Vercel status>)`.
- After merge: `save_issue(id=MEH-XXX, status="Done")` — defensive, in case the `Closes MEH-XX` auto-close didn't fire.
- The `Closes MEH-XX` line in the commit message is the primary mechanism; the `save_issue` is the safety net.

---

## Section 8 — 3-Tier Verification reference (MEH-498 — do NOT duplicate)

After merge, the verification ladder is split across three actors. `/batch` runs Tier 2 only.

- **Tier 1 — Claude.ai** (project-side): content/structure verification via `web_fetch` + Vercel URL fetches. Today (pre-MCP) this is where layout regressions are caught.
- **Tier 2 — Claude Code (this command)**: build/test/Playwright/grep automation, **post-merge autonomous verification via Vercel + Sentry MCPs** (Section 9).
- **Tier 3 — Smadar**: real-device mobile perception only. Nothing else.

Canonical checklist: `docs/MANUAL_TESTING.md` (MEH-498). Do not re-implement the checklist here.

---

## Section 9 — Post-merge autonomous verification (Vercel + Sentry MCPs)

After OAuth to Vercel + Sentry MCPs is live, `/batch` runs verification with **no Smadar in the loop**.

**Step 1 — Vercel deployment health.**
- Tool: `list_deployments(projectId, since=<merge_timestamp>)`.
- Verify: `state === "READY"`. ERROR / CANCELED → fetch build logs → match against Section 3 patterns → 1 auto-fix attempt → STOP if still failing.

**Step 2 — Sentry error baseline.**
- Pre-merge snapshot was captured in Section 1, Step 5.
- Post-merge (15 minutes after Vercel READY): re-run `search_issues(query="is:unresolved", limit=10)`.
- Compare snapshots. New issues only → `analyze_issue_with_seer(<issue_id>)`. Actionable fix → apply + commit. Not actionable → STOP and surface.

**Step 3 — Linear status sync.**
- `get_issue(MEH-XXX)` and confirm status auto-moved to Done (from the `Closes MEH-XX` line). Drift → `save_issue` to fix manually.

**Step 4 — Auth-token expiry handling (KNOWN issue).**
- Per Sentry MCP docs: tokens can expire silently between runs. Detection: any MCP call returning an auth error mid-batch → halt the batch (do not retry). Action: tell Smadar to run `/mcp auth <server>` interactively (~30s, roughly monthly).

---

## Section 10 — `autonomy-cache.json` usage

`.claude/autonomy-cache.json` holds 143 classified tasks:

- 🟢 **54 GREEN** — fully autonomous; CC runs end-to-end and Smadar reviews the PR only.
- 🟡 **45 YELLOW** — pause for explicit `go` before each step.
- 🔴 **44 RED** — STOP; manual review required.

Per-task gate (already part of Section 2, Step 2):

```bash
AUTONOMY=$(jq -r --arg id "MEH-XXX" '.[$id] // "RED"' .claude/autonomy-cache.json)

case "$AUTONOMY" in
  "GREEN")  echo "Proceeding autonomously" ;;
  "YELLOW") echo "PAUSE — wait for Smadar 'go'" ; exit 0 ;;
  "RED")    echo "STOP — manual review required" ; exit 1 ;;
  *)        echo "STOP — task not classified, ask Smadar" ; exit 1 ;;
esac
```

**Cache update policy:** never silently classify a missing task. Always stop and ask Smadar to add the entry to `autonomy-cache.json` before continuing.

---

## Section 11 — `.claude/settings.local.json` (gitignored, critical)

**What it is.** Local config (gitignored) that allows CC to run compound bash patterns (`cd frontend && npm install`) and applies 30 strict deny patterns.

**Deny patterns (the 30 critical entries):**

- `git push origin main` / `git push origin staging` — direct push, must go through PR.
- `git push --force` — any force push.
- `alembic upgrade` / `downgrade` / `stamp` / `revision` — schema changes go through reviewed migrations only.
- `railway up` / `redeploy` / `run` / `delete` — infra mutations are Smadar-only.
- `vercel --prod` / `deploy` / `rollback` / `promote` — production deploys are Smadar-only.
- `gh pr merge` / `gh pr close` — merge / close decisions are Smadar-only.
- `rm -rf` / `sudo` — filesystem and privilege escalation guards.
- `npm publish` / `pip install --break-system-packages` — package mutations.
- `curl -X DELETE` — destructive HTTP.
- SQL: `DROP TABLE` / `DROP DATABASE` / `DELETE FROM` (no WHERE) / `TRUNCATE`.

**If the file is missing or corrupted:** `/batch` will crash on the first compound command (`cd frontend && npm install`). Pre-flight check (Section 1, Step 2) catches this before any task starts. STOP and ask Smadar to restore — the file is gitignored and cannot be reconstructed from the repo.

---

End of `/batch` playbook. Cross-references: MEH-450 (Risk-Tier Authority), MEH-472 (brand voice hybrid), MEH-498 (3-Tier Verification), MEH-385 (pr-reviewer subagent), MEH-428 (adversarial-review variants).
