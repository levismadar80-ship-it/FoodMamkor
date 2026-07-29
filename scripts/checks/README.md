# `scripts/checks/` — repo guards

**To add a guard: drop an executable `*.sh` here that exits non-zero on violation
and prints `file:line`. No workflow edit required.**

That sentence is the whole point of this directory. `.github/workflows/**` is
**CC-deny (MEH-671)**, so before this existed every new guard cost Sapir a
workflow edit and guards were bottlenecked on one person. Now a single generic
job runs [`run-all.sh`](./run-all.sh), which discovers and runs everything in
here — thin YAML, fat script.

---

## The contract

A guard is any file in this directory that satisfies all four:

| Requirement | Why |
|---|---|
| **Executable** (`chmod +x`) and named `*.sh` | How the dispatcher identifies a guard. A non-executable `.sh` is reported as a `NOTICE` and **not run** — never silently skipped. |
| **Directly in `scripts/checks/`** (no subdirectories) | Discovery is `find -maxdepth 1`. Helper libraries can live in a subdirectory; they just won't be run as guards. |
| **Exit 0 = pass, non-zero = fail** | The only signal the dispatcher reads. |
| **Prints violations as `file:line`** | So the CI log is actionable without re-running anything locally. |

Everything else is up to the guard. It gets its own process, so it sets its own
strict mode and cannot affect its siblings.

### Also expected, by convention

- **Run from the repo root regardless of cwd.** Derive it rather than assuming:
  ```bash
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  cd "$REPO_ROOT" || exit 1   # the `|| exit 1` is load-bearing — see below
  ```
  Without `|| exit 1`, a failed `cd` leaves the guard grepping the wrong
  directory, matching nothing, and exiting **0** — a silently-passing check that
  reports `PASS`. `shellcheck` flags this as SC2164.
- **Stay fast.** The whole dispatcher run should stay ~1s. These are grep-level
  shape checks; no `npm install`, no full-history checkout, no network.
- **Carry a file header** per the exec §14 contract
  (`.claude/rules/code-execution.md`) — `Purpose` / `Does NOT` / `History` earn
  their keep most on a guard, where the *scope* of a rule is the thing future
  readers get wrong.
- **Be grep-level on purpose.** A grep a reader can verify by eye beats a parser
  nobody maintains. Simple patterns false-positive, which is what the escape
  hatch below is for.

---

## Escape hatch — `guard-ok: <reason>`

Every guard should honour the same suppression marker, so contributors learn it
once:

```js
// guard-ok: this page's back link predates BackLink and ships its own icon
```

- Put `guard-ok: <reason>` in a comment **on the offending line, or on either
  adjacent line (±1)**.
- **A reason is required.** The bare marker is not enough — the point is that
  the next reader learns *why* the exception exists.
- The ±1 window and the naming both mirror the `rtl-ok` convention in
  `.claude/hooks/check-rtl.sh`, which is where this repo's suppression idiom
  comes from.

Reference implementation: `suppressed()` in
[`ui-pattern-guard.sh`](./ui-pattern-guard.sh).

---

## Running them

```bash
bash scripts/checks/run-all.sh        # every guard; works from any cwd
bash scripts/checks/ui-pattern-guard.sh   # just one, while iterating on it
```

`run-all.sh` runs **every** guard even after one fails — one run tells you about
all of them — then exits 1 if any failed. Each guard lands in one of three
outcomes, summarised as `PASS` / `WARN` / `FAIL`: a guard that passes quietly
prints nothing, and a guard that **fails**, or that **exits 0 having printed the
word `WARNING` or `WARNED`**, has its own output echoed inline (MEH-1715).

**Only a non-zero exit fails the run** — a `WARN` never does. To make a
non-fatal finding visible, print `WARNING`/`WARNED` (also matched in the plural)
and still `exit 0`; the match is case-sensitive and whole-word, so `WARN-ONLY`
and lowercase `warning` in prose are deliberately ignored.

Zero guards found is a `NOTICE` and exit **0**, not a failure.

---

## Current guards

| Guard | Guards against | Ticket |
|---|---|---|
| [`ui-pattern-guard.sh`](./ui-pattern-guard.sh) | Producer-dashboard pages hand-rolling `EmptyState` / `BackLink` / text arrows in `he.json` back keys | MEH-999 |
| [`changelog-branch-guard.sh`](./changelog-branch-guard.sh) | A **code** PR also carrying `docs/CHANGELOG.md` / `HANDOFF.md` (MEH-1372). Docs-only PRs still pass. `--self-test` proves six classification cases plus two end-to-end base-resolution cases (MEH-1634). | MEH-1602 |
| [`length-cap-sync-guard.sh`](./length-cap-sync-guard.sh) | Frontend length-cap constants drifting from their backend schema caps: `OWNER_BIO_MAX` must **equal** the `owner_bio` sanitize cap; `DESC_MAX`/`TAGLINE_MAX` must stay **≤** every `description`/`short_description` cap (they are deliberately tighter UX caps). `--self-test` proves both directions + the missing-extraction fail-loud. | MEH-1393 |
| [`adr-citation-guard.sh`](./adr-citation-guard.sh) | An `ADR-NNN (MEH-XXXX)` citation in an always-loaded rule file (`.claude/rules/*.md`, `CLAUDE.md`, `AGENTS.md`) pointing at an ADR that never mentions that issue — i.e. a link that **resolves** but to an unrelated decision. Bare `ADR-NNN` mentions with no adjacent MEH id are ignored on purpose. `--self-test` proves the discriminating pair: the historical `ADR-017 (MEH-1741)` fails while the corrected `ADR-032 (MEH-1741)` and the genuine `ADR-017 (MEH-686)` both pass. | MEH-1761 |

### File taxonomy — what `changelog-branch-guard.sh` calls "docs"

The guard's whole verdict turns on one question: **is this diff a code change?**
That means the docs/code split is the guard's real interface, and it is worth
stating outright rather than leaving readers to infer it from a `case` statement.

`is_docs_path()` returns **docs** for exactly these:

| Pattern | Examples | Why |
|---|---|---|
| `docs/**` | `docs/CHANGELOG.md`, `docs/DESIGN.md`, `docs/audits/…` | the documentation tree |
| `.claude/**` | `.claude/rules/workflow.md`, `.claude/hooks/…` | agent configuration + rules |
| `.ai/**` | `.ai/diagrams/api-routes.md`, `.ai/diagrams/db-schema.md` | session-start diagrams — rule 12 requires them in the same PR as the code they document (MEH-1607) |
| `HANDOFF.md` | — | an append-only log itself |
| **root-level** `*.md` | `CLAUDE.md`, `AGENTS.md`, `README.md` | documentation that happens to live at the repo root |

Everything else is **code**, including some things that look like docs:

| Pattern | Examples | Classified |
|---|---|---|
| nested Markdown | `frontend/components/CLAUDE.md`, `backend/**/*.md` | **code** — it ships beside the code it documents, and a PR touching it is a code PR |
| `.github/**` | workflows, PR/issue templates — *including* `.md` ones | **code** |
| root-level non-Markdown | `package.json`, `Dockerfile`, `.gitignore`, `LICENSE` | **code** |
| everything under `scripts/`, `tests/`, `frontend/`, `backend/`, `qa-artifacts/` | — | **code** |

The root-level `*.md` arm exists because the guard **got this wrong on its first
real customer**: PR #2228 corrected `CLAUDE.md` (the rule this guard enforces)
and the guard classified `CLAUDE.md` as code, which would have blocked that PR
from carrying its own CHANGELOG entry. `--self-test` case 4 now locks the fix —
remove the arm and the self-test goes red rather than the behaviour regressing
quietly.

#### Deliberately NOT decided

These have never come up, so the guard's current answer is an accident of the
patterns above rather than a considered decision. **Decide them the first time
one actually blocks a PR** — don't pre-emptively widen the taxonomy:

- **`.github/**/*.md`** (PR / issue templates) — currently **code**. Arguably
  documentation, but `.github/**` is CC-deny territory anyway, so a PR touching
  it is unusual and rarely also a docs backfill.
- **A root-level doc with no `.md` extension** (`LICENSE`, `CODEOWNERS`) —
  currently **code**. No such PR has needed a CHANGELOG entry yet.
- **`qa-artifacts/**`** (screenshots) — currently **code**, which is deliberate
  for now: they are evidence attached to a code change and travel with it.
- **A docs-only PR that also touches `docs/ci/*.patch.md`** — currently **docs**
  (under `docs/`), even though those files are staged workflow YAML.

If one of these bites, the fix is one `case` arm plus a `--self-test` case. Do
both — a taxonomy change without a locking case is how the CLAUDE.md defect got
in.

### The one guard that needs a diff

`changelog-branch-guard.sh` is the first guard here that reasons about the
**PR's diff** rather than the working tree, which the `repo-guards` job does not
hand it: that job checks out shallow (depth 1) and passes no base SHA. The guard
therefore resolves its own base — `$CHANGELOG_GUARD_BASE`, else the **first
parent of `refs/pull/N/merge`**, else `$GITHUB_BASE_REF` (fetched at
`--depth=1` when absent), else the local default branch — and **exits non-zero
if it can resolve none**, rather than reporting OK for a check it never ran. If
you write another diff-based guard, reuse that ladder; a guard that silently
passes when it cannot see the diff is worse than no guard.

**MEH-1634 — a resolvable base is not automatically a *correct* one.** The
first three rungs above used to be two, and the guard diffed the merge ref
against whatever the base branch's tip happened to be at run time. Those are
different commits: GitHub rebuilds `refs/pull/N/merge` on push, not
continuously, so anything that lands on `staging` in between shows up in a
two-dot diff **in reverse**, as though the branch had deleted it. Run
`30248101409` (27/07) red-lined a docs-only PR over "47 code files" while the
same run's paths-filter reported neither stack touched. So each base now carries
a `frozen` / `moving` tag: two-dot is only used against a frozen base (where it
is exact), a moving base requires a real merge base and three-dot, and a guard
that can do neither **fails loudly instead of answering**. Any diff-based guard
you add inherits this problem — resolve the PR's own merge base, not a tip.

## Not run from here

`scripts/check_env_drift.sh` keeps its **own** CI job (`env-drift`,
`pr-checks.yml:468`) and its own named leg in the `CI gate (required)`
aggregator. It is not a zero-config grep guard — it diffs env vars read by code
against every `.env.example` across both stacks — and folding it in would
collapse a named required check into a generic one. Its workflow edit is already
spent; this directory is for guards that would otherwise need a new one.

---

## CI wiring

One job, `repo-guards`, runs `bash scripts/checks/run-all.sh` and is wired into
the `CI gate (required)` aggregator. Because it is generic, **adding a guard
never touches it.** The exact YAML for Sapir to apply is
[`docs/ci/repo-guards.patch.md`](../../docs/ci/repo-guards.patch.md).
