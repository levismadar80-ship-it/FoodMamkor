# Skills supply chain rules (MEH-397)

How Mehamakor sandboxes the 83 third-party skills under `.agents/skills/`
and `.claude/skills/`. Defense-in-depth: 5 layers, fail-closed by default.
Hash enforcement (Layer 4) closed by MEH-420 after MEH-402 adversarial
review found `computedHash` was decorative metadata that no script read.
Subprocess-bypass class (Class A bash shell-out + Class B Python
network) closed by MEH-422 — combines what was originally tracked as
MEH-406 + MEH-421.

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
| `.agents/skills/<name>/SKILL.md` | Canonical content (source of truth) | `100644` (real file) | 71 |
| `.claude/skills/<name>` | Harness mount point | `120000` (symlink → `../../.agents/skills/<name>`) | 71 |

After MEH-423, all skills follow the symlink pattern uniformly. The
prior `ui-ux-pro-max` exception (real directory under `.claude/skills/`,
verdict `approved_local_unlocked`) has been migrated to the standard
two-path layout and locked into `skills-lock.json`.

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
    "notes": "",
    "allowed_network_hosts": null | [] | ["host"] | ["*"],
    "allowed_shell_invocations": null | [] | ["cmd"]
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

`approved_local_unlocked` is a deliberate escape hatch for skills that
have been manually audited but whose source repo / SHA256 aren't yet
declared in `skills-lock.json`. After MEH-423, **no skill currently
holds this verdict** — `ui-ux-pro-max` (the prior holder) was locked
and promoted to `approved`. The slot is reserved for any future skill
that needs the same transitional treatment. The 30-day clock starts on
`last_audit_date`. After 30 days expire, the entry must be promoted to
`approved` (full lock) or
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

## Layer 4 — CI gate + hash enforcement

`.github/workflows/skills-audit.yml` — runs on every PR touching
`.agents/skills/**`, `.claude/skills/**`, the allowlist, the audit /
compute-hash / backfill scripts, or `skills-lock.json`. Three-stage gate:

1. **Self-test:** `bash .claude/scripts/audit-skills.sh --self-test` must
   exit 1 (proves the audit catches malicious patterns).
2. **Real audit:** `bash .claude/scripts/audit-skills.sh` must exit 0.
   This includes Pass 4 — for every entry in `skills-lock.json`, the
   audit recomputes the hash via `compute-skill-hash.sh` and fails on
   any mismatch with `[HASH-DRIFT]` or `[HASH-COMPUTE]` findings.
3. **Lock-drift verify:** `bash .claude/scripts/backfill-skill-hashes.sh
   --dry-run` must exit 0. This catches PRs that modify skill content
   without rerunning the backfill (Pass 4 catches the same condition,
   but this step gives a single-purpose error message pointing at the
   fix command).

Failure of any stage blocks merge to staging or main.

### Hash enforcement (MEH-420)

The lock file is now the trust anchor for skill content, not just metadata.

**Algorithm** — `.claude/scripts/compute-skill-hash.sh`:

1. `find` all regular files under the skill dir, excluding `.git/`,
   `__pycache__/`, `.DS_Store`, `*.pyc`. Symlinks fail-loud.
2. Sort byte-order: `LC_ALL=C sort -z` (NUL-delimited, locale-independent).
3. Per-file digest = `sha256( <relpath>\0 + content + \0 )`.
4. Final hash = `sha256` of the concatenated per-file digests.

**What's hashed:** every regular file (`SKILL.md`, `SKILL_HE.md`,
`reference/*`, `references/*`, `scripts/*`, `data/*`, top-level JSON,
anything else). All-files-by-default — an attacker adding an unknown
file type can't hide it.

**What's not hashed:** file modes (rwx), mtimes, directory entries
themselves, symlinks (which are blocked outright by the symlink check).

**Backfill** — `.claude/scripts/backfill-skill-hashes.sh`:

- `--dry-run` (= `--verify`): print `OLD -> NEW` per drifted skill,
  exit 1 if any drift, exit 0 if clean. CI calls this.
- (no flag): atomic rewrite of `skills-lock.json` (tmp + jq validate +
  mv). Used after audited content changes.
- A skill listed in the lock but missing from disk is fatal in either
  mode (exit 1, names the missing skill).

**When you change a skill (e.g., audit + accept upstream version bump):**

1. Update content under `.agents/skills/<name>/`.
2. Run `bash .claude/scripts/backfill-skill-hashes.sh` (writes new hash).
3. Commit lock + content together. CI Pass 4 + drift verify both pass.

**When CI fails with `[HASH-DRIFT]`:** content changed without a lock
update. Either revert the content or run the backfill.

**When CI fails with `[HASH-COMPUTE]`:** symlinks present in the skill
dir. Remove them or, if upstream legitimately needs one, add an explicit
allowlist note before locking — `compute-skill-hash.sh` will not produce
a hash for a skill containing symlinks.

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

## Subprocess-bypass class (MEH-422)

Two mechanisms that route command execution outside MEH-397's hooks:

### Class A — Bash shell-out

7 SKILL.md files in `coreyhaines31/marketingskills` (`ad-creative`,
`ai-seo`, `analytics-tracking`, `email-sequence`, `launch-strategy`,
`paid-ads`, `referral-program`) instruct Claude to invoke
`node tools/clis/<x>.js` and reference `../../tools/REGISTRY.md`.
Mehamakor has no `tools/` directory — dead pointers today, but a future
commit adding `tools/clis/` would activate them silently.

### Class B — Python network at script level

2 scripts call `requests.get()` directly:
- `audit_a11y.py` (israeli-accessibility-compliance) — selenium-based
  a11y scan with user-supplied URL
- `check_shabbat.py` (shabbat-aware-scheduler) — HebCal API for Shabbat
  zmanim

Plus 1 documentation case: `hebrew-nlp-toolkit` describes
`transformers.from_pretrained()` (HuggingFace CDN) — no active script,
but the pattern is documented for users.

### Defense layers (MEH-422)

**Layer 1 — `.claude/hooks/check-skill-bypass.sh`** (PreToolUse: Bash):
- Pattern-match the Bash command. Two regex branches:
  1. `tools/(clis|integrations|REGISTRY)` anywhere → block (exit 2)
  2. `(node|python[23]?|bash|sh)\s+\S*tools/` → block (exit 2)
- Direct invocation of known-network Python scripts
  (`audit_a11y.py`, `check_shabbat.py`) → check skill's
  `allowed_network_hosts` field; block if `null`/`[]`, allow otherwise
- Fail-closed on jq missing, malformed JSON, empty input (matches
  MEH-397 hook discipline post-MEH-402)
- **What it does NOT catch:** `requests.get(...)` calls inside an
  already-running Python process. Once `python script.py` is past
  the hook, the running process is unhookable.

**Layer 2 — Allowlist schema** (`.claude/skills-allowlist.json`):
Two new optional fields per skill:

| Field | `null`/missing | `[]` | `["*"]` | non-empty |
|---|---|---|---|---|
| `allowed_shell_invocations` | no bypass declared | dead-pointer policy | wildcard | specific patterns |
| `allowed_network_hosts` | no bypass declared | no-network policy | wildcard | specific hosts |

**Layer 3 — Audit Pass 5** (`audit-skills.sh`):
Static verification at lint time:
- SKILL.md + references/*.md scanned for bash-bypass patterns
  **inside fenced code blocks only** (state-machine on ` ``` ` lines).
  Prose mentions are ignored — they're documentation, not injection.
- Skill scripts (`*.py`) scanned for network imports (`requests`,
  `urllib`, `socket`, `http.client`, `aiohttp`, `httpx`).
- For each match, allowlist field consulted:
  - `null` → `[BYPASS-UNDECLARED]` / `[NETWORK-UNDECLARED]` critical
  - `[]` (shell) → `[BYPASS-DEAD-POINTER]` informational
  - `[]` (network) → `[NETWORK-FORBIDDEN]` critical
  - `["*"]` / specific → audit-time pass

### Known limitations (MEH-422 obfuscation bypass)

The `check-skill-bypass.sh` hook and `audit-skills.sh` Pass 5 use
literal pattern matching against shell command strings. The
following obfuscation patterns evade detection:

- Quote concatenation: `t""ools/`, `to'o'ls/`, etc.
- Empty subshell: `t$()ools/`
- Variable substitution: `T=tools; cd $T/clis`
- Subshell printf: `$(printf '%s%s' too ls)/clis/`

These require attacker control of the bash command string — either
via rogue SKILL.md edit (caught by manual audit + hash enforcement
post-audit) or direct prompt injection.

Defense layers (defense-in-depth, not a sandbox):

1. Manual SKILL.md audit (MEH-400/401/402/403) — visual review
   catches obfuscation patterns at read time.
2. MEH-420 hash enforcement — any post-audit content drift fails CI.
3. `author_verified` field — anonymous authors get elevated scrutiny.
4. MEH-422 literal pattern hook — catches non-obfuscated bypass.
5. Same-class precedent: MEH-397 empty-input bypass is also
   documented as a known limitation rather than fixed inline. Both
   classes are gated by attacker control of the tool input string.

### Honest limits

The hook layer can't intercept `requests.get(...)` inside a Python
process — by the time the script is running, the hook has already
passed. The defense for the Python case is layered:
1. Hook blocks `python tools/*` patterns (catches the obvious "run
   a bypass script" attempt).
2. Hook blocks direct invocation of known-network scripts
   (`audit_a11y.py`, `check_shabbat.py`) when their skill's
   `allowed_network_hosts` is `null`/`[]`.
3. Pass 5 catches static imports in skill scripts at lint time.
4. Allowlist documents intended hosts (informational; we cannot
   statically determine the actual destination of every
   `requests.get(url)` call).

`["*"]` semantics for `allowed_network_hosts` accept that the
destination is user-controlled (e.g., the audit target URL of
`audit_a11y.py`). The skill becomes its own attack surface — user
must trust the URL they pass.

---

## ui-ux-pro-max sanitize patterns (MEH-398 + MEH-404)

`scripts/_sanitize.py`'s `_sanitize_slug()` is the canonical filesystem-safe
slug helper for ui-ux-pro-max. It runs on every CLI argument that becomes a
directory name (e.g. `--project-name`, `--page` in `design_system.py`).

**Pipeline order** (after MEH-404):
1. Lowercase + replace spaces with hyphens
2. Strip every char not in `[a-z0-9-]` (regex)
3. **F-3:** Collapse runs of hyphens (`foo--bar` → `foo-bar`)
4. **F-7:** Cap at 64 chars (prevents `OSError` on `mkdir(parents=True)`)
5. **F-4:** Strip leading/trailing hyphens (after cap, so a cap landing
   mid-hyphen-run can't leave a trailing dash)
6. Fallback to `'default'` if the result is empty

**Pre-existing patterns NOT closed by code (documented from MEH-398):**

- **F-13: collision via `mkdir(exist_ok=True)`.** Two project names that
  sanitize to the same slug share a directory (e.g. `foo!` and `foo?` both
  → `foo`). By design — `persist_design_system()` writes are idempotent
  and the user controls invocation. No code mitigation; relies on
  user-controlled CWD + intent.
- **F-14: symlink-follow on persist.** Same threat model as MEH-397
  local-only sandboxing — if the user has a malicious symlink in CWD, the
  skill follows it. No code mitigation; relies on user-controlled CWD.

Both are inherited from MEH-398's adversarial review and explicitly out of
scope for code-level fixes. They become active risks only if a third party
controls the CWD where ui-ux-pro-max runs — outside the threat model the
MEH-397 skills supply chain protects against.

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
