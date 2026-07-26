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
# Run: every guard, unconditionally. Output is captured and echoed only for
# failures, so a green run stays quiet and a red one shows the reason inline.
# ---------------------------------------------------------------------------
out_file="$(mktemp)"
trap 'rm -f "$out_file"' EXIT

summary=()
failed=0

for path in "${guards[@]}"; do
  name="$(basename "$path" .sh)"
  rel="${path#"$REPO_ROOT"/}"

  bash "$path" >"$out_file" 2>&1
  status=$?

  if [ "$status" -eq 0 ]; then
    summary+=("  PASS  $name")
  else
    failed=$(( failed + 1 ))
    summary+=("  FAIL  $name  (exit $status)")
    echo "───── FAIL: $rel (exit $status) ─────"
    cat "$out_file"
    echo "───── end $rel ─────"
    echo
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

echo "repo-guards OK — all ${#guards[@]} guard(s) passed."
exit 0
