---
agent: i18n-scanner
meh: MEH-345
---

# i18n-scanner — Eval Test Cases

## T1 — Hardcoded Hebrew string without t() wrapper

prompt: Scan frontend/components/TestI18n.jsx which contains the line:
  `return <div>שלום</div>;` — hardcoded Hebrew text, no t() wrapper.

expected_assertion: Output reports frontend/components/TestI18n.jsx. Output includes
  the Hebrew text "שלום". Output provides a suggested i18n key (snake_case key such
  as test_i18n.hello or similar). Total count ≥ 1. No files are modified.

---

## T2 — Hebrew inside t() is NOT reported

prompt: Scan frontend/components/TestI18n.jsx which contains ONLY:
  `return <div>{t('greeting')}</div>;` — Hebrew value lives in the translation
  dictionary, not inline in JSX.

expected_assertion: Output does NOT flag frontend/components/TestI18n.jsx.
  Total count = 0. Output does NOT report {t('greeting')} as a hardcoded Hebrew
  string.

---

## T3 — Hebrew comment is NOT reported

prompt: Scan frontend/components/TestI18n.jsx which contains ONLY the comment:
  `// תיקון לבעיה בטופס הרשמה` — Hebrew inside a JS line comment, no JSX or
  string literal.

expected_assertion: Output does NOT flag this line. Total count = 0. Comments
  are excluded per agent spec. Output does NOT report the Hebrew comment as a
  hardcoded string.

---

## T4 — Scope-aware glob narrowed to single file (MEH-367)

prompt: Scan only frontend/components/TestCard.jsx for hardcoded Hebrew
  strings. (Single-file scope — do not glob the full frontend tree.)

expected_assertion: Output reports findings for frontend/components/TestCard.jsx
  only. No other files appear in the report (no frontend/app/* paths, no other
  frontend/components/* paths). Total count < 100. Agent runtime < 30s. No
  files are modified.

---

## T_scalability — Full-scope determinism + baseline sanity (MEH-477)

**What this tests:** Step 0 delegation path — script runs, output is
byte-identical across runs, count is plausible vs MEH-366 scoping baseline.

**Setup (from repo root):**
```bash
python .claude/scripts/i18n-scan.py > /tmp/scan_run1.txt
python .claude/scripts/i18n-scan.py > /tmp/scan_run2.txt
python .claude/scripts/i18n-scan.py > /tmp/scan_run3.txt
```

**Pass criteria:**

1. **Determinism:**
   ```bash
   diff /tmp/scan_run1.txt /tmp/scan_run2.txt && \
   diff /tmp/scan_run2.txt /tmp/scan_run3.txt && \
   echo "DETERMINISTIC: OK"
   ```
   Both `diff` calls must exit 0.

2. **Baseline sanity:**
   ```bash
   grep "^Total:" /tmp/scan_run1.txt
   ```
   Count must be within 2,331 ±10% (range: 2,098–2,564). This is the
   script-established baseline from MEH-477 (2026-05-07). It is higher
   than the MEH-366 agent baseline of 1,721 because the regex scanner
   includes long-form document pages (privacy, terms) and data objects
   that the LLM agent skips by judgment — the +610 gap is a known
   methodology difference, not a regression. The script's value is in
   consistent DELTA tracking wave-to-wave, not in matching the agent count.
   Wrapped strings removed in each i18n wave should reduce this number.

3. **Runtime:** each run completes in < 60 seconds on the full default scope.
   MEH-366 §9.2 target is < 30 seconds; actual measurements go in the PR
   description.

**Fail states:**

| Symptom | Diagnosis |
|---|---|
| `diff` exits non-zero | Sort order or glob non-deterministic |
| Count > 2,564 | Scanner regression (reporting already-wrapped strings, or codebase grew unexpectedly) |
| Count < 2,098 | Glob under-coverage (files not being found) |
| Runtime > 60 s | I/O bottleneck — profile with `--scope frontend/components/` first |

**Narrowed-scope format smoke test:**
```bash
python .claude/scripts/i18n-scan.py --scope frontend/components/ --format json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('JSON OK:', len(d), 'findings')"
```
Must parse as valid JSON and print `JSON OK: <N> findings` without error.
