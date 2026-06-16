# 🤖 EXECUTION_PROTOCOL.md — Autonomous Claude Code Workflow

> **Companion to** `docs/EXECUTION_PLAN.md`  
> **Purpose:** Define exactly *how* Claude Code executes tasks at each autonomy level.  
> **Audience:** Claude Code (operator), Smadar (orchestrator), future Claude instances.

---

## 🎯 Core Principle

**Smadar is solo founder. Her time is the bottleneck — not Claude's.**

The autonomy system exists to **maximize Smadar's leverage**:
- 🟢 GREEN tasks → Smadar approves PR (1 minute) instead of every edit (30 minutes)
- 🟡 YELLOW tasks → Smadar approves plan (5 min) instead of plan+each chunk (30 min)
- 🔴 RED tasks → Smadar stays in the loop because the cost of being wrong is high

**The system FAILS if:**
- 🟢 task asks for approval mid-stream → wasted Smadar's time
- 🔴 task runs without approval → potential schema corruption / brand drift / security incident

---

## 🟢 GREEN — Full Auto Workflow

### When to use
- Single-file changes (or 1-2 files)
- Mechanical patterns (i18n key migration, translation, audit reports)
- No DB schema changes
- No new env vars
- No design taste decisions
- Spec is unambiguous in Linear description

### The 6-step GREEN flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Smadar tags Claude in Linear MEH-XXX                    │
│     (or: Claude pulls from "ready for execution" backlog)   │
├─────────────────────────────────────────────────────────────┤
│  2. Claude reads:                                            │
│     - MEH description (full, via list_issues + get_issue)   │
│     - Related files (project_knowledge_search)              │
│     - .claude/rules/ for relevant rules                     │
├─────────────────────────────────────────────────────────────┤
│  3. Claude creates branch: feature/meh-XXX-slug             │
│     Base: staging (CLAUDE.md rule)                          │
├─────────────────────────────────────────────────────────────┤
│  4. Claude executes the task end-to-end:                    │
│     - Lazy edits with `// ... existing code ...` markers    │
│     - One commit per logical change                         │
│     - Run npm run build + relevant tests                    │
│     - Verify against <verification_step> from Linear        │
├─────────────────────────────────────────────────────────────┤
│  5. Claude pushes + opens PR via gh CLI                     │
│     PR description ends with "Closes MEH-XXX"               │
│     Includes: diff summary, build output, screenshots       │
├─────────────────────────────────────────────────────────────┤
│  6. Smadar reviews PR (1 min on mobile) → merge or request  │
│     If merge: Linear auto-marks Done                        │
│     If request changes: Claude addresses in same PR         │
└─────────────────────────────────────────────────────────────┘
```

### Required `.claude/settings.json` for GREEN tasks

```json
{
  "autoApprove": {
    "Bash": [
      "npm run build",
      "npm test*",
      "npm install",
      "pytest*",
      "git status",
      "git diff*",
      "git log*",
      "git add*",
      "git commit*",
      "git checkout*",
      "git branch*",
      "git push origin feature/*",
      "grep*",
      "rg*",
      "find*",
      "ls*",
      "cat*",
      "head*",
      "tail*",
      "gh pr create*",
      "gh pr view*",
      "gh pr diff*"
    ],
    "Edit": [
      "frontend/messages/he.json",
      "frontend/messages/en.json",
      "frontend/components/**",
      "frontend/app/**",
      "frontend/lib/**",
      "frontend/__tests__/**",
      "frontend/e2e/**",
      "backend/tests/**",
      "docs/audits/**",
      "CHANGELOG.md",
      "HANDOFF.md"
    ],
    "Write": [
      "docs/audits/**",
      "frontend/__tests__/**",
      "frontend/e2e/**"
    ]
  }
}
```

### What Claude must NEVER auto-do (even on GREEN)

```json
{
  "alwaysAsk": {
    "Bash": [
      "git push origin staging",
      "git push origin main",
      "git push --force*",
      "git rebase*",
      "git reset --hard*",
      "alembic upgrade*",
      "alembic downgrade*",
      "railway*",
      "vercel*",
      "gh pr merge*",
      "gh pr close*",
      "rm -rf*",
      "rm *",
      "psql*",
      "DROP TABLE*",
      "DELETE FROM*",
      "pip install*",
      "npm publish*"
    ],
    "Edit": [
      "backend/app/main.py",
      "backend/app/config.py",
      ".github/workflows/**",
      ".claude/settings.json",
      ".claude/hooks/**",
      "frontend/middleware.ts",
      "frontend/next.config.js",
      "Dockerfile",
      "railway.json",
      ".env*",
      "package.json",
      "package-lock.json"
    ]
  }
}
```

> **MEH-836:** `backend/alembic/versions/**` was removed from the Edit
> deny list (paired with the same removal in `.claude/settings.json`,
> Edit + Write). CC may now author hand-written revision files; the
> `Bash(alembic upgrade*/downgrade*)` denies stay (apply is automatic on
> Dockerfile boot, never a manual CC step).

---

## 🟡 YELLOW — Plan Approval Once Workflow

### When to use
- Multi-file features
- Refactors crossing 3+ files
- New backend endpoints (without schema change)
- Multi-component frontend work

### The flow

```
1. Claude reads Linear MEH-XXX
2. Claude posts NUMBERED PLAN as Linear comment OR chat message:
   - File-by-file list of changes
   - Migration plan (if any — even no-schema migrations)
   - Verification strategy
   - Estimated complexity
3. Smadar replies "go" or requests changes
4. Claude executes end-to-end (as GREEN flow steps 3-6)
5. PR opened — Smadar reviews
```

### Plan template (Claude posts this verbatim)

```markdown
## 📋 Plan for MEH-XXX

**Branch:** feature/meh-XXX-slug off staging  
**Estimated PRs:** 1 (or specify if split needed)  
**Risk level:** Low/Medium  

### Files to touch
1. `path/to/file1.jsx` — what changes
2. `path/to/file2.py` — what changes
3. `path/to/test.py` — new tests

### Files NOT to touch
- `path/to/sensitive.py` — out of scope (reason)

### Order of operations
1. Read existing code (grep + view)
2. Apply changes in lazy-edit style
3. Run build + tests
4. Verify against <verification_step> from Linear
5. Open PR

### Verification checklist
- [ ] npm run build green
- [ ] pytest green (relevant tests)
- [ ] Mobile preview (if frontend)
- [ ] CHANGELOG + HANDOFF updated

### Open questions
None / [list any clarifications needed]

**Ready to proceed?** Reply "go" or request changes.
```

---

## 🔴 RED — Step-by-Step Workflow

### When to use
- Alembic migrations (CLAUDE.md rule explicitly requires this)
- New env vars (CLAUDE.md rule explicitly requires this)
- Logo / brand decisions
- Schema changes
- Production deploys
- Security configs (.claude/hooks/, settings.json)
- Strategic decisions (research interpretation)

### The flow

```
1. Claude proposes overall approach (chat message)
2. Smadar approves direction
3. For EACH chunk:
   a. Claude shows the change (file diff or migration SQL)
   b. Smadar approves THAT chunk
   c. Claude applies it
   d. Verify before next chunk
4. End-to-end test
5. PR opened — Smadar reviews entire bundle
```

### Critical RED rules (from CLAUDE.md)

> **Never add/remove DB columns without generating an Alembic revision.**  
> **Show the revision file before applying. Wait for explicit approval.**

> **Never add new env vars without listing them explicitly and waiting for confirmation.**

> **If stuck after 2 attempts: STOP, describe the problem, ask for direction. Never try a 3rd workaround silently.**

---

## 🚦 The Decision Tree

When Claude receives a task, run this decision tree:

```
1. Is this on the post-launch list (Phase 7)?
   YES → Confirm trigger conditions met (launch + N days). If not → defer.

2. Read Linear description. Look for `autonomy` field.
   GREEN → use GREEN flow
   YELLOW → use YELLOW flow
   RED → use RED flow
   MISSING → default to YELLOW + flag to Smadar to update Linear

3. Is the spec unambiguous?
   NO → escalate one level (GREEN→YELLOW, YELLOW→RED)

4. Does the task touch any "alwaysAsk" path?
   YES → escalate to RED for that chunk specifically

5. Is the spec asking for "while I'm here" extras?
   YES → flag explicitly, don't expand scope silently
```

---

## ⚠️ Escalation Protocol

**When to escalate from your starting level:**

| Trigger | Action |
|---------|--------|
| 2 consecutive build failures | Stop, describe problem, ask Smadar |
| Discovered need for new env var | Stop, list var explicitly, wait for confirm |
| Discovered need for migration | Stop, draft revision, show Smadar before apply |
| Test reveals broken behavior in OTHER component | Stop, scope-check with Smadar (file separate MEH?) |
| Hebrew copy "doesn't read naturally" | Stop, return to Smadar for taste decision |
| Conflict between MEH spec and code reality | Stop, surface gap to Smadar |
| Linear description references file that doesn't exist | Stop, verify with grep, ask Smadar if path changed |

**Never silently:**
- Try a 3rd workaround after 2 failures
- Expand scope ("while I'm here let me also fix...")
- Mark task complete with broken tests
- Push to staging without local build verification

---

## 🛠️ Setup: Implementing Autonomy in Claude Code

### Step 1: Update `.claude/settings.json`

Add the `autoApprove` and `alwaysAsk` blocks from this doc.

### Step 2: Add hook `.claude/hooks/check-autonomy-level.sh`

This hook reads the current Linear MEH-XXX from the branch name, looks up the autonomy level, and either auto-approves or escalates.

```bash
#!/bin/bash
# .claude/hooks/check-autonomy-level.sh
# Pre-tool-use hook that respects MEH autonomy markers

set -euo pipefail

# Extract MEH-XXX from current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
MEH_ID=$(echo "$BRANCH" | grep -oE 'meh-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]' || echo "")

if [ -z "$MEH_ID" ]; then
    # Not on a MEH branch — default to interactive
    exit 0
fi

# Read autonomy from cached classification (regenerate via Project Claude)
AUTONOMY_FILE=".claude/autonomy-cache.json"
if [ ! -f "$AUTONOMY_FILE" ]; then
    echo "⚠️ Autonomy cache missing. Defaulting to interactive." >&2
    exit 0
fi

LEVEL=$(jq -r ".[\"$MEH_ID\"] // \"YELLOW\"" "$AUTONOMY_FILE")

# Pass autonomy level to subsequent steps via stdout (Claude reads this)
echo "{\"autonomy\": \"$LEVEL\", \"meh_id\": \"$MEH_ID\"}"
exit 0
```

### Step 3: Generate `.claude/autonomy-cache.json`

Smadar runs this once per session via Project Claude:

```bash
# Project Claude exports the cache
# Output: .claude/autonomy-cache.json
{
  "MEH-520": "GREEN",
  "MEH-521": "GREEN",
  ...
  "MEH-122": "RED",
  ...
}
```

### Step 4: GitHub Action for fully autonomous runs (optional, advanced)

For 🟢 GREEN tasks, Smadar can trigger CC via GitHub Action:

```yaml
# .github/workflows/claude-code-autonomous.yml
name: Claude Code — Autonomous Task
on:
  issue_comment:
    types: [created]
jobs:
  run-cc:
    if: contains(github.event.comment.body, '/cc-auto')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          autonomy-level: green-only
          # Refuses to run if Linear MEH is not GREEN
```

This means Smadar can comment `/cc-auto` on a GitHub issue and CC runs end-to-end.

---

## 📋 What Smadar Approves (vs CC handles)

### Smadar always approves:
- 🔴 RED chunks (per chunk)
- All PRs (every level)
- Plan for 🟡 YELLOW (once per task)
- Anything touching `alwaysAsk` paths
- Brand/design decisions
- New env vars (explicit list)
- Migration files (before apply)

### CC handles autonomously (after autonomy-level grant):
- 🟢 GREEN end-to-end execution
- 🟡 YELLOW execution after plan approval
- All file edits in safe paths
- All standard build/test commands
- Branch creation + commits + push to feature branches
- PR creation
- Hebrew copy in safe contexts (i18n keys, test fixtures)
- Documentation updates (CHANGELOG, HANDOFF)

### Both share:
- Linear status updates (CC writes them, Smadar can override)
- HANDOFF.md updates (CC drafts, Smadar approves on PR)
- CHANGELOG entries (same)

---

## 🎯 Success Metrics

You know the autonomy system is working when:

✅ Smadar spends <30 min/day on Linear/Claude orchestration  
✅ 🟢 GREEN tasks complete without Smadar input mid-execution  
✅ 🟡 YELLOW tasks have ONE approval cycle (plan → execution → PR)  
✅ 🔴 RED tasks never auto-execute risky changes  
✅ Zero unauthorized migrations / env var additions  
✅ Zero "while I'm here" scope creep  
✅ All PRs have clean spec→implementation correspondence  

You know the system is BROKEN when:

❌ Claude asks for approval on every edit even for 🟢 tasks  
❌ Claude silently expands scope past Linear description  
❌ Claude pushes migrations without showing the file  
❌ Smadar finds out about a new env var via Vercel error  
❌ Claude adds packages to package.json without ask  

---

## 🔄 Iteration

This protocol is v1. Update it (with Smadar approval) when:
- A 🟢 task causes regression → reclassify to 🟡
- A 🟡 task lands cleanly 5 times → consider 🟢
- A new tool/workflow shifts the GREEN/YELLOW boundary
- Smadar's preferences change

Track changes in this section:
- 2026-05-10: Initial creation. 54/45/44 GREEN/YELLOW/RED split.

---

## 📚 References

- `docs/EXECUTION_PLAN.md` — task list with autonomy markers
- `CLAUDE.md` — base operating rules
- `.claude/rules/` — domain-specific rules (RTL, security, db, etc.)
- Anthropic Claude Code docs: https://docs.claude.com/claude-code
- Linear MCP: https://linear.app/integrations
