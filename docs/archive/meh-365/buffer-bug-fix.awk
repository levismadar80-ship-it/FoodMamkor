# MEH-365 follow-up — merged-buffer false-negative fix (preserved from PR #440)
#
# BUG CLASS: grep -B1 -A1 merges adjacent violation context windows into a
# single group separated by `--` lines. A naive ±1 line check that only
# inspects the file's lines near the matched lineno will correctly suppress,
# but a buffer-based check that suppresses ALL matches in a buffer if ANY
# context line in the buffer contains rtl-ok will silently suppress unrelated
# violations.
#
# This awk processes each --separated group and, for each match within the
# group, only suppresses if a content-pattern (rtl-ok) is within ±1 line of
# THAT specific match — not anywhere in the merged buffer.
#
# Inputs:
#   cpats  — content patterns separated by | (e.g. "rtl-ok")
#   stdin  — output of: grep -rEnB1 -A1 PATTERN frontend/...
#
# Each line of grep -B1 -A1 output is either:
#   path:N:content    (match — `:` separator)
#   path-N-content    (context — `-` separator)
#   --                (group separator)
#
# T_adj_6 regression test (the case that motivated this fix):
#   File contains two violations in nearby lines. A single rtl-ok marker is
#   placed within ±1 of violation A but NOT violation B. Naive merged-buffer
#   logic suppresses both. This per-violation logic suppresses only A.

awk -v cpats="$CONTENT_PATS" '
    BEGIN { np = split(cpats, pats, "|"); buf_n = 0 }
    /^--$/ { flush(); buf_n = 0; next }
    {
      buf[buf_n] = $0
      np2 = split($0, parts, ":")
      if (np2 >= 2 && parts[2] ~ /^[0-9]+$/) {
        lnum[buf_n] = parts[2] + 0; is_match[buf_n] = 1
      } else if (np2 >= 2 && parts[2] ~ /^[0-9]+-/) {
        d = index(parts[2], "-")
        lnum[buf_n] = substr(parts[2], 1, d - 1) + 0; is_match[buf_n] = 0
      } else { lnum[buf_n] = 0; is_match[buf_n] = 0 }
      buf_n++
    }
    END { flush() }
    function has_cpat(line,    j) {
      for (j = 1; j <= np; j++)
        if (pats[j] != "" && index(line, pats[j]) > 0) return 1
      return 0
    }
    function flush(    i, j, suppress) {
      for (i = 0; i < buf_n; i++) {
        if (!is_match[i]) continue
        suppress = 0
        for (j = 0; j < buf_n; j++)
          if (lnum[j] >= lnum[i]-1 && lnum[j] <= lnum[i]+1 && has_cpat(buf[j]))
            { suppress = 1; break }
        if (!suppress) print buf[i]
      }
      buf_n = 0
    }
  '
