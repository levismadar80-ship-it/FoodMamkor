#!/usr/bin/env bash
#
# Module:   brand-lexicon-guard
# Purpose:  Turn docs/BRAND.md §7 "Anti-patterns (forbidden phrasings)" into a
#           red CI check. Every phrasing in that section survived to production
#           at least once and was then corrected BY HAND; §7 has said since
#           MEH-1652 that "האכיפה מתוכננת כ-lexicon check ב-CI", and no such
#           check existed.
# Touches:  nothing on a normal run — reads frontend/messages/*.json and
#           frontend/{app,components} and the baseline. Writes
#           scripts/checks/brand-lexicon-baseline.txt only under
#           --update-baseline.
# Does NOT: judge NEW copy, rank synonyms, or check tone. It decides one thing:
#           "did a phrase docs/BRAND.md §7 forbids enter the UI layer, and
#           nobody write it down". It does NOT cover emoji (owned by
#           frontend/__tests__/NoEmojiInComponents.test.js +
#           NoEmojiInMessages.test.js), raw colours (raw-color-tokens.sh) or
#           physical RTL properties (rtl-logical-props-guard.sh) — one owner
#           per fact (workflow.md Smell #1).
# Related:  docs/BRAND.md §7 (the SoT for every rule below — a rule here with no
#           line there is a bug HERE), docs/CORRECTIONS_CHECKS.md (which manual
#           correction each rule closes), scripts/checks/raw-color-tokens.sh
#           (the ratchet shape this copies, incl. the parsed-0 control and the
#           stale-line red).
# History:  MEH-3351 (creation — the correction classes Sapir kept fixing by
#           hand; BRAND.md §7 had asked for this since MEH-1652).
#
# WHY A RATCHET AND NOT A HARD FAIL
#   Some live violations sit inside APPROVED user-facing copy whose rewording is
#   Sapir's call (rule 22), so a hard fail would be unlandable and the guard
#   would never ship. The baseline freezes exactly those, occurrence by
#   occurrence, with the reason written above them; anything else is red. The
#   file can only shrink — a baseline line that matches nothing is red too, so a
#   fixed string cannot leave a permanent licence behind.
#
# WHY A BASELINE AND NOT A `guard-ok:` MARKER
#   Most of the corpus is frontend/messages/*.json. JSON has no comments, so an
#   inline marker cannot reach the lines that matter. One suppression
#   mechanism, not two (Smell #1).
#
# USAGE
#   bash scripts/checks/brand-lexicon-guard.sh                    # the gate
#   bash scripts/checks/brand-lexicon-guard.sh --update-baseline  # regenerate
#   bash scripts/checks/brand-lexicon-guard.sh --self-test        # fixtures
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE="$ROOT/scripts/checks/brand-lexicon-baseline.txt"

# Comments are prose and are stripped BEFORE matching: the repo documents these
# very phrasings in JSDoc and `//` headers ("מגזין, לא marketplace" appears in
# nine component headers, and three of those are block-comment CONTINUATION
# lines that start with prose).
#
# This is where raw-color-tokens.sh and z-index-tokens.sh have a declared blind
# spot — they test `^[[:space:]]*(\*|//|/\*|\{/\*)` per line, which a
# continuation line fails. Measured on this corpus, that blind spot produces 3
# false positives (Header.jsx:576, ProducerCard.jsx:842 and :894). A guard whose
# first run is 3/11 false teaches people to baseline things, so this one tracks
# `/* … */` and `{/* … */}` across lines instead, in strip_comments() below.
# Residual blind spot, unchanged and acceptable: an apostrophe or a `//` inside a
# string literal can mis-cut a line, which can only ever HIDE a match on that one
# line, never invent one.

# ---------------------------------------------------------------------------
# The rules. One TAB-separated row per mechanically checkable BRAND.md §7
# bullet:   id <TAB> forbidden-ERE <TAB> same-line-exception-ERE  ("-" = none)
#
# TAB is the delimiter precisely because every pattern contains `|`; an earlier
# draft used `|` and silently truncated every pattern at its first alternative
# (the self-test below is what caught it). `id` lands in the baseline, so
# renaming one invalidates its frozen lines on purpose.
#
# Hebrew final letters are spelled out rather than built from a stem: «יצרן»
# ends in ן (final nun) and «יצרנית» in נ, so no single stem covers both.
# ---------------------------------------------------------------------------
RULES=(
  # «יצרן/יצרנית» → «בית עסק» / «בעלי עסקים» (ADR-024). CARVE-OUT, MEH-1264
  # option A: legal precision keeps the Ministry of Health licence NAME, so
  # «רישיון יצרן» / «מספר רישיון יצרן» are allowed wherever they appear.
  $'yatzran\tיצרן|יצרנית|יצרנים|יצרניות\tרישיון[[:space:]]+יצרן\t'
  # «שכנות מבשלות» / «מהמטבח של השכן» / «אוכל ביתי» — illegal-in-Israel framing.
  $'home-cooking\tשכנות[[:space:]]+מבשלות|מהמטבח[[:space:]]+של[[:space:]]+השכן|אוכל[[:space:]]+ביתי\t-\t'
  # «marketplace» / «פלטפורמת מסחר» — DNA violation (magazine, not marketplace).
  # Case-insensitive: a capitalised «Marketplace» in a heading is exactly what
  # ships, and the first draft of this rule missed it (rule-5a reviewer, #4686).
  $'marketplace\tmarketplace|פלטפורמת[[:space:]]+מסחר\t-\ti'
  # The feature is «קבוצת רכישה / קבוצות רכישה» (Sapir 08/11/2026, MEH-2827).
  # §7 says the definite and prefixed forms follow the ban, so the ה is optional
  # on every word, and «קניה» (one yud) sits beside «קנייה». The first draft had
  # neither and missed «הקנייה הקבוצתית» (rule-5a reviewer, #4686).
  #
  # `(ה)?` and NOT `ה?`. A Hebrew letter is two UTF-8 bytes, and with no UTF-8
  # locale — which is this sandbox and may be the runner — `?` binds to the
  # SECOND byte only, so `ה?קנייה` matches nothing useful. Measured on a 5-line
  # fixture: `ה?` caught 1 of 5, `(ה)?` caught 5. `(ה|)` also works in grep but
  # mawk 1.3.4 rejects an empty alternative branch, and mawk is the awk here, so
  # the parenthesised-group-plus-`?` form is the one both accept. Every
  # quantifier in this file is on an ASCII char or on a group, for that reason.
  $'group-buy-term\tקבוצ(ת|ות)[[:space:]]+(ה)?רכש|(ה)?רכישה[[:space:]]+(ה)?קבוצתית|(ה)?קני(י)?ה[[:space:]]+(ה)?קבוצתית|(ה)?קניות[[:space:]]+(ה)?קבוצתיות\t-\t'
  # «מורשה»/«מורשים» in consumer copy — ADR-022 tier language is מאומת/מוצהר
  # only. Legal surfaces may use it, and «מורשה נגישות» is an unrelated
  # professional title (an external accessibility certifier), hence the
  # exception column.
  $'licensed-term\tמורשה|מורשים|מורשית|מורשות\tמורשה[[:space:]]+נגישות\t'
  # «ISSUE 01» / «SPRING 2026» — Mehamakor is not a periodical.
  $'periodical\tISSUE[[:space:]]+[0-9]{2}|(SPRING|SUMMER|AUTUMN|WINTER)[[:space:]]+20[0-9]{2}\t-\ti'
  # English boilerplate that shipped once (BRAND.md §7, first bullet).
  # `[[:space:]]+` not a literal space: "home  cooks" escaped the first draft.
  $'home-cooks\thome[[:space:]]+cooks\t-\ti'
  # Slash gender forms «מסכים/ה», «מארגן/ת», «ראה/תה» (BRAND.md §4/§9, ADR-037:
  # a neutral plural or a rewrite, never a slash). Found 18/11 in the
  # legacy-vs-today's-rules audit, in strings written before the rule; all 65
  # were reworded in the same PR (Sapir approved the table 18/11). The
  # suffix must END the word (space, punctuation or end of line follows), so
  # «תאריך/תמונה» is not a hit. No Hebrew range class: see `(ה)?` above.
  $'slash-gender\t/(ה|ת|תה|ית|ות)([[:space:]]|[[:punct:]]|$)\t-\t'
)

# Every candidate file, one path per line, relative to the repo root.
list_files() {
  local repo="$1" d
  (
    cd "$repo" || exit 1
    [ -d frontend/messages ] && find frontend/messages -maxdepth 1 -type f -name '*.json'
    for d in app components lib hooks; do
      [ -d "frontend/$d" ] || continue
      find "frontend/$d" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \) \
        -not -path '*/node_modules/*' -not -path '*/__tests__/*' \
        -not -name '*.test.*' -not -name '*.spec.*'
    done
    # The backend is in scope because user-facing Hebrew lives there: email
    # bodies and WhatsApp text, and the `detail=` strings that
    # backend/app/routers/CLAUDE.md REQUIRES be Hebrew. The rule-5a reviewer on
    # PR #4686 found «וקניות קבוצתיות פתוחות בוטלו» in a real cancellation
    # email at backend/app/services/booking_cancellations.py:258, which the
    # frontend-only scope could never have seen.
    [ -d backend/app ] && find backend/app -type f -name '*.py' -not -path '*/__pycache__/*'
  )
}

count_files() { list_files "$1" | grep -c . || true; }

# `path:line:content` for every line of every candidate file, with comments
# blanked out. A blanked line keeps its number, so every citation stays exact.
strip_comments() {
  local repo="$1"
  ( cd "$repo" || exit 1
    list_files "$repo" | tr '\n' '\0' | xargs -0 awk '
      # The position of a REAL `//` comment, or 0. A `//` preceded by `:` is a
      # URL scheme, not a comment. Treating it as one blanked the rest of the
      # line, so `<a href="https://x">קנייה קבוצתית</a>` slipped through —
      # found by the rule-5a reviewer on PR #4686 and reproduced with a fixture.
      function line_comment(s,   from, p, abs) {
        from = 1
        while (1) {
          p = index(substr(s, from), "//")
          if (p == 0) return 0
          abs = from + p - 1
          if (abs == 1 || substr(s, abs - 1, 1) != ":") return abs
          from = abs + 2
        }
      }
      FNR == 1 { inblock = 0; indoc = "" }
      {
        line = $0
        # JSON has no comments, and a `//` inside a Hebrew string is content.
        if (FILENAME ~ /\.json$/) { print FILENAME ":" FNR ":" line; next }
        out = ""
        if (FILENAME ~ /\.py$/) {
          # Python: `#` to end of line, plus triple-quoted blocks. Docstrings
          # matter more here than anywhere else — the §14 file-header contract
          # puts "מגזין, לא marketplace"-style prose in a module docstring, and
          # scanning those would make every compliant header a violation.
          while (length(line)) {
            if (indoc != "") { i = index(line, indoc); if (i == 0) { line = ""; break }
                               line = substr(line, i + 3); indoc = ""; continue }
            d3 = index(line, "\"\"\""); q3 = index(line, "\x27\x27\x27")
            hc = index(line, "#")
            first = 0; kind = ""
            if (d3 && (!q3 || d3 < q3)) { first = d3; kind = "\"\"\"" }
            else if (q3)                { first = q3; kind = "\x27\x27\x27" }
            if (hc && (!first || hc < first)) { out = out substr(line, 1, hc - 1); line = ""; break }
            if (first) { out = out substr(line, 1, first - 1); line = substr(line, first + 3); indoc = kind; continue }
            out = out line; line = ""
          }
          print FILENAME ":" FNR ":" out
          next
        }
        while (length(line)) {
          if (inblock) { i = index(line, "*/"); if (i == 0) { line = ""; break }
                         line = substr(line, i + 2); inblock = 0; continue }
          lc = line_comment(line); bc = index(line, "/*")
          if (lc && (!bc || lc < bc)) { out = out substr(line, 1, lc - 1); line = ""; break }
          if (bc) { out = out substr(line, 1, bc - 1); line = substr(line, bc + 2); inblock = 1; continue }
          out = out line; line = ""
        }
        print FILENAME ":" FNR ":" out
      }' )
}

# Every violation, one record per OCCURRENCE: `path<TAB>line<TAB>id<TAB>match`.
#
# `grep -nHE` (not -o) is load-bearing: the comment filter has to see the WHOLE
# source line to tell prose from copy. The per-occurrence split therefore
# happens in awk, after the filter.
scan() {
  local repo="$1" stripped rule id pat allow
  [ "$(count_files "$repo")" -gt 0 ] || return 0
  stripped="$(mktemp)"
  strip_comments "$repo" > "$stripped"
  for rule in "${RULES[@]}"; do
    IFS=$'\t' read -r id pat allow flags <<<"$rule"
    ci=0; case "$flags" in *i*) ci=1 ;; esac
    grep ${ci:+$([ "$ci" = 1 ] && echo -i)} -E "$pat" "$stripped" 2>/dev/null \
      | awk -F: -v id="$id" -v pat="$pat" -v allow="$allow" -v ci="$ci" '
          {
            p=$1; l=$2; line=$0
            sub(/^[^:]*:[0-9]+:/, "", line)
            r = line
            # awk has no /i, so fold a copy and match positions against it. The
            # REPORTED text still comes from the original, so a capitalised
            # «Marketplace» is cited as written.
            if (ci) { pat = tolower(pat); orig = r; r = tolower(r) }
            while (match(r, pat)) {
              t = substr(ci ? orig : r, RSTART, RLENGTH)
              adv = RSTART + RLENGTH - 1; if (adv < 1) adv = 1
              # The exception is judged on the occurrence IN CONTEXT: a few
              # characters either side, so «רישיון יצרן» exempts the «יצרן»
              # inside it while a bare «יצרן» elsewhere on the line still counts.
              ctx = substr(r, (RSTART-24 > 0 ? RSTART-24 : 1), RLENGTH + 48)
              if (allow == "-" || ctx !~ allow) print p "\t" l "\t" id "\t" t
              if (ci) orig = substr(orig, adv + 1)
              r = substr(r, adv + 1)
            }
          }'
  done
  rm -f "$stripped"
}

keys_of() { awk -F'\t' '{ print $1 "\t" $3 "\t" $4 }' | LC_ALL=C sort; }
# `return 0` is load-bearing: a missing baseline is "nothing frozen", not an
# error, and `grep -v` over an empty file exits 1.
baseline_keys() { [ -f "$1" ] && grep -vE '^[[:space:]]*(#|$)' "$1" | LC_ALL=C sort; return 0; }

run() {
  local repo="$1" baseline="$2" label="$3"
  local files records current frozen new stale rc=0

  files="$(count_files "$repo")"
  # The parsed-0 control. Without it a wrong cwd, a rename or a broken find
  # prints "0 violations" and reads as PASS under run-all.sh.
  if [ "${files:-0}" -eq 0 ]; then
    echo "::error::${label}: parsed 0 files under frontend/messages + frontend/{app,components} — every result below is void, NOT passing." >&2
    return 1
  fi

  records="$(scan "$repo")"
  current="$(printf '%s\n' "$records" | grep . | keys_of)"
  frozen="$(baseline_keys "$baseline")"
  new="$(LC_ALL=C comm -23 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"
  stale="$(LC_ALL=C comm -13 <(printf '%s\n' "$current" | grep .) <(printf '%s\n' "$frozen" | grep .))"

  echo "${label}: ${files} files scanned · $(printf '%s\n' "$current" | grep -c . || true) forbidden-phrasing occurrences · baseline $(printf '%s\n' "$frozen" | grep -c . || true) lines"

  if [ -n "$new" ]; then
    rc=1
    echo "::error::${label}: phrasing forbidden by docs/BRAND.md §7, not in the baseline:" >&2
    # `comm` emits one line per OCCURRENCE (the keys are a multiset), so collapse
    # to one row per key and print the count — an earlier draft printed n x n.
    printf '%s\n' "$new" | LC_ALL=C uniq -c | while read -r cnt key; do
      local p id m have
      IFS=$'\t' read -r p id m <<<"$key"
      have="$(printf '%s\n' "$frozen" | grep -cxF "$key" || true)"
      printf '%s\n' "$records" | awk -F'\t' -v p="$p" -v id="$id" -v m="$m" \
        '$1==p && $3==id && $4==m { print "  - " $1 ":" $2 "  [" $3 "]  " $4 }' \
        | LC_ALL=C sort -u >&2
      printf '    (%s in baseline, %s now)\n' "$have" "$((have + cnt))" >&2
    done
    {
      echo "  docs/BRAND.md §7 names the approved replacement for each. The three that bite most often:"
      echo "    יצרן · יצרנית         → בית עסק · בעלי עסקים   (ADR-024; «רישיון יצרן» stays, MEH-1264)"
      echo "    קנייה/רכישה קבוצתית   → קבוצת רכישה            (Sapir 08/11/2026, MEH-2827)"
      echo "    מורשה · מורשים        → מאומת · מוצהר          (ADR-022; legal surfaces may keep it)"
      echo "  If the phrase IS the decision, run --update-baseline, write the reason above the line, and say why in the PR body."
    } >&2
  fi
  if [ -n "$stale" ]; then
    rc=1
    echo "::error::${label}: baseline line(s) that match nothing any more — the baseline must shrink, so remove them:" >&2
    printf '%s\n' "$stale" | LC_ALL=C uniq -c | while read -r cnt key; do
      printf '  - scripts/checks/brand-lexicon-baseline.txt: %s  (x%s)\n' "$key" "$cnt" >&2
    done
    echo "  Run --update-baseline (it only ever records what is live)." >&2
  fi
  return $rc
}

write_baseline() {
  {
    cat <<'HEAD'
# GENERATED by scripts/checks/brand-lexicon-guard.sh --update-baseline (MEH-3351)
# One line per OCCURRENCE of a phrasing docs/BRAND.md §7 forbids, in
# frontend/messages/*.json + frontend/{app,components}: path<TAB>rule<TAB>match.
# A forbidden phrasing not listed here fails the gate; a line here that matches
# nothing fails too. Shrinking this file is the point; growing it needs a reason
# in the PR body. Never edit by hand — regenerate.
#
# WHY EACH LINE BELOW IS STILL HERE (MEH-3351, 17/11/2026)
#
#   licensed-term · מורשים
#     he.json «בתי עסק מקומיים מורשים», the /experiences meta description.
#     ADR-022 says consumer tier language is מאומת/מוצהר only, so this IS a
#     violation — but the replacement is new user-facing copy and needs Sapir's
#     word-for-word approval (workflow rule 22). Hers, not CC's.
#
#   marketplace · marketplace · פלטפורמת מסחר   (messages/*.json)
#     All three strings read «מהמקור is NOT built like a marketplace» — the term
#     is used to deny it. BRAND.md §7 bans the word outright and carves out no
#     exception for the negated use. Rewording is new copy; Sapir's call.
#
#   marketplace · marketplace   (backend/app/services/producer_risk.py)
#     Not copy at all: it is the English SYSTEM PROMPT sent to Anthropic — "You
#     are a marketplace fraud detector for an Israeli local food directory".
#     §7 governs what a person reads on the site and in marketing; a model
#     instruction is neither, and the word is load-bearing there (it tells the
#     model what KIND of fraud to look for). Rewording it would change a
#     moderation prompt to satisfy a copy rule, which is the wrong trade.
HEAD
    scan "$1" | keys_of
  } > "$2"
}

self_test() {
  local tmp pass=0 total=14 got
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/frontend/messages" "$tmp/frontend/components" \
           "$tmp/frontend/components/__tests__" "$tmp/backend/app/services"

  printf '{ "a": "העסק הוא יצרן מקומי", "b": "מורשה נגישות חיצוני", "c": "אני מעל גיל 18 ומסכים/ה", "d": "תאריך/תמונה" }\n' > "$tmp/frontend/messages/he.json"
  # Case 8 is anchored to a real repo file (MEH-1909): ProducerCard.jsx:841-842
  # is a two-line block comment whose SECOND line starts with prose and names
  # marketplace. A per-line comment test reports it; this corpus must not.
  cat > "$tmp/frontend/components/Card.jsx" <<'FIX'
// Does NOT: own a route ("מגזין, לא marketplace" — overlay only)
export default function Card() {
  /* MEH-1210: price removed from discovery cards
     — exact prices are a marketplace signal; they stay at product level */
  return <p>מספר רישיון יצרן: 123 · הזמנה בקנייה קבוצתית</p>;
}
FIX
  printf 'it("x", () => { expect("יצרן").toBe("יצרן"); });\n' > "$tmp/frontend/components/__tests__/Card.test.jsx"

  # Cases 9-12 each pin a finding from the rule-5a review of PR #4686. Every one
  # of them PASSED the first draft of this guard, which is why they are here:
  # a self-test that only covers what already worked is not evidence.
  cat > "$tmp/frontend/components/Url.jsx" <<'URL'
export const L = () => <a href="https://mehamakor.co.il/x">הקנייה הקבוצתית</a>;
export const M = () => <h2>Marketplace</h2>;
URL
  cat > "$tmp/backend/app/services/mail.py" <<'PYF'
"""
Module:   mail
Purpose:  send mail.
Does NOT: own a route ("מגזין, לא marketplace").
"""
BODY = "הרשמות וקניות קבוצתיות פתוחות בוטלו"  # יצרן in a trailing comment
PYF

  got="$(scan "$tmp" | keys_of)"

  _has()   { printf '%s\n' "$got" | grep -qF "$1"; }
  _hasnt() { ! printf '%s\n' "$got" | grep -qF "$1"; }

  _has $'frontend/messages/he.json\tyatzran\tיצרן' \
    && { pass=$((pass+1)); echo "  ok  1  plain «יצרן» in a message value is caught"; } \
    || echo "  FAIL 1  plain «יצרן» in a message value was NOT caught"
  _hasnt $'Card.jsx\tyatzran' \
    && { pass=$((pass+1)); echo "  ok  2  «רישיון יצרן» (the licence name) is exempt"; } \
    || echo "  FAIL 2  «רישיון יצרן» was flagged — the MEH-1264 carve-out is broken"
  _has $'frontend/messages/he.json\tslash-gender\t/ה' \
    && { pass=$((pass+1)); echo "  ok 13  a slash gender form «מסכים/ה» is caught"; } \
    || echo "  FAIL 13  «מסכים/ה» was NOT caught"
  [ "$(printf '%s\n' "$got" | grep -cF $'slash-gender')" -eq 1 ] \
    && { pass=$((pass+1)); echo "  ok 14  «תאריך/תמונה» (two words, no suffix) is not a slash form"; } \
    || echo "  FAIL 14  «תאריך/תמונה» was flagged as a slash form"
  _hasnt $'Card.jsx\tmarketplace' \
    && { pass=$((pass+1)); echo "  ok  3  «marketplace» inside a // comment is prose"; } \
    || echo "  FAIL 3  a comment mentioning marketplace was flagged"
  _has $'frontend/components/Card.jsx\tgroup-buy-term\tקנייה קבוצתית' \
    && { pass=$((pass+1)); echo "  ok  4  «קנייה קבוצתית» in JSX text is caught"; } \
    || echo "  FAIL 4  «קנייה קבוצתית» in JSX text was NOT caught"
  _hasnt 'Card.test.jsx' \
    && { pass=$((pass+1)); echo "  ok  5  __tests__ is out of scope"; } \
    || echo "  FAIL 5  a __tests__ file was scanned"
  _hasnt $'he.json\tlicensed-term' \
    && { pass=$((pass+1)); echo "  ok  6  «מורשה נגישות» (a professional title) is exempt"; } \
    || echo "  FAIL 6  «מורשה נגישות» was flagged as the regulatory term"
  # Not `_hasnt marketplace` — case 3 already covers the `//` form. This is the
  # continuation line specifically, which is why it cites a line number.
  [ "$(printf '%s\n' "$got" | grep -cF $'Card.jsx\tmarketplace')" -eq 0 ] \
    && { pass=$((pass+1)); echo "  ok  8  a block-comment CONTINUATION line is prose too"; } \
    || echo "  FAIL 8  a block-comment continuation line was flagged"
  _has $'frontend/components/Url.jsx\tgroup-buy-term\tהקנייה הקבוצתית' \
    && { pass=$((pass+1)); echo "  ok  9  a \`//\` inside a URL does not hide the rest of the line"; } \
    || echo "  FAIL 9  the URL scheme blanked the line and hid the match"
  _has $'frontend/components/Url.jsx\tmarketplace\tMarketplace' \
    && { pass=$((pass+1)); echo "  ok 10  «Marketplace» is caught, and cited with its real case"; } \
    || echo "  FAIL 10  a capitalised «Marketplace» escaped"
  _has $'backend/app/services/mail.py\tgroup-buy-term\tקניות קבוצתיות' \
    && { pass=$((pass+1)); echo "  ok 11  a Hebrew email body in backend/app is in scope"; } \
    || echo "  FAIL 11  user-facing Hebrew in the backend was not scanned"
  [ "$(printf '%s\n' "$got" | grep -cF $'mail.py\tmarketplace')" -eq 0 ] \
    && [ "$(printf '%s\n' "$got" | grep -cF $'mail.py\tyatzran')" -eq 0 ] \
    && { pass=$((pass+1)); echo "  ok 12  a Python docstring and a trailing # comment are prose"; } \
    || echo "  FAIL 12  prose in a Python docstring or # comment was flagged"
  # The parsed-0 control must itself FAIL, not pass quietly.
  if run "$tmp/frontend" /dev/null "control" >/dev/null 2>&1; then
    echo "  FAIL 7  parsed-0 control PASSED — a wrong cwd would read as green"
  else
    pass=$((pass+1)); echo "  ok  7  parsed-0 control fails loudly"
  fi

  echo "self-test: ${pass}/${total}"
  [ "$pass" -eq "$total" ]
}

case "${1:-}" in
  --update-baseline) write_baseline "$ROOT" "$BASELINE"; echo "baseline written: $BASELINE"; exit 0 ;;
  --self-test)       self_test; exit $? ;;
  "")                ;;
  *)                 echo "unknown argument: $1" >&2; exit 2 ;;
esac

# The self-test runs FIRST and a failure voids the gate: a scanner that cannot
# tell the licence name from the banned word is not evidence about the repo.
if ! self_test >/dev/null 2>&1; then
  echo "::error::brand-lexicon-guard: --self-test FAILED, so this run proves nothing about the repo. Run with --self-test to see which case broke." >&2
  exit 1
fi
run "$ROOT" "$BASELINE" "brand-lexicon"
