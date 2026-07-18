# Claude Design — Revision Round 2: ProducerDetail Refresh
<!-- המשך ל-Revision 1 (יושם במלואו ✓). סבב אחרון לפני מימוש — הנדסת ממשק: bidi, a11y, אינטגרציה. -->

```xml
<role>
Senior product designer, editorial sensibility, mobile-first, RTL Hebrew.
</role>

<context>
All 14 Revision-1 fixes applied and approved. This round: 4 blockers + interface engineering.
Keep everything not listed exactly as mocked. Same brand_lock, same scope.
</context>

<blockers>
1. BIDI TIME RANGES — every time range renders inside dir="ltr" (existing precedent:
   ReviewsSection.jsx date wrapping). The weekly table currently shows REVERSED ranges — fix all:
   correct form: 9:00–17:00 (start on the left). Re-verify Friday's hours after the fix
   (currently ambiguous "13:00–8:30"). Annotate dir="ltr" on: today-row, weekly table, vacation date.

2. TWO GREEN "OPEN" SIGNALS — semantic collision:
   - Header "פתוח להזמנות" = ordering availability (WhatsApp) — KEEPS primary green treatment.
   - Hours row = physical opening — DROPS the word "פתוח" and the green. New treatment:
     "היום · 9:00–17:00" in neutral text (#1C1A17), clock icon, no status color.
   One page = one green status. Show both zones together in one frame to prove no collision.

3. MOBILE SECTION TAB BAR — missing from mockup but exists in production (sticky under header,
   scroll offsets = --chrome-top + 68px per MEH-1202). Add one mobile frame: new header +
   sticky tab bar live (tabs: אודות · מוצרים · משלוחים · ביקורות) + note if new header
   changes chrome height.

4. WCAG CONTRAST — gold #8B6914 on cream #F5F0E8 = 4.47:1, fails AA (4.5:1) at meta size.
   Vacation status "בחופשה · ..." must pass: darken gold to ~#7A5A10 (verify ≥4.5:1) OR
   render ≥18.66px bold. Apply to every gold-on-cream text at small sizes. Green #2e6853 (5.7)
   and muted #6B6860 (4.9) pass — unchanged.
</blockers>

<interface_engineering>
5. TOUCH TARGETS — actions row (שמירה/מעקב/שיתוף), FAQ chips, channel icons: visual size stays,
   hit-area ≥44×44pt via transparent padding. Annotate in spec.

6. STICKY BAR INTEGRATION — one mobile frame: StickyContactBar (existing useStickyBar behavior)
   appearing after the inline CTA card scrolls out. Confirm no conflict with section tab bar
   (stacking order: header > tab bar > content; sticky CTA bottom).

7. POST-LOGIN INTENT — implementation note on the auth popover: after successful sign-in,
   complete the original action (save/follow) automatically and return to the same scroll
   position. No dead-end at login screen.

8. TOOL ARTIFACT — remove "or browse files" text from the avatar placeholder slot (mockup-tool
   leak). Placeholder = initials avatar only.

9. MICROCOPY (locked defaults — override only if Sapir says so):
   - "סגור להזמנות" → "לא מקבל הזמנות כרגע"
   - Vacation: "בחופשה · חוזרים ב־3 באוגוסט" (full month name, not 3.8)

10. POPOVER A11Y — both popovers (מאומתת, auth): Esc closes, focus returns to trigger,
    bottom-sheet variant gets focus trap. aria-expanded already present — keep.
</interface_engineering>

<polish>
11. WEEKLY TABLE — "today" row highlight is computed (current day), not hardcoded ראשון.
    Annotate: highlight = font-weight, not color (avoid a third green).
12. INITIALS AVATAR — single letter: "נ" (never two letters in Hebrew).
</polish>

<deliverables>
1. Updated frames: desktop + mobile 375px, including the two NEW mobile frames (tab bar, sticky CTA)
2. Hours zone + header status shown together (blocker 2 proof)
3. Weekly hours table with corrected LTR ranges
4. Contrast note: final gold hex + measured ratio
5. One-line changelog per number (1-12) confirming applied
</deliverables>
```
