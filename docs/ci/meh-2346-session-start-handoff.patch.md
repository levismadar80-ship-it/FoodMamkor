# MEH-2346 — the SessionStart hook never shows the current HANDOFF section (patch for Sapir)

> **Not applied.** `.claude/hooks/**` is deny-enforced for CC (filesystem tools and the
> Contents API both; `.claude/rules/security.md`). This is the hunk and the measurement
> behind it. Sapir applies it, or declines it.

## What the hook does today — measured 2026-10-26 on `staging`

`.claude/hooks/session-start.sh` is wired twice in `.claude/settings.json` (`SessionStart`,
lines 172 and 183). It builds one string and truncates it to 3,000 characters:

1. a header (branch + MEH id) — ~90 chars
2. `head -30 docs/CHANGELOG.md | tail -17` — **4,353 chars** today
3. `tail -40 HANDOFF.md`

Two defects, independent of each other:

| | Defect | Effect |
|---|---|---|
| A | Step 2 alone is longer than the whole 3,000-char budget | Step 3 is **cut off entirely**. Running the hook (`CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh \| tail -c 700`) ends mid-CHANGELOG-bullet; the `### HANDOFF.md` heading never appears. |
| B | `HANDOFF.md` is **newest-first**, so `tail -40` is the *oldest* 40 lines | Whenever step 3 did fit, it injected the oldest section in the file. Before MEH-2345's archive that section was from **2026-06-13**. After it, it is still the oldest section kept, not the current one. |

So every session on this repo starts with a CHANGELOG excerpt and no current state. In the
cases where it did get state, the state was stale. That is the same failure ADR-035 is about,
but this one is automatic.

## The hunk

Replace the CHANGELOG block and the HANDOFF block (everything from `### docs/CHANGELOG.md`
through the HANDOFF `fi`) with:

```bash
OUTPUT="${OUTPUT}### HANDOFF.md — newest section (where we are now)
"

HANDOFF="$ROOT/HANDOFF.md"
if [ -f "$HANDOFF" ]; then
  # HANDOFF.md is newest-first (ADR-035): print from the first "## " header up to,
  # not including, the second one. tail would show the OLDEST section.
  OUTPUT="${OUTPUT}$(awk '/^## /{n++} n==1' "$HANDOFF")"
else
  OUTPUT="${OUTPUT}(HANDOFF.md not found)"
fi

# Truncate to 3000 chars
printf '%s' "$OUTPUT" | head -c 3000
```

CHANGELOG is dropped from the injection, not shortened. Under ADR-035 it is history, and the
current state lives in the top HANDOFF section. A session that needs history reads the file.

## How to check it after applying

```bash
CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh | sed -n 4,6p
```

The output should show the header of the **first** `## ` section of `HANDOFF.md`, i.e. the
newest date in the file. If it shows any other section, the patch did not apply.
