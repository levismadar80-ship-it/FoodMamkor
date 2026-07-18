# MEH-449 — `.claude/settings.json` hook registration (Sapir-apply)

Layer 4 of the MEH-449 AI-artifact leak defense is the
`check-artifact-location.sh` PreToolUse hook (shipped in this PR). Its
**registration** in `.claude/settings.json` could not be applied by Claude
Code: direct edits to `settings.json` are blocked by
`protect-lint-config.sh` (MEH-442 self-protect) **and** by the harness
permission layer — both blocks fired as designed. Same staged-patch flow
as [e2e-gate.patch.md](./e2e-gate.patch.md).

## What to apply

Insert the block below into the `hooks.PreToolUse` array of
`.claude/settings.json`, **directly BEFORE** the central-component-guard
block (the `Edit|Write|MultiEdit` entry whose `_comment` starts with
`"Central component guard (MEH-128)"`):

```json
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "timeout": 10000,
            "_comment": "MEH-449 Layer 4 — AI-artifact location guard: blocks writing AI dev artifacts (CLAUDE.md, HANDOFF.md, ROADMAP.md, CHANGELOG.md, AGENTS.md, .claude/, .cursor/, docs/SECURITY.md family — canonical list lives in the hook) into deployable directories (frontend/public/, frontend/app/api/, backend/static/, backend/app/static/). Exit 2 = block. Fail-closed if jq missing or input malformed.",
            "command": "bash \"${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/.claude/hooks/check-artifact-location.sh\""
          }
        ]
      },
```

## Verify after applying

```bash
jq . .claude/settings.json > /dev/null && echo "JSON valid"
# hook self-check — must print exit=2 (block):
echo '{"tool_name":"Write","tool_input":{"file_path":"frontend/public/CLAUDE.md","content":"x"}}' \
  | bash .claude/hooks/check-artifact-location.sh; echo "exit=$?"
# and exit=0 (allow):
echo '{"tool_name":"Write","tool_input":{"file_path":"frontend/public/logo.png"}}' \
  | bash .claude/hooks/check-artifact-location.sh; echo "exit=$?"
```

Until this is applied the hook file exists but is inert — Layers 1–3
(ignore files, CI scanner, e2e probe) are live from the moment the PR
merges regardless.
