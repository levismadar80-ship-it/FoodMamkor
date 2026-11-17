#!/usr/bin/env bash
# MEH-3357 — docs/features/ must stay true to the repo.
#
# Two checks, both over the committed tree:
#   1. every `path/like/this` in a FILES / ROUTES / TESTS row of a feature file
#      resolves to something that exists;
#   2. every feature file is listed in docs/features/README.md, and every file
#      README lists exists.
#
# WHY A GUARD AT ALL. A per-feature doc is the artifact least likely to be
# re-read: it is written once, at the moment its author knows the most, and
# consulted later by someone who cannot tell a stale line from a current one.
# A path is the only part of it a machine can check, so that is the part this
# checks — it does NOT claim the prose is true.
#
# --self-test runs BEFORE the gate and voids the run if it fails: a clean run
# over a tree with no feature docs at all prints the same "0 problems" as a
# clean run over real ones, so the green is only evidence once the fixtures
# have shown the checker can go red.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="docs/features"
README="$DIR/README.md"

# A path-looking token inside backticks: at least one slash, no spaces, and a
# recognised source extension OR a trailing slash (a directory).
#
# The bracket expressions put `]` FIRST and `-` LAST and use no backslashes.
# That is not style: inside a POSIX bracket expression `\` is an ordinary
# character, so the obvious `[A-Za-z0-9_./@\[\]-]` is read as the class
# `[A-Za-z0-9_./@\[]` followed by the literal text `\]-]`, and the whole
# pattern then matches nothing. It failed silently — `grep -oE` returned no
# lines and the checker reported a clean tree. Case 2 of the self-test is what
# caught it, which is the reason the self-test runs before the gate.
PATH_RE='`[]A-Za-z0-9_.@-]*/[]A-Za-z0-9_.@/[-]*`'

extract_paths() {   # <file> -> one candidate path per line
  grep -oE "$PATH_RE" "$1" 2>/dev/null \
    | tr -d '`' \
    | grep -E '\.(js|jsx|ts|tsx|py|json|css|md|sh|mjs|yml|yaml)$|/$' \
    || true
}

check_tree() {      # <root> -> prints problems, returns count via PROBLEMS
  local root="$1" f p rel
  PROBLEMS=0
  shopt -s nullglob
  for f in "$root/$DIR"/*.md; do
    rel="${f#"$root"/}"
    [ "$rel" = "$README" ] && continue
    while IFS= read -r p; do
      [ -z "$p" ] && continue
      if [ ! -e "$root/${p%/}" ]; then
        echo "  MISSING  $rel -> $p"
        PROBLEMS=$((PROBLEMS + 1))
      fi
    done < <(extract_paths "$f")
    if [ -f "$root/$README" ] && ! grep -q "$(basename "$f")" "$root/$README"; then
      echo "  UNLISTED $rel is not named in $README"
      PROBLEMS=$((PROBLEMS + 1))
    fi
  done
  # the other direction: README names a file that is gone
  if [ -f "$root/$README" ]; then
    while IFS= read -r p; do
      [ -z "$p" ] && continue
      if [ ! -e "$root/$DIR/$p" ]; then
        echo "  DANGLING $README -> $p"
        PROBLEMS=$((PROBLEMS + 1))
      fi
    done < <(grep -oE '\(\./[a-z0-9-]+\.md\)' "$root/$README" 2>/dev/null | tr -d '()' | sed 's|^\./||')
  fi
  shopt -u nullglob
}

self_test() {
  local tmp pass=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/$DIR" "$tmp/frontend/lib"
  echo "x" > "$tmp/frontend/lib/real.js"

  # case 1: a file whose paths all exist, listed in README -> 0 problems
  printf '# A\n\nFILES: `frontend/lib/real.js`\n' > "$tmp/$DIR/a.md"
  printf '# index\n\n- [A](./a.md)\n' > "$tmp/$README"
  check_tree "$tmp"
  [ "$PROBLEMS" -eq 0 ] \
    && { pass=$((pass+1)); echo "  ok   1  a true file is clean"; } \
    || echo "  FAIL 1  a true file reported $PROBLEMS problem(s)"

  # case 2: a path that does not exist -> caught
  printf '# B\n\nFILES: `frontend/lib/ghost.js`\n' > "$tmp/$DIR/b.md"
  printf '# index\n\n- [A](./a.md)\n- [B](./b.md)\n' > "$tmp/$README"
  check_tree "$tmp" > "$tmp/out2"
  grep -q "MISSING  $DIR/b.md -> frontend/lib/ghost.js" "$tmp/out2" \
    && { pass=$((pass+1)); echo "  ok   2  a dead path is caught"; } \
    || echo "  FAIL 2  a dead path was NOT caught"

  # case 3: a real file missing from the README -> caught
  rm -f "$tmp/$DIR/b.md"
  printf '# C\n\nFILES: `frontend/lib/real.js`\n' > "$tmp/$DIR/c.md"
  printf '# index\n\n- [A](./a.md)\n' > "$tmp/$README"
  check_tree "$tmp" > "$tmp/out3"
  grep -q "UNLISTED $DIR/c.md" "$tmp/out3" \
    && { pass=$((pass+1)); echo "  ok   3  an unlisted feature file is caught"; } \
    || echo "  FAIL 3  an unlisted feature file was NOT caught"

  # case 4: README naming a file that is gone -> caught
  printf '# index\n\n- [A](./a.md)\n- [C](./c.md)\n- [Z](./zz.md)\n' > "$tmp/$README"
  check_tree "$tmp" > "$tmp/out4"
  grep -q "DANGLING $README -> zz.md" "$tmp/out4" \
    && { pass=$((pass+1)); echo "  ok   4  a dangling index entry is caught"; } \
    || echo "  FAIL 4  a dangling index entry was NOT caught"

  # case 5: prose that merely contains a slash is NOT treated as a path
  printf '# D\n\nThe `he/en` pair is copy, not a file.\n' > "$tmp/$DIR/d.md"
  printf '# index\n\n- [A](./a.md)\n- [C](./c.md)\n- [D](./d.md)\n' > "$tmp/$README"
  check_tree "$tmp" > "$tmp/out5"
  grep -q "he/en" "$tmp/out5" \
    && echo "  FAIL 5  a non-path backtick was treated as a path" \
    || { pass=$((pass+1)); echo "  ok   5  a non-path backtick is ignored"; }

  echo "self-test: $pass/5"
  [ "$pass" -eq 5 ]
}

if [ "${1:-}" = "--self-test" ]; then
  self_test; exit $?
fi

# mktemp, not /tmp/<name>.$$ — a PID is predictable, and `>` follows a symlink
# that was planted at that path first. The runner is ephemeral and the author
# already controls what runs on it, so this is housekeeping rather than a fix;
# it costs one line and removes the question.
selftest_log="$(mktemp)"
if ! self_test > "$selftest_log" 2>&1; then
  cat "$selftest_log"; rm -f "$selftest_log"
  echo "feature-docs-guard: SELF-TEST FAILED — this run proves nothing. Fix the checker first." >&2
  exit 1
fi
rm -f "$selftest_log"

if [ ! -d "$ROOT/$DIR" ]; then
  echo "feature-docs-guard: $DIR does not exist — nothing to check."
  exit 0
fi

check_tree "$ROOT"
n=$(find "$ROOT/$DIR" -name '*.md' -not -name 'README.md' | wc -l | tr -d ' ')
echo "feature-docs: $n feature file(s) · $PROBLEMS problem(s)"
[ "$PROBLEMS" -eq 0 ] || { echo "feature-docs-guard FAILED." >&2; exit 1; }
echo "feature-docs-guard OK."
