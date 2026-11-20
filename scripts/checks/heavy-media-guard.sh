#!/usr/bin/env bash
#
# Module:   heavy-media-guard.sh
# Purpose:  Fail when the tree tracks an image or video outside the few folders
#           that ship or test it, so screenshots and recordings stop piling up
#           in git (MEH-3534).
# Touches:  nothing — reads `git ls-files`, prints to stdout.
# Does NOT: look at the PR diff or at history. It checks the tree as it is, so
#           it needs no base branch and cannot be fooled by a moving one. It
#           does not shrink .git: the 4,507 files removed in MEH-3534 stay in
#           history at the SHA named in docs/media-archive.md.
# Related:  docs/media-archive.md (where the old screenshots are and how to get
#           one back) · .gitignore (stops an accidental `git add` first) ·
#           pr-evidence-guard.sh (rule 23 now asks for a `Screenshots:` link) ·
#           .claude/rules/testing.md «QA screenshots live outside the repo».
# History:  MEH-3534 (creation — 242 MB of screenshots had reached the tip of
#           staging: qa-artifacts/ 130 MB, docs/audits 56 MB, docs/design-audit
#           24 MB, frontend/qa-artifacts 20 MB, tests/screenshots 12 MB).
#
# ALLOWED — files the product or a test actually reads:
#   frontend/public/            served by the site
#   frontend/e2e/visual/        VRT baselines, read by parity.spec.ts
#   design-reference/           the design-system reference bundle
#   logo/                       brand source files
#   docs/research/screenshots/2026-05/   the competitor captures the research
#                               doc of that month cites (4 MB, frozen)
# Anything else that is an image or a video fails. A QA screenshot goes to the
# evidence folder linked from the PR body, never into the tree.

set -uo pipefail

MEDIA_RE='\.(png|jpe?g|webp|gif|avif|bmp|tiff?|mp4|mov|webm|m4v|avi|mkv)$'
ALLOW_RE='^(frontend/public/|frontend/e2e/visual/|design-reference/|logo/|docs/research/screenshots/2026-05/)'

offenders() {  # stdin: one path per line → stdout: the paths that break the rule
  grep -iE "$MEDIA_RE" | grep -vE "$ALLOW_RE" || true
}

check() {
  local list bad n
  list="${HEAVY_MEDIA_FILES-$(git ls-files)}"
  bad="$(printf '%s\n' "$list" | offenders)"
  if [ -z "$bad" ]; then
    n="$(printf '%s\n' "$list" | grep -ciE "$MEDIA_RE" || true)"
    echo "heavy-media-guard: OK ($n media files, all in allowed folders)"
    return 0
  fi
  n="$(printf '%s\n' "$bad" | wc -l | tr -d ' ')"
  printf '%s\n' "$bad" | sed 's/^/heavy-media-guard: /;s/$/:1: image or video outside the allowed folders/'
  echo "heavy-media-guard: $n file(s). Put QA screenshots in the PR's evidence folder and link it (testing.md «QA screenshots live outside the repo»); see docs/media-archive.md."
  return 1
}

self_test() {
  local status=0
  run_case() {  # name expect files
    local got=PASS
    HEAVY_MEDIA_FILES="$3" check >/dev/null 2>&1 || got=FAIL
    if [ "$got" = "$2" ]; then echo "  [ok] $1 → $got"; else echo "  [XX] $1 → $got, expected $2"; status=1; fi
  }
  echo "heavy-media-guard --self-test"
  run_case "no media at all"                      PASS $'backend/app/main.py\ndocs/README.md'
  run_case "qa-artifacts webp"                    FAIL $'qa-artifacts/MEH-1/a-375.webp'
  run_case "frontend/qa-artifacts png"            FAIL $'frontend/qa-artifacts/MEH-1/b.png'
  run_case "docs/audits screenshot"               FAIL $'docs/audits/screenshots/x/home.png'
  run_case "upper-case extension"                 FAIL $'docs/design-audit/HOME.PNG'
  run_case "video in docs"                        FAIL $'docs/demo.mp4'
  run_case "text evidence in qa-artifacts"        PASS $'qa-artifacts/MEH-1/report.md\nqa-artifacts/MEH-1/run.json'
  run_case "public image"                         PASS $'frontend/public/og-image.png'
  run_case "VRT baseline"                         PASS $'frontend/e2e/visual/parity.spec.ts-snapshots/a-linux.png'
  run_case "logo + design reference"              PASS $'logo/logo.png\ndesign-reference/s2-logo/x.webp'
  run_case "research folder of 2026-05 only"      FAIL $'docs/research/screenshots/2026-12/x.png'
  run_case "one bad among many good"              FAIL $'frontend/public/a.png\ntests/screenshots/b.png'
  # Anchored to the real tree: a real allowed file passes, and the same file
  # name moved under qa-artifacts/ fails.
  local real; real="$(git ls-files frontend/public | grep -iE "$MEDIA_RE" | head -1)"
  if [ -z "$real" ]; then echo "  [XX] real-file anchor: no media under frontend/public"; status=1
  else
    run_case "real file ($real)"                  PASS "$real"
    run_case "same file under qa-artifacts/"      FAIL "qa-artifacts/${real##*/}"
  fi
  return "$status"
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
  *) check; exit $? ;;
esac
