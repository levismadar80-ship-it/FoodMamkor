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
