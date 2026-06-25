# 💬 Template 10 — Testimonial Intake → On-Brand Draft (v2.1)

המרת הודעת תודה/משוב גולמית (מבעלת עסק או מלקוחה) לטיוטת עדות מוכנה-לפרסום, נעולת-מותג. גרסה 2.1 — יוני 2026.

מקור: עדות = "עדות של אדם אמיתי, לא סלוגן שיווקי". הכלל המנחה — עובדים רק עם מה שבאמת קרה, בלי להמציא מספרים, ותמיד עם אישור הדובר/ת לפני פרסום.

---

## 📋 מתי להשתמש

✅ הגיעה הודעת תודה/משוב אמיתית (WhatsApp / מייל / DM) שרוצים להפוך לעדות באתר
✅ ניסוח attribution + framing סביב ציטוט קיים
✅ בדיקת readiness של עדות לפני פרסום (אמת · אישור · רישוי · voice)

❌ כתיבת עדות "מאפס" בלי מקור אמיתי → אסור. אין מקור = אין עדות.
❌ סקשן/קומפוננטת testimonials בקוד → 02-claude-code-feature.md (זה תוכן, לא UI)
❌ מחקר על *איך* להציג עדויות → 05-claude-research.md

---

## 🎯 מודל מומלץ

**Testimonial intake = Opus 4.7. Always.**

למה: כל טיוטה היא הכרעת voice (ADR-014 HYBRID) + שמירה על verbatim + שיפוט אמת/over-claim. Sonnet נוטה ל"להחליק" ניסוח ולשכתב את הדובר/ת — בדיוק מה שאסור כאן. Effort: medium · Adaptive Thinking: ON.

---

## 🛡️ 4 ה-Guardrails הקשיחים (אסור לעקוף — אף פעם)

1. **רק מה שבאמת קרה.** אפס מספרים מומצאים או "מעוגלים" (לא "עשרות פניות" אם הדובר/ת לא אמרה מספר). אם זה לא בהודעה — זה לא נכנס לטיוטה.
2. **הציטוט נשאר VERBATIM.** המילים של הדובר/ת לא משתכתבות כדי "להתאים" לכללי הקול. מותר *רק* לקצר לאורך — וכל קיצוץ מסומן ב-`[…]`. אסור לתקן דקדוק, להחליף מילה, או "לייפות".
3. **אישור לפני פרסום.** עדות לא עולה בלי אישור מפורש של הדובר/ת על הניסוח הסופי + על השימוש בשם/עסק/עיר. אין אישור → הטיוטה מסומנת `DRAFT — לא לפרסום`.
4. **עסקים מורשים בלבד.** ה-framing לא רומז על "אוכל ביתי" / שכנות מבשלות. תמיד בעלת עסק מורשה.

---

## 🗣️ Voice — ADR-014 HYBRID (לפי משטח)

| חלק בעדות | מי כותב | כלל קול |
| -- | -- | -- |
| **הציטוט עצמו** | הדובר/ת | **VERBATIM — פטור מכל כלל קול.** לא נוגעים. |
| **framing עריכתי** (משפט פתיחה/הקשר) | מהמקור | narrative editorial → **feminine מותר** (פנייה לקוראת: "תגלי"). brand-we ברבים ("בחרנו"). |
| **UI chrome** (כפתור/לינק סביב הסקשן) | מהמקור | **gerund/רבים** ("קראו עוד") — לא feminine. |
| **attribution** (שם · עסק · עיר) | מהמקור | עובדתי, ניטרלי. "בעלת עסק" / "בית עסק" — לא "יצרנית". |

**אסור בכל משטח באתר:** "יצרן"/"יצרנית" · "אוכל ביתי"/"שכנות מבשלות"/"מהמטבח של השכן" · "marketplace" · "מגזין" (פנימי בלבד). **אפס emoji בעדות עצמה** — editorial surface, Emoji LOCK v2. (אם בהודעה המקורית היה emoji דקורטיבי בסוף — הוא מילה? לא. מורידים אותו; המילים נשארות verbatim.)

---

## 🧱 Prompt Structure

```xml
<role>Editor turning one real message into a publish-ready, brand-locked testimonial draft for mehamakor.online.</role>

<intent>
Take the raw message below and produce a testimonial draft: a verbatim quote + attribution + optional editorial framing + a readiness checklist. Never invent, never reword the speaker.
</intent>

<input>
- Raw message (verbatim): "[paste exactly as received]"
- Speaker: [name | unknown]
- Business + city: [name, city | unknown]
- Licensed business: [yes | unknown]
- Consent to publish name/business: [confirmed | not yet]
</input>

<guardrails>
1. Only what the message actually says. No invented or rounded numbers/stats.
2. The quote stays VERBATIM. Trim for length only, mark cuts with [...]. Never fix grammar, swap a word, or "polish".
3. If consent = not yet -> output is marked "DRAFT — NOT FOR PUBLISH" + an approval step.
4. Licensed-business framing only. Never imply home-cooking.
</guardrails>

<voice>
- Quote: exempt from all voice rules (verbatim).
- Editorial framing (intro/context line): ADR-014 -> feminine allowed when addressing the reader; brand-we plural.
- Any UI chrome (button/link): gerund/plural, never feminine.
- Attribution: "בעלת עסק" / "בית עסק" — never "יצרנית".
- Forbidden anywhere on site: "יצרן"/"יצרנית", "אוכל ביתי"/"שכנות מבשלות"/"מהמטבח של השכן", "marketplace", "מגזין".
- Zero emoji in the testimonial copy (Emoji LOCK v2). Strip decorative emoji from the source; keep the words.
</voice>

<output_format>
1. ציטוט (verbatim, trimmed only; cuts marked [...])
2. attribution — שם · בית עסק · עיר   (only if consent = confirmed; else placeholder + flag)
3. framing עריכתי (אופציונלי, משפט אחד; HYBRID; only if it adds — don't pad)
4. Readiness checklist — אמת? · אפס מספרים מומצאים? · verbatim? · אישור? · עסק מורשה? · 0 emoji? · 0 forbidden words?
5. אם משהו חסר (שם/אישור/רישוי) — לסמן במפורש, לא להמציא.
</output_format>

<confidence_calibration>
When the message is too thin to make a real testimonial -> say so, don't inflate it. When consent/licence is unknown -> flag, never assume. When unsure if a phrase is the speaker's word or your paraphrase -> keep the speaker's.
</confidence_calibration>

<verification_step>
1. Re-read source: every word in the quote appears in the source (verbatim check).
2. No number/stat in the draft that isn't in the source.
3. grep the draft: no "יצרן", no "אוכל ביתי", no "marketplace", no emoji.
4. Consent state correctly reflected (DRAFT flag if not confirmed).
</verification_step>
```

---

## 📊 דוגמה — הודעת WhatsApp מבעלת עסק

**Input:**

```
Raw message: "ספיר היי! רק רציתי להגיד תודה ענקית. מאז שהעמוד שלי עלה אצלכם קיבלתי פניות מאנשים שבכלל לא הכירו אותי. סוף סוף מישהו מבין מה אני עושה ❤️"
Speaker: דנה
Business + city: מאפיית מחמצת קטנה, כרמיאל
Licensed: yes
Consent: not yet
```

**Output:**

> `DRAFT — לא לפרסום` (חסר אישור על הניסוח + השם)
>
> **ציטוט (verbatim):**
> „מאז שהעמוד שלי עלה אצלכם קיבלתי פניות מאנשים שבכלל לא הכירו אותי. סוף סוף מישהו מבין מה אני עושה."
> *(הורד ה-❤️ הדקורטיבי — Emoji LOCK; המילים verbatim. "תודה ענקית" נחתך כ-framing, לא חלק מהעדות.)*
>
> **attribution (בכפוף לאישור):** דנה · בית עסק · כרמיאל
> *(אם דנה מאשרת שם מלא/שם העסק — להחליף. בלי אישור: "בעלת עסק מכרמיאל".)*
>
> **framing עריכתי (אופציונלי, HYBRID — brand-we):**
> „פנייה ראשונה ממישהי שלא הכירה את העסק — זה בדיוק הרגע שבשבילו בנינו את מהמקור."
>
> **Readiness:** אמת ✓ · אפס מספרים מומצאים ✓ · verbatim ✓ · אישור ✗ (לקבל מדנה) · עסק מורשה ✓ · 0 emoji ✓ · 0 forbidden ✓

**הצעד הבא:** לשלוח לדנה את הניסוח → "אפשר לפרסם ככה, עם השם והעיר?" → רק אחרי "כן" מורידים את ה-`DRAFT`.

---

## 🚨 Anti-patterns

❌ **להמציא מספר.** "עשרות פניות" כשנאמר רק "פניות" — over-claim, פוגע באמון ובאמת.
❌ **לשכתב את הדובר/ת.** "תיקנתי לה דקדוק" = כבר לא verbatim, כבר לא עדות.
❌ **לפרסם בלי אישור.** גם אם ההודעה חיובית — אין אישור, אין פרסום.
❌ **framing שמרגיש סלוגן.** אם המשפט נשמע כמו פרסומת — להוריד אותו. עדיף ציטוט עירום.
❌ **"יצרנית" / רמז ל"אוכל ביתי".** הפרה של brand LOCK.
❌ **emoji בעדות.** editorial surface = 0 emoji.

---

## ✅ Definition of Done (Testimonial)

- [ ] ציטוט verbatim (קיצוץ מסומן ב-`[…]` בלבד)
- [ ] אפס מספרים/טענות שאינם במקור
- [ ] attribution רק עם consent (אחרת placeholder + flag)
- [ ] framing HYBRID נכון (או הושמט במכוון)
- [ ] 0 emoji · 0 forbidden words
- [ ] מצב אישור משתקף נכון (DRAFT אם אין)
- [ ] אם נכנס לאתר → תיעוד ב-COPY_BANK (סקשן Testimonials)

---

## 📚 מקורות

* ADR-014 — Voice rules (Hebrew Hybrid). BRAND.md §4 summary.
* BRAND.md §3 (Strategic LOCKs) + §7 (forbidden phrasings) · Emoji LOCK v2 (MEH-657).
* COPY_BANK §2 (trust signals) — יעד התיעוד לעדויות שעולות לאתר.
* DNA: "magazine, not marketplace" · licensed businesses only · manual approval.
