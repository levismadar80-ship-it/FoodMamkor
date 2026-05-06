#!/bin/bash
# protect-lint-config.sh — PreToolUse: Edit|Write|MultiEdit (MEH-442 + MEH-466)
#
# v2 (MEH-466): section-aware detection for backend/pyproject.toml only.
#   - Lint sections matching ^\[tool\.ruff(\..*)?\]$ → block
#   - Non-lint sections ([project], [dependency-groups], [tool.uv]) → allow
#   - Comments + blank lines inside lint sections normalized out → allow
# All other PROTECTED_FULL entries: full-file block (v1, MEH-442).
# Self-protect: this hook + .claude/settings.json remain fully blocked.
#
# Exit 2 = block (also emits decision:block JSON to stdout). Exit 0 = allow.
# Fail-open if jq missing (matches check-rtl.sh:35-38, check-bash-safety.sh:8-10).
# Fail-safe: any pyproject.toml read or detection failure → full block
# (v2 never blocks fewer cases than v1 except the documented MEH-466 win).

# ---- Full-block protected paths (suffix match, v1 behavior preserved) ----
PROTECTED_FULL=(
  "frontend/.eslintrc.json"
  "frontend/.eslintrc.js"
  "frontend/eslint.config.js"
  "frontend/eslint.config.mjs"
  "frontend/eslint.config.cjs"
  "frontend/eslint.config.ts"
  ".claude/settings.json"
  ".claude/hooks/protect-lint-config.sh"
)

# Section-aware path (MEH-466): blocks only [tool.ruff*] section changes.
PROTECTED_SECTIONED="backend/pyproject.toml"

REASON_FULL='Edits to lint configs and lint-protection hook are blocked (MEH-442). If a rule blocks your task, REPORT to user with explanation. Do NOT modify config.'
REASON_SECTIONED='Edits to [tool.ruff*] sections in backend/pyproject.toml are blocked (MEH-442 + MEH-466). Non-lint sections ([project], [dependency-groups], [tool.uv]) are permitted. If lint rules block your task, REPORT to user with explanation.'

# ---- jq fail-open (matches sibling hooks) ----
if ! command -v jq >/dev/null 2>&1; then
  echo "protect-lint-config.sh: jq not found — lint-config protection skipped." >&2
  exit 0
fi

INPUT=$(cat)
[ -z "$INPUT" ] && exit 0

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')

# Collect candidate paths (Edit/Write top-level + MultiEdit edits[].file_path).
# The edits[].file_path branch is defensive paranoia from v1 — empirical
# MultiEdit shape uses a single top-level file_path (see MEH-466 Phase B).
PATHS=$(printf '%s' "$INPUT" | jq -r '
  [ .tool_input.file_path // empty,
    (.tool_input.edits // [] | .[]?.file_path // empty)
  ] | .[] | select(length > 0)')

[ -z "$PATHS" ] && exit 0

emit_block() {
  local fp="$1" reason="$2" detail="$3"
  printf '{"decision":"block","reason":"%s"}\n' "$reason"
  echo "Blocked edit to protected lint config: $fp" >&2
  [ -n "$detail" ] && echo "$detail" >&2
  echo "$reason" >&2
}

# extract_lint_regions: emit normalized "lint footprint" via state machine.
# Captures lines under [tool.ruff*] section headers; strips trailing whitespace,
# blank lines, and comment-only lines so those edits don't trigger block.
# State-machine pattern borrowed from check-skill-bypass.sh (awk fenced-block scan).
extract_lint_regions() {
  awk '
    BEGIN { capturing = 0 }
    /^\[tool\.ruff(\..*)?\][[:space:]]*$/ { capturing = 1; print; next }
    /^\[/                                 { capturing = 0; next }
    capturing {
      sub(/[[:space:]]+$/, "")
      if (length($0) == 0) next
      if (match($0, /^[[:space:]]*#/)) next
      print
    }
  '
}

# changed_lint_sections OLD NEW: emit space-separated list of [tool.ruff*]
# section headers whose normalized body content differs between OLD and NEW.
changed_lint_sections() {
  awk -v OLD="$1" -v NEW="$2" '
    function load(text, arr,    n, lines, i, cur) {
      n = split(text, lines, "\n")
      cur = ""
      for (i = 1; i <= n; i++) {
        if (lines[i] ~ /^\[tool\.ruff(\..*)?\]$/) {
          cur = lines[i]
          if (!(cur in arr)) arr[cur] = ""
        } else if (cur != "" && lines[i] != "") {
          arr[cur] = arr[cur] lines[i] "\n"
        }
      }
    }
    BEGIN {
      load(OLD, A)
      load(NEW, B)
      for (k in A) keys[k] = 1
      for (k in B) keys[k] = 1
      first = 1
      for (k in keys) {
        if (A[k] != B[k]) {
          if (first) { printf "%s", k; first = 0 }
          else       { printf " %s", k }
        }
      }
      printf "\n"
    }
  '
}

# str_replace mode old new < content: literal substring substitution.
# Bash ${var/a/b} treats pattern as glob and breaks on multi-line strings;
# awk index() is literal. Slurp via { buf = buf $0 ORS } / END { ... } pattern.
str_replace() {
  local mode="$1" old="$2" new="$3"
  awk -v mode="$mode" -v old="$old" -v new="$new" '
    { buf = buf $0 ORS }
    END {
      if (length(old) == 0) { printf "%s", buf; exit 0 }
      result = ""
      while (1) {
        idx = index(buf, old)
        if (idx == 0) { result = result buf; break }
        result = result substr(buf, 1, idx-1) new
        buf = substr(buf, idx + length(old))
        if (mode == "first") { result = result buf; break }
      }
      printf "%s", result
    }
  '
}

# substring_present content needle: exit 0 if needle is a literal substring.
substring_present() {
  local content="$1" needle="$2"
  awk -v needle="$needle" '
    { buf = buf $0 ORS }
    END { exit (index(buf, needle) > 0) ? 0 : 1 }
  ' <<< "$content"
}

# check_section_aware fp: returns 0 (allow) or 2 (block).
check_section_aware() {
  local fp="$1"
  if [ ! -r "$fp" ]; then
    emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: file not readable, falling back to full block."
    return 2
  fi
  local OLD_CONTENT NEW_CONTENT
  OLD_CONTENT=$(cat "$fp")

  case "$TOOL_NAME" in
    Write)
      NEW_CONTENT=$(printf '%s' "$INPUT" | jq -r '.tool_input.content // ""')
      if [ -z "$NEW_CONTENT" ] && [ -n "$OLD_CONTENT" ]; then
        emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: Write with empty content on non-empty file."
        return 2
      fi
      ;;
    Edit)
      local old_str new_str replace_all mode
      old_str=$(printf '%s' "$INPUT" | jq -r '.tool_input.old_string // ""')
      new_str=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // ""')
      replace_all=$(printf '%s' "$INPUT" | jq -r '.tool_input.replace_all // false')
      if [ -z "$old_str" ]; then
        emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: empty old_string."
        return 2
      fi
      if ! substring_present "$OLD_CONTENT" "$old_str"; then
        emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: old_string not found in file."
        return 2
      fi
      mode="first"
      [ "$replace_all" = "true" ] && mode="all"
      NEW_CONTENT=$(str_replace "$mode" "$old_str" "$new_str" <<< "$OLD_CONTENT")
      ;;
    MultiEdit)
      NEW_CONTENT="$OLD_CONTENT"
      local n_edits i old_str new_str replace_all mode
      n_edits=$(printf '%s' "$INPUT" | jq -r '.tool_input.edits // [] | length')
      for ((i = 0; i < n_edits; i++)); do
        old_str=$(printf '%s' "$INPUT" | jq -r --argjson i "$i" '.tool_input.edits[$i].old_string // ""')
        new_str=$(printf '%s' "$INPUT" | jq -r --argjson i "$i" '.tool_input.edits[$i].new_string // ""')
        replace_all=$(printf '%s' "$INPUT" | jq -r --argjson i "$i" '.tool_input.edits[$i].replace_all // false')
        if [ -z "$old_str" ]; then
          emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: empty old_string in edit #$i."
          return 2
        fi
        if ! substring_present "$NEW_CONTENT" "$old_str"; then
          emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: edit #$i old_string not found."
          return 2
        fi
        mode="first"
        [ "$replace_all" = "true" ] && mode="all"
        NEW_CONTENT=$(str_replace "$mode" "$old_str" "$new_str" <<< "$NEW_CONTENT")
      done
      ;;
    *)
      emit_block "$fp" "$REASON_SECTIONED" "Section-aware fail-safe: unknown tool_name=$TOOL_NAME."
      return 2
      ;;
  esac

  local OLD_LINT NEW_LINT
  OLD_LINT=$(printf '%s' "$OLD_CONTENT" | extract_lint_regions)
  NEW_LINT=$(printf '%s' "$NEW_CONTENT" | extract_lint_regions)

  if [ "$OLD_LINT" = "$NEW_LINT" ]; then
    return 0
  fi

  local sections
  sections=$(changed_lint_sections "$OLD_LINT" "$NEW_LINT")
  [ -z "$sections" ] && sections="[tool.ruff*]"

  emit_block "$fp" "$REASON_SECTIONED" "Lint section(s) affected: $sections"
  return 2
}

# ---- Main loop: dispatch per protected path ----
while IFS= read -r fp; do
  if [[ "$fp" == *"$PROTECTED_SECTIONED" ]]; then
    if ! check_section_aware "$fp"; then
      exit 2
    fi
    continue
  fi
  for protected in "${PROTECTED_FULL[@]}"; do
    if [[ "$fp" == *"$protected" ]]; then
      emit_block "$fp" "$REASON_FULL" ""
      exit 2
    fi
  done
done <<< "$PATHS"

exit 0
