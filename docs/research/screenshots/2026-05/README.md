# Screenshots — 2026-05 competitive discovery

**Status:** No screenshots captured. Sandbox limitation — see methodology note in [`../../2026-05-competitive-discovery-research.md`](../../2026-05-competitive-discovery-research.md#section-0--methodology--sandbox-limitations).

The MEH-595 spec asked for ≥20 site screenshots in this directory. They were not produced from this session because:

1. **WebFetch is gated by the MEH-397 allowlist** (`.claude/hooks/check-webfetch-allowlist.sh`). The allowlist permits 7 first-party hosts (`github.com`, `anthropic.com`, `npmjs.com`, `pypi.org`, `mehamakor.online`, `vercel.com`, `railway.app`). All 19 competitor domains are blocked, fail-closed.
2. **Playwright MCP tools are not connected to the harness Claude Code session.** Per CLAUDE.md: *"MCP tools — standalone CC only (Git Bash → `claude`); harness CC can't reach user-registered MCPs."* The screenshot-capture sub-agent confirmed `mcp__playwright__*` returned *"No such tool available"*.

This is a known and documented sandbox constraint — not a fabrication risk. Per the spec's "no fabrication" rule, we noted the limitation and continued with WebSearch-only analysis instead of inventing screenshots.

**To unblock screenshots for a future pass:**

- Smadar opens standalone Claude Code (Git Bash → `claude`) where Playwright MCP is registered, OR
- Captures screenshots manually in her browser and drops them into this directory using the slugs in the report (`crowdfarming-desktop.png`, `lrqdo-desktop.png`, etc.), OR
- A scoped allowlist widening (separate PR) adds the 19 hosts to `.claude/hooks/check-webfetch-allowlist.sh` for research sessions.

The report's per-site analyses cite WebSearch snippets and verbatim Hebrew page titles instead of screenshot evidence. Confidence is calibrated section-by-section in the main file.
