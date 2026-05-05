# ADR-004: Skills supply chain — 5-layer defense

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** Smadar Levi
**Source:** MEH-397 (initiative); `.claude/rules/skills.md`; HANDOFF.md:57-65 (initiative-complete table); CHANGELOG.md:387

## Context
Mehamakor uses 71 third-party Claude skills under `.agents/skills/`.
Snyk ToxicSkills (Feb 2026) found 13.4% of 3,984 ClawHub skills had
critical security issues with 76 confirmed malicious payloads
(skills.md threat-model section). A single malicious SKILL.md could
exfiltrate `.env` or run arbitrary commands inside the harness.

## Decision
Defense-in-depth, fail-closed across 5 layers (skills.md):
1. **Hooks** — `.env` Read denied; WebFetch domain allowlist (8 hosts); PreToolUse blocks `tools/clis/` bypass paths.
2. **Allowlist registry** — every skill has a verdict; `author_verified` requires identity proof, not reputation.
3. **Audit script** — scans for 4 pattern classes, fails on any 2-class combo, plus Pass 5 subprocess-bypass coverage.
4. **CI gate** — self-test + real audit + lock-drift verify; SHA256 hash of every skill file pinned in `skills-lock.json` (MEH-420).
5. **Add-skill protocol** — canonical content under `.agents/skills/`, symlink from `.claude/skills/`, lock + allowlist + audit before merge.

## Consequences
**Positive:** Adding a malicious skill requires bypassing all 5 layers + passing manual audit; content drift post-audit fails CI on hash.
**Negative:** Adding a legitimate skill is now a 4-step PR with audit; known limitations remain (empty-input bypass on hooks, obfuscated shell-out patterns — both documented as accepted, gated by attacker control of tool input).
**Mitigations:** Limitations are surfaced in `skills.md` "Honest limits" + "Known limitations" sections — defense-in-depth, not a sandbox; manual audit is the load-bearing layer for content review.

## Alternatives considered
- Trust upstream signing only — rejected: most skill repos have no signing; no upstream authority exists.
- Block all third-party skills — rejected: kills the productivity gain; not proportionate to threat.
