#!/usr/bin/env bash
#
# skills-layout-guard.sh — every skill is hash-locked and mounted canonically
# (MEH-1055), checked in Repo guards so it blocks a merge.
#
# WHY THIS EXISTS
#   Four skills sat `approved` for months as real directories under
#   .claude/skills/, with no skills-lock.json entry: no hash anchored the
#   audited content, and Pass 1 of the skills audit never scanned them. The
#   check that catches this is Pass 2b of .claude/scripts/audit-skills.sh —
#   but that script runs in skills-audit.yml, which no required gate
#   aggregates, so a red there never blocked a merge. Repo guards does feed
#   the required CI gate. This guard runs the SAME function (no copy:
#   `audit-skills.sh --pass2b-only`) in two ways:
#     1. self-test on fixture trees with a known answer per tag — so a broken
#        Pass 2b goes red here, not silently green;
#     2. the real repo — must report nothing.
#
# Does NOT: pattern-scan skill content or verify hashes (Pass 1 / Pass 4 of
#   the audit, in skills-audit.yml). No network.
# History: MEH-1055 (creation, after the fresh review found Pass 2b passed a
#   retargeted symlink, an empty date and `review_needed` + no lock).
# Related: .claude/scripts/audit-skills.sh · .claude/rules/skills.md (Layer 4/5).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
AUDIT="$REPO_ROOT/.claude/scripts/audit-skills.sh"
command -v jq >/dev/null 2>&1 || { echo "FAIL skills-layout-guard: jq not on PATH, nothing checked (this is not a pass)"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NOW=$(date -u -d "2026-11-10" +%s)   # a fixed clock, so the fixtures' answers never drift

# make_tree DIR — a tree with one good skill and whatever the case adds.
make_tree() {
  local d="$1"
  mkdir -p "$d/.agents/skills/good" "$d/.claude/skills"
  echo "# good" > "$d/.agents/skills/good/SKILL.md"
  ln -s ../../.agents/skills/good "$d/.claude/skills/good"
  printf '{"skills":{"good":{"audit_verdict":"approved","last_audit_date":"2026-11-01"}}}' > "$d/.claude/skills-allowlist.json"
  printf '{"version":1,"skills":{"good":{"computedHash":"x"}}}' > "$d/skills-lock.json"
}
set_entry() { # DIR NAME JSON — add an allowlist entry
  local f="$1/.claude/skills-allowlist.json"
  jq --arg n "$2" --argjson v "$3" '.skills[$n]=$v' "$f" > "$f.n" && mv "$f.n" "$f"
}
lock() { local f="$1/skills-lock.json"; jq --arg n "$2" '.skills[$n]={"computedHash":"x"}' "$f" > "$f.n" && mv "$f.n" "$f"; }
canon() { mkdir -p "$1/.agents/skills/$2"; echo "# $2" > "$1/.agents/skills/$2/SKILL.md"; ln -s "../../.agents/skills/$2" "$1/.claude/skills/$2"; }

fails=0
# expect NAME WANT_TAG — run the real function on the case's tree.
expect() {
  local name="$1" want="$2" out
  out=$(bash "$AUDIT" --pass2b-only "$TMP/$name" "$NOW" 2>&1)
  if [ "$want" = "-" ]; then
    if [ -n "$out" ]; then echo "FAIL self-test $name: expected clean, got: $out"; fails=$((fails+1)); else echo "PASS self-test $name: clean"; fi
  elif printf '%s\n' "$out" | grep -q "^\[$want\]" && [ "$(printf '%s\n' "$out" | grep -c '^\[')" -eq 1 ]; then
    echo "PASS self-test $name: [$want]"
  else
    echo "FAIL self-test $name: expected exactly one [$want], got: ${out:-<nothing>}"; fails=$((fails+1))
  fi
}

c=clean;          make_tree "$TMP/$c"; expect "$c" -
c=realdir;        make_tree "$TMP/$c"; mkdir -p "$TMP/$c/.claude/skills/x"; echo x > "$TMP/$c/.claude/skills/x/SKILL.md"; set_entry "$TMP/$c" x '{"audit_verdict":"approved"}'; lock "$TMP/$c" x; expect "$c" NOT-CANONICAL
c=retarget;       make_tree "$TMP/$c"; mkdir -p "$TMP/$c/.agents/skills/x" "$TMP/$c/docs/evil"; ln -s ../../docs/evil "$TMP/$c/.claude/skills/x"; set_entry "$TMP/$c" x '{"audit_verdict":"approved"}'; lock "$TMP/$c" x; expect "$c" NOT-CANONICAL
c=approved-unlocked; make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved"}'; expect "$c" UNLOCKED
c=review-unlocked;   make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"review_needed"}'; expect "$c" UNLOCKED
c=clock-live;     make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked","last_audit_date":"2026-11-01"}'; expect "$c" -
c=clock-expired;  make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked","last_audit_date":"2026-09-01"}'; expect "$c" UNLOCKED-EXPIRED
c=clock-empty;    make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked","last_audit_date":""}'; expect "$c" UNLOCKED-NO-DATE
c=clock-null;     make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked"}'; expect "$c" UNLOCKED-NO-DATE
c=clock-relative; make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked","last_audit_date":"tomorrow"}'; expect "$c" UNLOCKED-NO-DATE
c=clock-future;   make_tree "$TMP/$c"; canon "$TMP/$c" x; set_entry "$TMP/$c" x '{"audit_verdict":"approved_local_unlocked","last_audit_date":"2099-01-01"}'; expect "$c" UNLOCKED-FUTURE

if [ "$fails" -ne 0 ]; then
  echo "FAIL skills-layout-guard: $fails self-test case(s) failed — Pass 2b of audit-skills.sh is not doing its job; the real-repo result below would mean nothing"
  exit 1
fi

real=$(bash "$AUDIT" --pass2b-only "$REPO_ROOT" 2>&1); code=$?
if [ "$code" -ne 0 ] || [ -n "$real" ]; then
  printf '%s\n' "$real"
  echo "FAIL skills-layout-guard: the repo's skills are not all locked and canonically mounted (see above)"
  exit 1
fi
echo "skills-layout-guard: 11 self-test cases passed; all $(ls -1 .claude/skills | wc -l | tr -d ' ') skills locked and mounted at ../../.agents/skills/<name>"
