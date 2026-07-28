#!/usr/bin/env bash
#
# Module:   run-all.sh
# Purpose:  Run every guard script in scripts/checks/ and aggregate the results
#           into one exit code, so a new guard is a drop-in file rather than a
#           workflow edit.
# Touches:  nothing — reads the repo, spawns each guard as a child process,
#           writes only to stdout/stderr and one mktemp scratch file.
# Does NOT: define any guard rules of its own. The rules live in the individual
#           scripts/checks/*.sh files; this file only finds and runs them. It
#           also does NOT run scripts/check_env_drift.sh — that guard keeps its
#           own CI job (its own name in the CI-gate aggregator, its own
#           cross-stack semantics). See docs/ci/repo-guards.patch.md.
# Related:  scripts/checks/README.md (the guard-authoring contract),
#           scripts/checks/ui-pattern-guard.sh (the first guard),
#           docs/ci/repo-guards.patch.md (the `repo-guards` job that calls this).
# History:  MEH-999 (creation — generalises the one-off ui-pattern-guard job).
#
# WHY THIS EXISTS
#   .github/workflows/** is CC-deny (MEH-671), so every new guard used to cost
#   Sapir a workflow edit — guards were permanently bottlenecked on one person.
#   Thin YAML, fat script: ONE generic job runs this dispatcher, and every
#   future guard is a file drop with no workflow change at all.
#
# CONTRACT WITH THE GUARDS IT RUNS
#   - a guard is an EXECUTABLE *.sh file directly inside scripts/checks/
#   - exit 0 = pass, non-zero = fail
#   - a guard prints its own violations as file:line
#   Full authoring contract: scripts/checks/README.md
#
# AGGREGATION SEMANTICS
#   Every guard runs, even after an earlier one fails — a single run tells you
#   about ALL broken guards, not just the first. The dispatcher exits 1 if any
#   guard failed, 0 otherwise. Zero guards found is a NOTICE and exit 0, not a
#   failure: an empty directory means "nothing to enforce yet", and reddening CI
#   for it would punish the state this repo starts every new guard class from.
#
# WARN SURFACING (MEH-1715)
#   A guard that exits 0 after printing a warning used to have its output
#   swallowed: only `PASS <name>` reached the log, because output was echoed
#   for failures alone. That made builder-model-guard's entire warn-only window
#   (MEH-1668) invisible — nobody saw a warning, so nobody fixed anything, and
#   the day it starts blocking every non-compliant PR reddens at once with no
#   prior signal. Same family as MEH-1582 (skip-green) and MEH-1604.
#
#   So: exit 0 whose output contains the token WARNING or WARNED is surfaced
#   inline and summarised as WARN instead of PASS. The run's exit code is
#   UNCHANGED — warnings never fail the dispatcher; only a non-zero guard does.
#
#   ON THE DETECTION TOKEN — this is a NEW convention, not a discovered one.
#   scripts/checks/README.md's contract defines exactly four requirements
#   (executable .sh, maxdepth 1, exit 0 = pass, prints file:line) and has no
#   concept of a warning at all; of the five guards, only builder-model-guard
#   emits one. There was therefore nothing to key on, and matching on output
#   text is a heuristic rather than a protocol. It is deliberately narrow:
#
#     - case-sensitive, whole-word WARNING / WARNED, plural accepted
#       (WARNINGS / WARNEDS) so a guard that pluralises is not swallowed.
#     - `mode: WARN-ONLY` does NOT match — builder-model-guard prints that
#       line on every run including clean ones, so keying on bare `WARN` would
#       mark a passing guard as warned on every single run. That near-miss is
#       the reason the pattern is this specific.
#     - NO `-i`. Lowercase `warning` is left unmatched on purpose: it is common
#       in prose and help text, and matching it would surface guards that never
#       warned — reintroducing noise in the name of removing silence.
#     - a guard that exits 0 and prints neither token stays completely quiet,
#       exactly as before.
#
#   A guard opts in simply by printing WARNING/WARNED. Nothing is required of
#   the four guards that do not warn, and none of them were touched. The
#   convention is documented for guard authors in scripts/checks/README.md
#   ("Running them"), which is the contract they actually read.
#
# USAGE
#   bash scripts/checks/run-all.sh     # from the repo root or any other cwd
#
# NOTE ON `set -e`
#   Deliberately `set -uo pipefail` WITHOUT `-e`: `-e` here would abort the loop
#   on the first failing guard, which is the exact behaviour this dispatcher
#   exists to avoid. Strict-mode enforcement belongs at the invocation boundary
#   — each guard is a separate `bash` process and sets its own strict mode.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECKS_DIR="$REPO_ROOT/scripts/checks"
SELF_NAME="$(basename "${BASH_SOURCE[0]}")"

# Guards are written to be run from the repo root (ui-pattern-guard.sh:50-51
# re-derives it anyway); cd makes that true no matter where the caller stood.
cd "$REPO_ROOT" || exit 1

echo "repo-guards dispatcher (MEH-999) — repo root: $REPO_ROOT"
echo

# ---------------------------------------------------------------------------
# Discover: executable *.sh directly in scripts/checks/, sorted, minus self.
# LC_ALL=C keeps the run order identical across machines and CI images.
# ---------------------------------------------------------------------------
guards=()
skipped=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  [ "$(basename "$path")" = "$SELF_NAME" ] && continue
  if [ -x "$path" ]; then
    guards+=("$path")
  else
    # Not a failure, but never silent: a guard that lost its +x bit stops
    # running with no error at all — the same self-disabling class MEH-1030
    # closed for guarded registries.
    skipped+=("$path")
  fi
done < <(find "$CHECKS_DIR" -maxdepth 1 -type f -name '*.sh' | LC_ALL=C sort)

for path in ${skipped[@]+"${skipped[@]}"}; do
  echo "  NOTICE  ${path#"$REPO_ROOT"/} is not executable — not run. (chmod +x to enable)"
done
[ ${#skipped[@]} -gt 0 ] && echo

if [ ${#guards[@]} -eq 0 ]; then
  echo "NOTICE: no executable guard scripts found in ${CHECKS_DIR#"$REPO_ROOT"/} — nothing to enforce."
  exit 0
fi

# ---------------------------------------------------------------------------
# Run: every guard, unconditionally. Output is captured and echoed for failures
# and for warnings, so a genuinely clean run stays quiet while anything that
# has something to say shows the reason inline. See WARN SURFACING above.
# ---------------------------------------------------------------------------
out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

# Whole-word, case-sensitive. Deliberately does NOT match `WARN-ONLY`, which
# builder-model-guard prints on clean runs too — see WARN SURFACING above.
WARN_TOKEN='(^|[^[:alnum:]_])WARN(ING|ED)S?([^[:alnum:]_]|$)'

summary=()
failed=0
warned=0

for path in "${guards[@]}"; do
  name="$(basename "$path" .sh)"
  rel="${path#"$REPO_ROOT"/}"

  bash "$path" >"$out_file" 2>&1
  status=$?

  if [ "$status" -ne 0 ]; then
    failed=$(( failed + 1 ))
    summary+=("  FAIL  $name  (exit $status)")
    echo "───── FAIL: $rel (exit $status) ─────"
    cat "$out_file"
    echo "───── end $rel ─────"
    echo
  elif grep -qE "$WARN_TOKEN" "$out_file"; then
    # Exit 0 — this does NOT touch $failed and cannot change the run's verdict.
    warned=$(( warned + 1 ))
    summary+=("  WARN  $name")
    echo "───── WARN: $rel (exit 0 — not failing the run) ─────"
    cat "$out_file"
    echo "───── end $rel ─────"
    echo
  else
    summary+=("  PASS  $name")
  fi
done

# ---------------------------------------------------------------------------
# Summarise.
# ---------------------------------------------------------------------------
echo "Guard summary (${#guards[@]} run):"
printf '%s\n' "${summary[@]}"
echo

if [ "$failed" -gt 0 ]; then
  echo "repo-guards FAILED — $failed of ${#guards[@]} guard(s) failed."
  exit 1
fi

# Warnings are reported, never fatal — the exit code below is identical to what
# this branch returned before MEH-1715.
if [ "$warned" -gt 0 ]; then
  echo "repo-guards OK — ${#guards[@]} guard(s) ran, $warned warned (not blocking)."
  echo "A warning is a deadline with the date still ahead of it. Fix it now, not on the day it starts blocking."
  exit 0
fi

echo "repo-guards OK — all ${#guards[@]} guard(s) passed."
exit 0
