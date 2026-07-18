# Claude Design — Revision Round 1: ProducerDetail Refresh
<!-- המשך לכיוון 1 (שקט מדויק) שנבחר. הכיוון מאושר עקרונית — זהו סבב תיקונים אחד לפני מימוש. -->

```xml
<role>
Senior product designer, editorial sensibility, mobile-first, RTL Hebrew.
</role>

<context>
Direction 1 (Airbnb Quiet) approved in principle. This is revision round 1.
Keep everything not listed below exactly as mocked. Same brand_lock, same scope (4 zones).
</context>

<critical_missing_states>
Design the bad days, not just the good day. Add to the mockup:

1. STATUS — three states, one treatment (see status_indicator below):
   - פתוח להזמנות
   - סגור (currently unavailable)
   - בחופשה — עם תאריך חזרה: "בחופשה · חוזרים ב-3.8" (data exists: availability_state=on_vacation)
   Closed/vacation colors: stay inside brand palette (muted #6B6860 / gold #8B6914) — no new colors, no red without approval.

2. ZERO REVIEWS — no rating, no pull-quote:
   - Rating slot shows "חדש" instead (Airbnb pattern — "חדש" is the rating fallback, not another badge)
   - Pull-quote block hidden entirely
   - Meta line reflows cleanly without the rating group

3. LOGGED-OUT — שמירה/מעקב require auth:
   - Tap → prompt to sign in (spec the micro-flow: popover or redirect, your call, one screen)

4. OWNER CARD — missing-data states:
   - No photo: initials avatar (as mocked Z4)
   - No bio: card renders name + role + city only (compact variant)
   - Nothing at all: section hidden entirely — show all three variants

5. ADDRESS — if no street address: fall back to city only ("קצרין"), line never empty.
</critical_missing_states>

<status_indicator>
Replace the plain green dot. Propose 2-3 treatments, mock the best in all 3 states:
A. Google-style colored text, no dot — "פתוח להזמנות" in primary #2e6853 inside the meta line
B. Soft tinted chip — primary at ~10% bg, primary text, no dot
C. CTA-coupled line — status + expectation above the WhatsApp button ("פתוח להזמנות · בדרך כלל עונים תוך כמה שעות")
Criteria: quiet, editorial, readable at 375px, works for all 3 states.
</status_indicator>

<must_restore>
6. OPENING HOURS — "הגעה ומיקום" must include hours (existing OpeningHours component lives in this section per MEH-1146). Address + hours + map + nav buttons = one zone. Design collapsed/expanded hours (today's hours visible, tap to expand week).
7. BREADCRUMB — restore existing categorical breadcrumb: בית ‹ חלב וגבינות ‹ מחלבת עמק האלה. Do not redesign it.
</must_restore>

<fixes>
8. TYPO — "מיהמקור" → מהמקור (desktop corner).
9. WAZE/GOOGLE deep links (implementation note, keep visible in mockup annotations):
   - Waze: https://waze.com/ul?ll={lat},{lng}&navigate=yes (universal link, NOT waze://)
   - Google: https://maps.google.com/maps/dir/?api=1&destination={lat},{lng}
10. MOBILE SHARE — duplicate: ⤴ on hero AND שיתוף in actions row. Keep ONE — hero overlay (Airbnb pattern), drop from actions row on mobile. Desktop keeps actions row.
11. CHEVRONS RTL — all "forward" chevrons point LEFT (‹): "לכל הביקורות ‹", popover "איך אנחנו מאמתים? ‹".
12. VERIFIED POPOVER LINK — target: /about verification section (placeholder until content exists; flagged separately as content task).
</fixes>

<approved_microcopy>
13. Actions row: שמירה · מעקב · שיתוף ("מעקב" replaces "עדכונים" — action, not outcome).
14. Channel icons (globe/instagram/phone): icon-only OK. Required: aria-labels ("אתר הבית", "אינסטגרם", "טלפון"). Desktop phone tap → reveal number inline (no dialing on desktop).
</approved_microcopy>

<out_of_scope_reminder>
Owner bio/photo + street address = new DB fields. Design them fully here;
implementation ships as a separate HIGH-RISK chunk (schema). Do not annotate migration details in the mockup.
</out_of_scope_reminder>

<deliverables>
1. Updated mockup — mobile 375px + desktop, all states from critical_missing_states
2. Status indicator: chosen treatment shown in פתוח / סגור / בחופשה
3. Hours block collapsed + expanded
4. Owner card: 3 data variants
5. One-line changelog per fix number (1-14) confirming applied
</deliverables>
```
