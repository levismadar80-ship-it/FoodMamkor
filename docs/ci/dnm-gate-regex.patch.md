# `do-not-merge-gate` — narrow the matcher to an explicit marker (MEH-1922)

**Status:** staged for Sapir. `.github/workflows/**` is CC-deny (MEH-671), so CC
cannot apply this. Everything below is measured, not proposed blind — the
regexes were run against a 19-case corpus before this doc was written, and that
corpus ships as a live guard (see "What already landed").

---

## Why

PR **#2637** was blocked by this line of its own body:

```
x many open days that do NOT merge -> still no disclosure, nothing is hidden
```

That is a **pasted vitest test name** about merging *days of the week* into
`ראשון–חמישי`. The gate's matcher looks for `do[ _-]?not[ _-]?merge` anywhere in
title **or** body, so it matched. Rule 30 forbids CC editing a PR body to clear
this gate — so every false positive of this shape costs a manual intervention.

It is not a one-off. Any future test or prose about merging — days, ranges,
duplicates, branches, cells — trips it again.

## The second defect, which is worse and was not in the ticket

While measuring the current matcher, `[DNM]` turned out to **not match at all**:

```
$ printf '%s' '[DNM] feat: something' | grep -Eiq '(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'
$ echo $?
1        # no match -> the gate does NOT block
```

MEH-1922's acceptance criteria assume `[DNM]` is a working marker. It is not.
A gate that silently fails to block is a **false negative**, and that is the
dangerous direction — the false positive at least announces itself. This patch
closes both.

---

## The change

Replace the single matcher with two, because title and body deserve different
rules: a title is short and deliberate, so a marker anywhere in it counts; a
body is long-form prose, so a marker only counts **as its own line**.

### Current (line 73)

```yaml
          if printf '%s\n%s' "$PR_TITLE" "$PR_BODY" | grep -Eiq '(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'; then
```

### Replacement

```yaml
          # MEH-1922: narrowed after #2637 was blocked by a pasted test name
          # ("many open days that do NOT merge" - about merging DAYS). The gate
          # must catch an explicit marker, not ordinary English.
          #
          #   title -> marker anywhere (titles are short and deliberate)
          #   body  -> marker only as its OWN LINE, after any run of leading
          #            non-alphanumerics, so `**DO NOT MERGE**`, `## DO NOT MERGE`
          #            and an emoji-prefixed marker all still count, while
          #            "...days that do NOT merge" mid-sentence does not.
          #
          # The names DNM_TITLE_RE / DNM_BODY_RE are load-bearing:
          # scripts/checks/dnm-matcher-guard.sh detects this patch by them and
          # switches to the stricter fixture table. Do not rename them.
          DNM_TITLE_RE='(^|[^A-Za-z0-9_-])(\[DNM\]|DNM-LOCK|DO[ _-]?NOT[ _-]?MERGE)([^A-Za-z0-9_-]|$)'
          DNM_BODY_RE='^[^A-Za-z0-9]*(\[DNM\]|DNM-LOCK|DO[ _-]?NOT[ _-]?MERGE)([^A-Za-z0-9_-].*)?$'
          if printf '%s' "$PR_TITLE" | grep -Eiq "$DNM_TITLE_RE" \
            || printf '%s' "$PR_BODY" | grep -Eiq "$DNM_BODY_RE"; then
```

Nothing else in the step changes — same `set -euo pipefail`, same error message,
same `exit 1`. **Fail-closed is preserved:** `set -e` plus the explicit `exit 1`
mean an erroring `grep` still fails the job rather than falling through.

---

## Measured behaviour

Every row below was executed, not reasoned about.

### Markers that MUST block — all 9 trip

| Where | Input | Before | After |
|---|---|---|---|
| title | `DO NOT MERGE - waiting on Sapir` | trips | trips |
| title | `DO-NOT-MERGE` | trips | trips |
| title | `feat(x): something DNM-LOCK` | trips | trips |
| title | `[DNM] feat: something` | **MISSES** | trips |
| body | `DO NOT MERGE` | trips | trips |
| body | `DO NOT MERGE - waiting on the release` | trips | trips |
| body | `DNM-LOCK` | trips | trips |
| body | `[DNM]` | **MISSES** | trips |
| body | `**DO NOT MERGE**` / `## DO NOT MERGE` / emoji-prefixed | trips | trips |

### Ordinary English that MUST NOT block — all 7 pass

| Input | Before | After |
|---|---|---|
| `many open days that do NOT merge means no disclosure` | **BLOCKS** | passes |
| `x many open days that do NOT merge` (#2637) | **BLOCKS** | passes |
| `the test asserts days that do not merge stay separate` | **BLOCKS** | passes |
| `Fixes the do-not-merge false positive from #2637` | **BLOCKS** | passes |
| `nothing here says do not merge as an instruction` | **BLOCKS** | passes |
| `- many open days that do NOT merge` | **BLOCKS** | passes |
| `we should not merge this until CI is green` | passes | passes |

---

## A rejected first draft, recorded because the miss is instructive

The first body rule allowed only `-`, `*`, `>` as a line prefix:

```
^[[:space:]]*([-*>][[:space:]]*)?(...)
```

It passed all 17 cases in the original corpus **and missed four real markers**:

```
MISSED :: **DO NOT MERGE**
MISSED :: ## DO NOT MERGE
MISSED :: (emoji) DO NOT MERGE - waiting on Sapir
MISSED :: (emoji) [DNM]
```

Enumerating allowed prefixes is a losing game — there is always one more way to
decorate a line. Stripping any run of leading non-alphanumerics
(`^[^A-Za-z0-9]*`) is both simpler and strictly tighter, and it is what ships
above. The four cases are now permanent fixtures so this cannot regress.

---

## What already landed (no workflow edit needed)

`scripts/checks/dnm-matcher-guard.sh` — merged under the required **Repo guards**
job via `run-all.sh`. It **reads the matcher out of the workflow** rather than
keeping a copy, so it tests the real rule, and it has two modes:

- **pre-patch** (today) — pins the current matcher to its *measured* baseline,
  defects included. Green, but prints a `WARNING` naming both defects on every
  run. Any edit to the regex that is not this patch turns it **red**.
- **post-patch** — triggered automatically by the presence of `DNM_TITLE_RE` /
  `DNM_BODY_RE`. Switches to the stricter table: the 9 markers must trip and the
  7 prose cases must not.

So applying this patch needs no follow-up: the guard tightens itself.

`--self-test` proves it discriminates, and is worth running once after applying:

```
$ bash scripts/checks/dnm-matcher-guard.sh --self-test
  ok   baseline matcher accepted (exit 0)
  ok   widened matcher rejected (exit 1)
  ok   gutted matcher rejected (exit 1)
  ok   neutered matcher rejected (exit 1)
  4/4 self-test cases behaved correctly
```

---

## Why the matcher stays in the workflow

Moving it into `scripts/checks/` would be simpler to maintain and is the wrong
call: it would put the DO-NOT-MERGE rule inside a file CC can edit, letting the
agent the gate governs rewrite its own gate. That is privilege escalation under
rule 32 ("CC adds constraints, never removes one"), and it is why this is a
patch doc rather than a refactor.

## After applying

1. `bash scripts/checks/dnm-matcher-guard.sh` — expect `mode: post-patch`, no
   `WARNING`, `19 fixtures pinned, all as expected`.
2. #2637's gate clears on its next run with **no body edit** — which is the
   whole point, since rule 30 puts that edit out of CC's reach.
