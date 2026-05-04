# .claude/hooks — Claude Code deterministic hooks

Three bash hooks that enforce CLAUDE.md rules without relying on Claude's memory.
All hooks are fast (<500ms), run as bash subprocesses (zero token cost), and
fail-open when dependencies are missing.

## Hook inventory

| File | Event | Trigger | Action |
|------|-------|---------|--------|
| `session-start.sh` | SessionStart | Every new session | Injects branch + HANDOFF context into Claude's context window |
| `check-rtl.sh` | PreToolUse | Edit / Write / MultiEdit | Blocks physical RTL classes (`left-*`, `right-*`, `ml-*`, `mr-*`, `pl-*`, `pr-*`) |
| `check-bash-safety.sh` | PreToolUse | Bash | Blocks dangerous DDL (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`) and destructive filesystem commands (`rm -rf /`, `rm -rf ~`) |
| `protect-lint-config.sh` | PreToolUse | Edit / Write / MultiEdit | MEH-442: blocks edits to lint configs (`frontend/.eslintrc.*`, `frontend/eslint.config.*`, `backend/pyproject.toml`), `.claude/settings.json`, and itself. Prevents AI from disabling MEH-441 lint guardrails. |
| `lint-feedback.sh` | PostToolUse | Edit / Write / MultiEdit | MEH-445: runs eslint (frontend) or ruff (backend) on the just-edited code file. Returns lint errors to Claude as feedback. 3-strikes-per-file: attempts 1-2 emit `decision:approve` + reason (continue with feedback), attempt 3 emits `decision:block` + exit 2. Skips `.claude/*` (self-protect) and missing tooling (silent exit 0). |

## Requirements

- **bash** (Git Bash on Windows, bash on Linux/macOS)
- **jq** — required for `check-rtl.sh` and `check-bash-safety.sh`
  - Git Bash (MinGW): `pacman -S jq`
  - macOS: `brew install jq`
  - Linux: `apt install jq` or `dnf install jq`
  - Manual: https://jqlang.github.io/jq/download/
  - If jq is missing, both hooks **fail-open** (exit 0) with a stderr warning — they never block work.

## How to disable hooks

### Disable all hooks temporarily (emergency exit hatch)

Add `"disableAllHooks": true` to `.claude/settings.json`:

```json
{
  "disableAllHooks": true,
  ...
}
```

Remove the key to re-enable. This is the fastest way out if a hook is
misbehaving mid-session.

### Disable a single hook

Remove or comment out its entry in `.claude/settings.json` under the
relevant event key (`SessionStart`, `PreToolUse`, etc.).

## How to extend the RTL allowlist

Edit `check-rtl.sh` and add the file path to the `ALLOWLIST` array:

```bash
ALLOWLIST=(
  "frontend/app/map/MapClient.jsx"
  # ... existing entries ...
  "frontend/components/YourNewComponent.jsx"   # reason: centering idiom / carousel / eye-toggle
)
```

**Before adding to the allowlist**, verify the physical class is genuinely
intentional (centering idiom, carousel arrow, eye-toggle inside `dir="ltr"`,
or geographic map control). If it's a new use case, update
`.claude/rules/rtl.md` with the exception and its rationale.

### Auto-allowlisted: `*.md` files

Any file ending in `.md` is auto-allowlisted by the hook. Documentation
files reference class names verbatim as examples (CLAUDE.md and the rule
files in `.claude/rules/` cite known LTR-input exceptions in prose). RTL
enforcement targets runtime CSS, not prose. Added in MEH-355 after
MEH-342 hit this friction moving rule examples between docs.

The auto-allowlist matches the trailing `.md` only (case-sensitive,
lowercase). Other doc extensions (`.MD`, `.markdown`, `.mdx`) are not
recognized — add them here if they appear in the repo.

## How to extend the bash safety blocklist

Edit `check-bash-safety.sh` and add a new `check_pattern` call:

```bash
check_pattern 'YOUR_PATTERN_HERE'  "Human-readable label"
```

Patterns are case-insensitive extended regex (`grep -iEq`).

## Timing reference (CI baseline — 2026-04-26)

Measured with `time bash .claude/hooks/<script>.sh < sample.json`:

| Hook | Typical runtime |
|------|----------------|
| `session-start.sh` | ~80ms |
| `check-rtl.sh` | ~30ms |
| `check-bash-safety.sh` | ~25ms |
| `protect-lint-config.sh` | ~7ms |
| `lint-feedback.sh` | ~2400ms (cold; npx eslint dominates — clean-file path still invokes the linter) |

PreToolUse hooks all run well under 500ms. The PostToolUse
`lint-feedback.sh` is intentionally slower because it invokes the real
linter; budget is 10000ms (configured in settings.json).

## lint-feedback state files (MEH-445)

`lint-feedback.sh` writes per-file attempt counters to
`.claude/hooks/.lint-attempts/<md5>.count` (gitignored). The hash is
the md5 of the repo-relative path; the file contents are an integer.

To reset all counters (e.g. after a long debugging session):

```bash
find .claude/hooks/.lint-attempts -type f -delete && \
  rmdir .claude/hooks/.lint-attempts 2>/dev/null
```

A 3rd-strike `decision:block` resets that file's counter automatically,
so the next session starts fresh on that file. Other files' counters
are untouched.

## Troubleshooting

**Hook fires on a legitimate class:**
Add the file to the `ALLOWLIST` in `check-rtl.sh`. See above.

**Hook blocks a bash command that should be allowed:**
Check `check-bash-safety.sh` patterns. If the pattern is too broad,
narrow the regex or add a negative lookahead.

**SessionStart outputs nothing:**
Verify `CLAUDE_PROJECT_DIR` is set, or that `git rev-parse --show-toplevel`
returns a valid path from the working directory.

**All hooks stopped firing:**
Check `"disableAllHooks"` in `.claude/settings.json`. Also confirm
Claude Code version supports the hook event types used here
(`claude --version` — hooks require Claude Code v1.x+).
