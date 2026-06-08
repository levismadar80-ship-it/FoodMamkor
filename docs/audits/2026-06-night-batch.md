# 2026-06 overnight bug-fix batch

> Autonomous overnight session — 3 independent LOW-RISK Linear issues, one
> branch + one draft PR each, off `staging`. No human input; all PRs left as
> **draft** for Sapir's morning review.

## Results

| Issue | Title | Branch | PR | Status |
|---|---|---|---|---|
| MEH-753 | Event dates respect locale (kill 4 hardcoded `he-IL` formatDate helpers) | `feature/meh-753-event-dates-locale` | [#976](https://github.com/levismadar80-ship-it/FoodMamkor/pull/976) | ✅ draft, build green |
| MEH-741 | Omit null durations from Recipe JSON-LD | `feature/meh-741-recipe-schema-nulls` | [#979](https://github.com/levismadar80-ship-it/FoodMamkor/pull/979) | ✅ draft, vitest 15/15 + build green |
| MEH-731 | FooterSlot + admin/layout locale-aware `usePathname` | `feature/meh-731-locale-pathname-siblings` | _this branch_ | ✅ draft, build green |

## BLOCKED

_(none — all 3 issues completed.)_

## Notes for morning review

- **MEH-753 ↔ #974 file overlap (resolved in staging).** MEH-753 touches
  `ExperienceCard.jsx` + `HomeProductCard.jsx`; the audit-fix PR **#974**
  (bidi `dir="ltr"` price isolation) touched the same files on *different
  lines* and **merged to staging mid-session**. PR #976 (MEH-753) is now
  behind that merge and needs a `git merge origin/staging` before it can
  merge — the hunks are orthogonal (date-locale vs price isolation), so it
  should resolve clean. Flagged in the PR body.
- **MEH-741 ↔ #975 (test-expansion) — no overlap.** #975's new frontend test
  lives in `frontend/__tests__/expansion/` and it treats existing test files
  as read-only; it does not touch `RecipeJsonLd.test.jsx` / `BottomNav.test.jsx`.
  Confirmed via `get_files` before editing.
- **Scope discipline:** MEH-753 fixed exactly the 4 named helpers + 1 new lib
  (`frontend/lib/format-date.js`); ~30 other codebase `he-IL` date sites left
  for their own surfaces / i18n waves. MEH-731 moved only `usePathname` (not
  `useRouter` — the `/login` redirect was not the bug).
- All three are DRAFT — none auto-merged; `Closes MEH-XX` will fire on human
  merge in the morning.
