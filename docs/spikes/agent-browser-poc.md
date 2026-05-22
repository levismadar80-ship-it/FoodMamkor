# agent-browser POC — Spike Results

**Date:** 2026-05-22
**Linear:** MEH-633
**Branch:** `spike/agent-browser-poc` (local only, no PR)
**Time-box:** 30 min · **Actual:** ~15 min
**Verdict:** ✅ PASS — all acceptance criteria met

---

## TL;DR

`agent-browser` v0.27.0 (Vercel Labs) installs and runs successfully on
Windows + Git Bash. Hebrew RTL renders correctly, `@e` element refs work,
`set viewport` overrides default size, and `--headers` overrides
`Accept-Language` to prevent unwanted `/en` redirects. Ready for MEH-634
integration test.

---

## Environment

| Component | Version | Source |
|---|---|---|
| OS | Windows 11 + Git Bash (MINGW64) | Smadar's primary dev shell |
| Node | v24.14.0 | pre-installed |
| npm | 11.9.0 | pre-installed |
| agent-browser | 0.27.0 | `npm install -g` |
| Chromium | Chrome 149.0.7827.22 | `agent-browser install` |
| Install location | `C:\Users\topaz\.agent-browser\browsers\` | Chrome for Testing |

---

## Acceptance Criteria — Results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `npm install -g agent-browser` succeeds | ✅ | `added 1 package in 5s` |
| 2 | `agent-browser install` (Chromium) succeeds | ✅ | `Chrome 149.0.7827.22 installed successfully` |
| 3 | `--version` returns version string | ✅ | `agent-browser 0.27.0` |
| 4 | `open mehamakor.online` opens page | ✅ | Page title returned in Hebrew |
| 5 | `snapshot -i` returns `@e` refs | ✅ | 139 refs on homepage |
| 6 | `screenshot` saves PNG to disk | ✅ | 938KB, valid PNG |

---

## Edge cases discovered

### 1. `set viewport` is a separate command, not a flag

**Linear issue assumed:** `agent-browser open URL --viewport 375x667`
**Reality:** `--viewport` is not a flag on `open`. Use:

```bash
agent-browser set viewport 375 667
agent-browser open URL
```

Alternative for device emulation including UA + touch events:

```bash
agent-browser set device "iPhone 14"
```

**Impact on MEH-634:** Script must set viewport per cell before each `open`.

### 2. Headless Chrome triggers `/en` redirect via `Accept-Language: en-US`

**Symptom:** `agent-browser open https://mehamakor.co.il` was being
redirected to `https://mehamakor.co.il/en`. Snapshot showed mixed
locale — English nav + Hebrew categories.

**Root cause:** Headless Chrome's default `Accept-Language` is `en-US`.
mehamakor.co.il's i18n redirect uses this header (not URL).

**Fix:**

```bash
agent-browser open URL --headers '{"Accept-Language": "he-IL,he;q=0.9"}'
```

**Side finding (worth a separate ticket):** Real users with English-language
Chrome installations may experience the same forced redirect. Consider
whether `/he` (Hebrew) should be the default for `.co.il` regardless of
Accept-Language. Not in scope for MEH-633.

### 3. `producer/1` returns 404 page

`/producer/1` does not exist in the DB. The 404 page is well-formed
(Hebrew title `"בית עסק לא נמצא | מהמקור"`, full layout with nav + footer)
but MEH-634 audit needs a real producer ID before running.

**Impact on MEH-634:** Smadar must provide a real producer ID before
script execution.

---

## Commands verified working

```bash
# Install
npm install -g agent-browser
agent-browser install

# Basic
agent-browser --version
agent-browser --help

# Navigation with locale override
agent-browser open https://mehamakor.co.il \
  --headers '{"Accept-Language": "he-IL,he;q=0.9"}'

# Viewport control
agent-browser set viewport 375 667

# Element snapshot (returns @eN refs)
agent-browser snapshot -i

# JavaScript evaluation
agent-browser eval "JSON.stringify({sw: document.body.scrollWidth, vw: window.innerWidth})"

# Screenshot
agent-browser screenshot ./output.png

# URL inspection
agent-browser get url

# Cleanup
agent-browser close
```

---

## Hebrew RTL verification

Snapshot from `mehamakor.co.il/` (mobile viewport 375x667, with
he-IL Accept-Language):

link "דלג לתוכן הראשי" [ref=e1]
link "מהמקור" [ref=e17]
button "חיפוש" [ref=e18]
button "פתח תפריט" [expanded=false, ref=e19]
heading "האוכל הכי טוב קרוב אלייך. פשוט לא ידעת איפה." [level=1, ref=e53]
button "קרוב אלי" [ref=e73]
heading "כל בית עסק על המפה" [level=2, ref=e54]


Hebrew letters render correctly, feminine voice preserved
(`גלו`, `קרוב אלי`, `פתחי מפה מלאה`). No `????` or mojibake.

---

## Horizontal scroll detection — first real measurement

```json
{"sw":360,"vw":375,"hasOverflow":false}
```

`mehamakor.co.il/` homepage at 375x667 viewport: scrollWidth (360) ≤
viewport width (375). **No horizontal scroll on homepage** — first
data point for MEH-234 mobile audit. Other routes pending in MEH-634.

---

## Ready for MEH-634

**Prerequisites confirmed:**
- ✅ Tool installs on Windows + Git Bash
- ✅ Hebrew RTL works
- ✅ Viewport override works (`set viewport W H`)
- ✅ Locale override works (`--headers '{"Accept-Language": ...}'`)
- ✅ `eval` works for scrollWidth detection
- ✅ Snapshot returns @e refs reliably

**Blocked-on for MEH-634:**
- 1 real producer ID from Smadar (DB query needed)
- 1 real category slug from Smadar (DB query needed)

---

## Decision input for MEH-635 ADR

Based on MEH-633 alone (before MEH-634):

- **Install ease:** Excellent (2 commands, 5 + ~30s)
- **Windows + Git Bash compat:** Native, no WSL needed
- **Hebrew RTL:** Full support
- **Docs quality:** README comprehensive; Linear issue had 1 inaccuracy
  (the `--viewport` flag) — minor
- **Verdict pending MEH-634:** Tool is viable. Need integration data on
  runtime, token usage, and false-positive rate before adopt/defer
  decision.