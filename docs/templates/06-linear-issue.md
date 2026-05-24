# 📋 Template 06 — Linear Issue (v2.0)

למשימה מלאה ב-Linear (1-10 שעות). גרסה 2.0 — אפריל 2026.

---

## 📋 מתי להשתמש

✅ פיצ'ר שדורש 2+ שעות
✅ Bug שצריך investigation + fix + test
✅ Design work עם sessions
✅ כל משימה שתיכנס ל-Cycle

❌ משימה קטנה (<1 שעה) → 07-linear-quick.md
❌ Meta-task → comment ב-HANDOFF

---

## 🎯 איזה מודל מתאים — מציינים בתיאור

**חדש בגרסה 2:** כל issue ב-Linear מציין **explicit model recommendation**:

```
**Model:** 🟢 Sonnet 4.6 [או] 🟣 Opus 4.7
**Effort:** medium / high / xhigh / max
```

זה לא "ניחוש" — Claude Code (Smadar) רואה את ההמלצה לפני שמתחילה את המשימה.
ראי `00-model-selection-guide.md` ל-decision flow.

---

## 🧱 מבנה Linear Issue

### כותרת (Title)

`[emoji] [פעולה] — [subject ספציפי]`

טוב:
- ✅ 🗺️ Map page redesign — split view + bottom sheet
- ✅ 🐛 Verify-email fix — base64 Content-Transfer-Encoding for Resend
- ✅ ✨ Smart Search — Hebrew morphology across name + category + city

רע:
- ❌ Map improvements (כללי)
- ❌ Fix the bug (איזה?)
- ❌ עדכונים (לא מוצא אחרי חודש)

### עדיפות (Priority)

```
1 = Urgent   — אתר שבור, השקה חסומה
2 = High     — גדל המרה/אמון, חוסם עבודה אחרת
3 = Medium   — שיפור רצוי, לא חוסם
4 = Low      — nice to have, v2+
```

### Description Structure

```markdown
## מטרה
[1-2 משפטים — למה זה חשוב, למי זה עוזר]

---

## הקשר / הבעיה (אם רלוונטי)
[מה לא עובד היום, עם דוגמאות ספציפיות]

---

## Model + Effort + Thinking
- **Model:** 🟢 Sonnet 4.6 [או] 🟣 Opus 4.7
- **Effort:** medium / high / xhigh / max
- **Adaptive Thinking:** ON / OFF (ראי 00-model-selection-guide.md)
- **Reasoning:** [1-line — למה הבחירה הזאת]

---

## Prompt לClaude [Code/Design]

\```xml
[ה-prompt המלא מ-template 01/02/03/04 — מותאם למודל הנבחר]
\```

---

## Definition of Done
- [ ] [בדיקה 1 מדידה — observable outcome]
- [ ] [בדיקה 2 מדידה]
- [ ] build ירוק (npm run build + pytest)
- [ ] preview URL נשלח
- [ ] נבדק בנייד (iOS Safari + Chrome)
- [ ] CHANGELOG עודכן (אם שינוי משמעותי)
- [ ] HANDOFF.md עודכן

---

## Branch
`feature/meh-XX-[short-description]` off staging

---

## תלויות
- MEH-XX ([title]) — [Done ✅ / In Progress / Blocked]
- MEH-YY ([title]) — [...]

---

## קשורים (Related, not blocking)
- MEH-ZZ — [one-liner why related]

---

## הקשר נוסף (אופציונלי)
[screenshots, links to design files, related conversations]
```

---

## 🎯 כללים ברזל (מ-CLAUDE.md)

### Rule 14 — Linear Issue Structure

כל issue חייב לכלול:
1. **Title** — emoji + action verb + subject
2. **Description** — מטרה + Model/Effort + prompt + DoD + branch
3. **Priority** — 1-4 מוגדר
4. **Branch** — `feature/meh-XX-*` format

### Rule — Description = Source of Truth

**אסור comments אחרי שמשהו השתנה. תמיד לעדכן את ה-description.**

- ❌ comment: "דרך אגב, תוסיף גם X"
- ✅ edit description → הוסיפי X ב-spec

### Rule — Pre-go scope-match check (חדש, מ-MEH-342)

לפני אישור "go" על plan שמתייחס ל-Linear issue:
1. Scope-match plan against live Linear description
2. Surface gaps explicitly
3. Never assume scope reduction is implicit

---

## 📝 דוגמה מלאה — MEH-103 Reviews System

```markdown
## מטרה
לאפשר לקוחות שיצרו קשר דרך WhatsApp להשאיר ביקורות מאומתות.
מחזק trust signal לפני שהlead הופך ללקוחה.

---

## הבעיה
כיום אין trust signal חברתי. לקוחה חדשה רואה רק תיאור של בית עסק וצריכה לסמוך עיוור.
תחרות (Wolt) מציגה דירוגים → אנחנו נראים פחות אמינים.

**ברירת מחדל של רע:**
- Conversion ל-WhatsApp נמוכה (~3.5% מתוך מבקרים בעמוד producer)
- אין דרך לבית עסק להציג social proof
- Reviews מזויפים (Google) פוגעים בטראסט הכללי לתחום

---

## Model + Effort + Thinking
- **Model:** 🟣 Opus 4.7
- **Effort:** xhigh
- **Adaptive Thinking:** ON
- **Reasoning:** Multi-layer feature (DB schema + JWT click_token + 2 endpoints + 2 components + integration). Security-sensitive (verification logic). Worth Opus + thinking for trade-off reasoning.

---

## Prompt לClaude Code

\```xml
Read .claude/rules/. Read HANDOFF.md. Read docs/DATA.md.

<role>Engineer building MEH-103 (Reviews) on mehamakor.online.</role>

<intent>
לקוחה שלחצה על WhatsApp של בית עסק יכולה אחר כך להשאיר ביקורת.
הביקורת מוצגת רק אם היא verified (יש לה click_token תקף).
</intent>

<acceptance_criteria>
- POST /reviews — auth, body: {producer_id, rating 1-5, comment?, click_token}
- click_token issued on WhatsApp open (signed JWT, 24h TTL, single-use)
- GET /producers/{id}/reviews — public, only verified=true
- ReviewCard component (rating, comment, date, badge)
- ProducerDetail integration (after description, before similar_producers)
- pytest: happy path + invalid token + duplicate + expired token
- npm run build + mobile preview
</acceptance_criteria>

<file_locations>
Backend NEW: backend/app/routers/reviews.py
Backend UPDATE: backend/app/main.py (add router only)
Migration NEW: backend/alembic/versions/[timestamp]_add_reviews_and_click_tokens.py (Alembic revision per ADR-003 + ADR-007; see docs/MIGRATIONS.md for generation steps)
Frontend NEW: frontend/components/ReviewCard.jsx, ReviewForm.jsx
Frontend UPDATE: frontend/app/producers/[slug]/page.js
Tests NEW: backend/tests/test_reviews.py
</file_locations>

<scope>
Touch only files above. DB schema requires explicit approval (show SQL).
</scope>

<constraints>
- Branch: feature/meh-103-reviews-system off staging
- click_token: HS256, secret = JWT_SECRET (existing)
- Rate limit: 5 reviews per user per day (slowapi)
- RTL: start-/end- only
- Hebrew copy: provided below
</constraints>

<hebrew_copy>
Empty: "עדיין אין ביקורות. תהיי הראשונה."
Form rating: "כמה כוכבים?"
Form comment: "ספרי לנו על החוויה (אופציונלי)"
Submit: "שלחי ביקורת"
Verified badge: "✓ ביקורת מאומתת"
</hebrew_copy>

<examples>
Auth pattern: backend/app/routers/auth.py:45-72
Rate limit: backend/app/routers/producers.py:101
Migration pattern: backend/alembic/versions/ — examples of revision files (Alembic upgrade/downgrade pattern per docs/MIGRATIONS.md).
RTL: frontend/components/ProducerCard.jsx
</examples>

<confidence_calibration>
- File:line evidence required
- click_token verify logic — show me before tests
- Stuck after 2 attempts → STOP, ask
</confidence_calibration>

<over_engineering_guard>
v1: no moderation, no replies, no upvotes. Use existing patterns.
</over_engineering_guard>

<verification_step>
1. pytest backend/tests/test_reviews.py (paste output)
2. npm run build (confirm)
3. Manual: WhatsApp click → submit review → see verified badge
4. Edge case: submit without click_token → 403
</verification_step>
\```

---

## Definition of Done
- [ ] Backend: 2 endpoints + JWT click_token + migration tested
- [ ] Frontend: ReviewCard + ReviewForm + integration in /producers/[slug]
- [ ] Tests: 4 scenarios green
- [ ] click_token security review (24h TTL + single-use enforced)
- [ ] Hebrew copy matches brand voice
- [ ] Mobile preview: full flow tested on iOS Safari
- [ ] preview URL sent
- [ ] CHANGELOG updated
- [ ] HANDOFF.md updated
- [ ] PR description includes acceptance_criteria checklist

---

## Branch
`feature/meh-103-reviews-system` off staging

---

## תלויות
- MEH-XX (WhatsApp click tracking) — Done ✅ (must be — issues click_token)

---

## קשורים
- MEH-296 (multi-channel contact) — when shipped, click_tokens for other channels too
- MEH-329 (XSS) — review comments need sanitization (bleach)
```

---

## 🚨 Anti-patterns

❌ **Issue בלי model/effort** — Claude Code לא יודעת לבחור אוטומטית.

❌ **Prompt בלי file_locations** — Opus 4.7 literal interpretation, ה-context הזה קריטי.

❌ **DoD ללא observable outcomes** — "feature works" ≠ DoD. צריך bullet points מדידים.

❌ **תלויות שלא מצוינות** — Claude Code יתחיל בלי ההקשר הקריטי.

❌ **Comments במקום description edits** — נשבר ה-source-of-truth principle.

❌ **Hebrew copy ב-comments** — שמרי ב-description הראשי.

---

## ✅ Issue Quality Checklist

- [ ] Title: emoji + verb + subject (ספציפי)
- [ ] Priority: 1-4 מוגדר
- [ ] Model + Effort + reasoning
- [ ] Prompt: complete, ready to paste
- [ ] DoD: 5+ observable outcomes
- [ ] Branch name: feature/meh-XX-*
- [ ] Dependencies listed (Done/In Progress/Blocked)
- [ ] Hebrew copy in description, not comments

---

## 📚 מקורות

- Anthropic 2026: "intent, constraints, acceptance criteria, and relevant file locations" (Opus 4.7 docs)
- MEH-342 retrospective — pre-go scope-match rule
- Mehamakor Linear conventions (this template)
