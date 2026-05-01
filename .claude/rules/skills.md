# Skills supply chain rules (MEH-397)

How Mehamakor sandboxes the 83 third-party skills under `.agents/skills/`
and `.claude/skills/`. Defense-in-depth: 5 layers, fail-closed by default.

Threat model basis: Snyk ToxicSkills (Feb 2026) — 13.4% of 3,984 ClawHub
skills with critical security issues; 76 confirmed malicious payloads.
Aguara: 31K+ skills, 485 critical findings. Liu et al.: 26.1% with
vulnerable patterns.

---

## Two-path skill mechanism

Mehamakor stores skill content **once** under `.agents/skills/` and exposes
it to the harness via symlinks under `.claude/skills/`.

| Path | Role | Git mode | Count |
|---|---|---|---|
| `.agents/skills/<name>/SKILL.md` | Canonical content (source of truth) | `100644` (real file) | 82 |
| `.claude/skills/<name>` | Harness mount point | `120000` (symlink → `../../.agents/skills/<name>`) | 82 + 1 |

The 1 extra directory in `.claude/skills/` is `ui-ux-pro-max` — a real
directory tracked separately because it bypassed the lock pattern. It is
allowlisted as `approved_local_unlocked` pending follow-up locking.

**Editing implication:** symlinks in `.claude/skills/` resolve to the same
inode as the corresponding file in `.agents/skills/`, so editing either
path mutates both. The audit script scans `.agents/skills/` (canonical)
and verifies the union of both directories' skill names against the
allowlist.

---

## Layer 1 — Tool deny + WebFetch allowlist

`.claude/settings.json`:

- `permissions.deny[]` — Read on `.env`, `frontend/.env*`, `backend/.env*`
- `permissions.allow[]` — `WebFetch(domain:<host>)` for the 8 hosts below
- PreToolUse hooks (authoritative, fail-closed):
  - `.claude/hooks/check-env-read.sh` — blocks Read on env files
  - `.claude/hooks/check-webfetch-allowlist.sh` — blocks WebFetch outside allowlist

WebFetch allowlist (parent domains; subdomain wildcards permitted):

```
github.com  anthropic.com  npmjs.com  pypi.org
mehamakor.online  vercel.com  railway.app
```

Any non-allowlisted host → hook exits 2 → tool call blocked regardless
of permission mode. There is no "ask user" fallback.

---

## Layer 2 — Allowlist registry

`.claude/skills-allowlist.json` — every skill directory must have an
entry. Schema:

```json
{
  "<skill-name>": {
    "source": "<owner/repo>" | "local",
    "author_verified": false,
    "last_audit_date": "YYYY-MM-DD" | null,
    "audit_verdict": "approved" | "review_needed" | "approved_local_unlocked" | "blocked",
    "notes": ""
  }
}
```

### `author_verified` field semantics

- `true` ONLY when GitHub identity is independently verified — e.g.,
  PGP-signed commits matching a known public key, public statement by
  the named person linking to the GitHub account, or organization
  membership verifiable via official channels.
- `false` otherwise — including when the GitHub username matches a
  public figure's name without further verification.
- "Public figure" or "well-known author" is REPUTATION, not identity
  verification. Do not flip to `true` based on reputation alone.
- Reputation can still inform `audit_verdict` (lower scrutiny baseline)
  but does not change `author_verified`.

_Source: MEH-402 adversarial review (2026-05-01) — pbakaus/impeccable
audit initially set 21 entries to `true` based on Paul Bakaus being a
Google Developer Advocate; review caught the conflation of reputation
with identity verification and flipped them back to `false` to match
MEH-401 precedent._

### Audit verdict semantics

| Verdict | Meaning | CI behavior |
|---|---|---|
| `approved` | Manually audited; clean | pass |
| `review_needed` | Listed but not yet audited | pass (transitional baseline) |
| `approved_local_unlocked` | **Transitional** — manually audited but missing from `skills-lock.json`. Must resolve to `approved` (after locking) within **30 days**. | pass |
| `blocked` | Audit failed; do not load | **fail** |
| missing entry | Drift — unlisted skill on disk | **fail** |

`approved_local_unlocked` is a deliberate escape hatch for a single skill
(currently `ui-ux-pro-max`) whose Python scripts were manually audited
in MEH-397 but whose source repo / SHA256 weren't declared in
`skills-lock.json`. The 30-day clock starts on `last_audit_date`. After
30 days expire, the entry must be promoted to `approved` (full lock) or
demoted to `blocked` (CI failure) — there is no third path.

---

## Layer 3 — Audit script

`.claude/scripts/audit-skills.sh` scans `.agents/skills/*/SKILL.md` for
4 pattern classes (network, exec, secret-name, prompt-injection) and
fails on any combination of ≥2 classes in a single file ("critical
combo"). Single-class hits are reported as warnings, not failures.

Self-test fixture: `.claude/scripts/test/fixtures/bad-skill/SKILL.md` —
contains all 4 classes. Running the script with `--self-test` against
the fixture must exit 1; CI verifies this in step 1 of the workflow.

### Pattern set deviation from MEH-397 spec

The spec listed prompt-injection patterns aimed at agent-rule overrides.
We chose a more focused set targeting LLM canaries: `ignore previous`,
`system prompt`, `disregard`, `override.*instruction`, `forget.*above`.
Pattern set chosen for prompt-injection canaries vs spec's agent-rule
patterns.

---

## Layer 4 — CI gate

`.github/workflows/skills-audit.yml` — runs on every PR touching
`.agents/skills/**`, `.claude/skills/**`, the allowlist, the audit
script, or `skills-lock.json`. Two-stage gate:

1. **Self-test:** `bash .claude/scripts/audit-skills.sh --self-test` must
   exit 1 (proves the audit catches malicious patterns).
2. **Real audit:** `bash .claude/scripts/audit-skills.sh` must exit 0
   (proves the live tree is clean and every skill is allowlisted with
   a non-blocked verdict).

Failure of either stage blocks merge to staging or main.

---

## Layer 5 — Adding a new skill (4-step protocol)

1. **Add canonical content** under `.agents/skills/<new-name>/SKILL.md`.
   Don't add to `.claude/skills/` directly — create a symlink:
   `ln -s ../../.agents/skills/<new-name> .claude/skills/<new-name>`.
2. **Lock it** in `skills-lock.json` with `source` (`<owner>/<repo>`),
   `sourceType: "github"`, and a SHA256 of the SKILL.md.
3. **Allowlist it** in `.claude/skills-allowlist.json`:
   - Default `audit_verdict: "review_needed"` for first commit.
   - Manual audit before promoting to `approved`.
   - For an `skills-il/*` source, add `notes: "Anonymous author —
     manual review required (Snyk ToxicSkills 13.4% baseline)."`
4. **Open the PR.** CI runs `audit-skills.sh`; merge blocked until
   self-test exits 1 AND real-audit exits 0.

Never bypass the allowlist by editing only `skills-lock.json` or only
`.claude/skills/`. The allowlist coverage check fails on drift.

---

## When auditing skills manually

Read `SKILL.md` end-to-end. Treat the following as red flags requiring
escalation, not "concerning" notes in the allowlist:

- Any `subprocess`, `os.system`, `os.popen`, `eval`, `exec`, `compile`,
  `child_process`, `spawn`
- Any `requests`, `urllib`, `fetch(`, `axios`, `socket.`, `http.client`
- `os.environ`, `process.env` (credential read)
- Hard-coded API keys, tokens, bearer headers
- Prompt-injection canary phrases (see Layer 3 list)
- Writes outside the skill's own dir without explicit user invocation

Single-class hits are usually documentation references and acceptable
with explanatory notes. Multi-class hits in code blocks (not prose) are
critical and must block the merge.

---

## Known limitations

**Empty-input bypass on Layer 1 hooks.** Both `check-env-read.sh` and
`check-webfetch-allowlist.sh` exit 0 (allow) when given empty stdin —
`jq` returns 0 with no output, so the empty-string guard short-circuits
before any allowlist check runs. **Non-exploitable today** because hook
input mirrors tool input: empty input means the tool itself is invoked
without a URL or file path, so there is nothing to exfiltrate to or
read from. Surfaced by MEH-397 adversarial review probes #42/#43.
**If a future Claude Code change decouples hook input from tool input
(e.g., separate "intent" vs "args" payloads)**, this becomes
exploitable and the hooks must fail-closed on empty input. Tracked as
a nice-to-have hardening item — no follow-up ticket; revisit only if
the upstream contract changes.

---

## Cross-references

- `docs/SECURITY.md` → "Skills supply chain (MEH-397)" — full threat
  model + 5-layer rationale
- `.claude/rules/security.md` — invariants that complement this rule
- `skills-lock.json` — SHA256 trust anchor (read-only; never edited
  during normal session work)
