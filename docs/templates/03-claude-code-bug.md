# 🐛 Template 03 — Claude Code Bug Fix (v2.0)

לתיקון באג. גרסה 2.0 — אפריל 2026, מבוססת על Anthropic 2026 + lessons from MEH-331/MEH-191/MEH-78.

---

## 📋 מתי להשתמש

✅ Bug ידוע + reproduction steps
✅ באג שדורש investigation (לא ברור מה השורש)
✅ Regression אחרי PR קודם
✅ Production incident

❌ Bug "אולי" / "לפעמים" בלי repro — קודם להעמיק ב-Skeptic Mode
❌ Quick typo fix → 07-linear-quick.md

---

## 🎯 מודל מומלץ

| סוג באג | מודל | למה |
|---|---|---|
| Single-file, root cause clear | 🟢 Sonnet 4.6 | localized, fast |
| Cross-file, non-obvious | 🟣 Opus 4.7 | reasoning-heavy investigation |
| Email/transport/encoding bugs | 🟣 Opus 4.7 | MEH-331 lesson — easy to miss vectors |
| Race condition / async timing | 🟣 Opus 4.7 | requires deep mental model |
| Bug שלא נפתר אחרי 2 ניסיונות ב-Sonnet | 🟣 Opus 4.7 | escalate, don't double-down |
| CSS / styling issue | 🟢 Sonnet 4.6 | visual + iteration-friendly |
| Security / auth bug | 🟣 Opus 4.7 | high stakes |
| Hebrew/RTL display bug | 🟢 Sonnet 4.6 | well-known patterns |

---

## 🧠 Critical: Diagnosis FIRST, fix SECOND

**הלקח מ-MEH-331 ו-MEH-352:** Claude Code נוטה לקפוץ ל-fix בלי root cause.
ה-prompt חייב לכפות שלב diagnosis מובחן.

---

## 🧱 Prompt Structure (Opus 4.7 — recommended for non-trivial bugs)

```xml
Read .claude/rules/. Read HANDOFF.md.

<role>
Engineer fixing a bug in mehamakor.online.
Stack: Next.js + FastAPI + Postgres. RTL Hebrew.
</role>

<bug>
[משפט אחד — מה לא עובד]
</bug>

<reproduction>
Steps:
1. [פעולה ספציפית]
2. [פעולה]
3. [פעולה]

Expected: [מה אמור לקרות]
Actual: [מה קורה בפועל]

Environment: [staging / production / local]
First seen: [תאריך]
Affected users: [scope]
</reproduction>

<evidence_so_far>
[paste any logs, error messages, screenshots refs]
- Railway logs (1-hour window): [paste relevant lines]
- Browser console: [errors]
- Network tab: [failed requests]
</evidence_so_far>

<diagnosis_phase>
BEFORE writing any fix code:

1. Identify the exact failure point — file:line.
2. State your hypothesis for root cause in 1-2 sentences.
3. List 2 alternative hypotheses you considered and why you ruled them out.
4. Specify what evidence would CONFIRM or REFUTE your hypothesis.
5. STOP. Wait for me to approve diagnosis before coding.

Forbidden: "It might be X" / "probably caused by Y" without file:line evidence.
</diagnosis_phase>

<fix_constraints>
- Minimal change. Only the failure point.
- Mirror existing patterns in the file.
- No refactoring "while we're here."
- If you find another bug → flag it, don't fix it.
</fix_constraints>

<acceptance_criteria>
- Repro steps no longer trigger the bug
- Existing tests still pass: pytest + npm run build
- Add ONE regression test covering this exact scenario
- Mobile manual test of repro flow
- preview URL sent
</acceptance_criteria>

<verification_step>
Before declaring done:
1. Run repro steps in preview — confirm fixed
2. Show me the new regression test (file:line)
3. Run full test suite — paste output
4. Check Railway logs for any new errors
5. State any side effects of the fix
</verification_step>

<branch>feature/meh-XX-fix-[short-description] off staging</branch>
```

---

## 🧱 Prompt Structure (Sonnet 4.6 — single-file, scope clear)

```xml
Read .claude/rules/. Read HANDOFF.md.

<role>Engineer fixing a localized bug in mehamakor.online.</role>

<bug>[1 sentence]</bug>

<reproduction>
[3-step repro]
Expected vs Actual.
</reproduction>

<scope>
Likely file: [path]
Likely lines: [range]
Do not touch other files.
</scope>

<thinking_guidance>
Walk through:
1. What's the code at the failure point doing?
2. What did the input look like vs what it expected?
3. What's the smallest fix?
Output your reasoning before patching.
</thinking_guidance>

<acceptance_criteria>
- Repro no longer fails
- One regression test added
- pytest + npm run build green
- preview URL
</acceptance_criteria>

<branch>feature/meh-XX-fix-[slug] off staging</branch>
```

---

## 📊 דוגמה מלאה — MEH-78 Map opens on Golan instead of Tel Aviv (Opus 4.7)

```xml
Read .claude/rules/. Read HANDOFF.md.

<role>
Engineer fixing a bug in /map page on mehamakor.online.
</role>

<bug>
Map page initial view opens on Golan/Syria area instead of Tel Aviv center.
</bug>

<reproduction>
Steps:
1. Open mehamakor.online/map (incognito, no location permission)
2. Wait for map to load

Expected: Map centered on Tel Aviv (~32.07, 34.78), zoom level showing major cities.
Actual: Map centered on Golan Heights (~33.0, 35.7), zoom level too high.

Environment: production
First seen: ~Mar 2026
Affected: all users without geolocation permission
</reproduction>

<evidence_so_far>
- No console errors visible
- MapClient.jsx is the central component
- Likely default coordinates issue or computed center bug
</evidence_so_far>

<diagnosis_phase>
BEFORE writing any fix:

1. Find where initial center is computed — file:line.
2. Identify if it's:
   (a) Hardcoded wrong coords
   (b) Computed from producers list (e.g., centroid that lands on outliers)
   (c) Browser locale fallback misfiring
3. State hypothesis with evidence (paste relevant code).
4. Rule out: bounds.fitBounds() vs setView() issue.
5. STOP and wait for approval.

If hypothesis is (b) — show me the centroid computation. We may need a different approach (e.g., "pre-defined country center" with optional zoom-to-fit).
</diagnosis_phase>

<fix_constraints>
- Minimal change. No map library swap.
- If centroid logic is removed, add Tel Aviv default + comment explaining why.
- Do not break user-location flow when permission granted.
</fix_constraints>

<acceptance_criteria>
- Map loads on Tel Aviv when no geolocation
- Map still respects user location when granted
- Zoom level reasonable (~9-10) for Israel overview
- Regression test: incognito → check map.getCenter() within Israel bounds
- preview URL on mobile
</acceptance_criteria>

<verification_step>
1. Repro in incognito on preview — confirm fix
2. Allow location → verify still works
3. Show diff — should be tiny
4. Mobile test in Safari + Chrome
</verification_step>

<branch>feature/meh-78-fix-map-default-center off staging</branch>
```

---

## 🛡️ Lessons embedded (don't repeat)

### MEH-331 lesson — Email transport bugs
פוטסט mocks `_send_*_email` ברמת router → לא תופס bugs ברמת transport.
**For email bugs:** Live Gmail "Show original" inspection mandatory before close.

### MEH-352 lesson — Claude Code's first diagnosis can be wrong
"Import models before create_all" hypothesis was partial. Real cause: no `create_all` existed.
**Always:** Demand file:line evidence. Don't accept first diagnosis.

### MEH-78 lesson — Default coordinates + computed centroid
Centroid math + outlier producers = bad default.
**For map/coord bugs:** Check both hardcoded defaults AND computed values.

---

## 🚨 Anti-patterns

❌ **לקפוץ ל-fix בלי diagnosis מאומת.**
❌ **לקבל את ה-diagnosis הראשון של Claude Code בלי file:line.**
❌ **"It probably works now" בלי לרוץ repro steps.**
❌ **לא להוסיף regression test.**
❌ **לתקן עוד באג "בדרך".** Document, separate ticket.
❌ **להריץ Opus 4.7 על באג טריוויאלי.** Sonnet 4.6 חזק מספיק.
❌ **להישאר ב-Sonnet אחרי 2 ניסיונות כושלים.** Escalate ל-Opus.

---

## ✅ Definition of Done

- [ ] Repro confirmed fixed
- [ ] Regression test added
- [ ] pytest + npm run build green
- [ ] Mobile manual test
- [ ] preview URL sent
- [ ] HANDOFF.md updated with root cause + fix one-liner
- [ ] No new errors in Railway logs (post-deploy 1h check)

---

## 📚 מקורות

- Anthropic Bug Finding with Opus 4.7 (+11pp recall vs 4.6)
- MEH-331 / MEH-352 / MEH-78 retrospectives in HANDOFF.md
- Skeptic Mode pattern (workflow.md)
