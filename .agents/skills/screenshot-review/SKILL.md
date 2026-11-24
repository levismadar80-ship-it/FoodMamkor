---
name: "screenshot-review"
description: "Review every screenshot a task takes before it reaches Sapir: measure the captured screen (overflow, tap targets, broken images, axe) and walk one fixed checklist (states, widths, RTL, prices and times, consistency, 5-second test). Use whenever a task captures screenshots: QA, PR evidence, a gallery, a bug report."
---

# screenshot-review — one fixed check for every screenshot

Sapir chose this on 24/11/2026 (MEH-3816): every thread that captures a screen
runs the same two halves on it, and the gallery says what was checked.

- **Measured half** (a machine can do it): run `screenChecks` on the page you
  just captured.
- **Judged half** (needs eyes): open the PNG and walk the checklist below.

An empty measured half means the measurable part passed. It does not mean the
screen is right. Both halves run on every screenshot.

This is the light, per-screenshot step. A full design review of a PR is still
the `design-review` agent and `critique` / `polish` (workflow rule 43).

## 1. Measure the screen you captured

In the same Playwright page, right after `page.screenshot(...)`, and only once
the screen is in a stable state (wait on the element or response that proves
it, never a fixed delay):

```js
import { screenChecks } from "<repo>/frontend/e2e/_screen-checks.mjs";
const r = await screenChecks(page, "390 list-3-items");
// r.problems: one line per problem. Read every line.
```

Staging needs the TLS cap and the bypass cookie of `.claude/rules/testing.md`
«Driving Playwright against staging»; a screen behind login uses the demo
accounts of the same section. Put the harness in a scratch directory, never in
a test glob (workflow rule 42).

What it measures, and how to read it:

| Line | Meaning | How to judge it |
|---|---|---|
| `Horizontal overflow` | the page scrolls sideways | Always a finding at phone width. |
| `Clipped by overflow:hidden` / `Modal exceeds viewport` / `Nav/tab bar cut off` / `Header/footer overlaps body` | something is cut or covered | A finding unless the clip is intended (Leaflet panes are already excluded). |
| `Tap target < 44px` | a button or link smaller than 44×44 | Phone width only. A link inside a sentence is exempt (WCAG 2.5.8). A standalone button or link under 44 is a finding. |
| `Unintentional truncation` | text ends in a literal "..." | A finding unless the text really ends that way. |
| `Broken image` / `Image without alt` | an image did not load, or has no alt | A finding. In the sandbox, check first that the host was reachable. |
| `axe <rule>` | critical or serious accessibility problem | A finding. `color-contrast` on BottomNav inactive labels, the dairy map card and the image-missing placeholder is known and deferred (MEH-919, MEH-815): name it, don't re-report it. |

## 2. Walk the checklist on the PNG

Open each image and look. For each line, it either passes, is a finding, or
is "not captured" (say which screenshot is missing).

1. **States.** Every list, filter or reveal on the screen: 0 items, 1 item,
   many items, each closed and open (CLAUDE.md, the 5-state rule: count the
   cells, not two lists). Plus loading and error where the screen has them.
2. **Widths.** A phone (390 or 375) and a desktop (1280 or 1440) shot.
   Nothing cut off, no sideways scroll, no overlapping text, no sticky bar
   covering content.
3. **Contrast and tap size.** Step 1 measures them. Also check by eye any text
   over a photo, which axe cannot measure.
4. **RTL.** Text and lists start on the right. Directional icons (arrows,
   chevrons, "back") point the right way. A price keeps ₪ and the number
   together on one line, in the order the rest of the site uses. Times are
   24-hour (18:00, never 6:00 PM). Dates read day/month.
5. **Consistency.** The same action uses the same word and the same button
   style as on other screens. «בית עסק», never «יצרן». Business-owner screens
   use neutral wording (docs/BRAND.md §9). No phrase forbidden by the brand
   rules.
6. **5-second test.** Look at the shot for five seconds, then write down the
   main action. If you can't name it, or there are two that compete, that is a
   finding.
7. **New Hebrew text.** Any copy that appears for the first time went through
   `hebrew-content-writer` and `clarify`, and matches the card's approved
   table word for word.

## 3. Report

**Per screenshot, one caption line** for the gallery (the
screenshots-drive-link rule) and for the PR body under `## Screenshot review`:

```
390 · רשימה עם 3 פריטים, פתוחה · נמדד: תקין · נבדק: מצבים, RTL, מחירים ושעות, פעולה ראשית «הזמנה»
```

When something failed, the line names it:

```
390 · רשימה ריקה · נמדד: כפתור «סינון» 30×30 · נבדק: אין צילום של מצב שגיאה
```

**Findings.** A problem you will report as a bug follows the house rule for
findings: a stable state, at least 3 matching measurements and a screenshot.
Until then it is labelled «חשד, לא מאומת» (MEH-3814, `verifyFinding`, once it
merges).

Write every Hebrew caption through `hebrew-content-writer`. Keep each one to a
single line.

## What this skill does not do

- It does not take the screenshots. The task does, at the sizes of workflow
  rule 38.
- It does not upload them. Drive and the gallery are the screenshots-drive-link
  rule.
- It does not replace the rule-5a reviewer or a full design review.
