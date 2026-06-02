# 💻 Template 02 — Claude Code Feature (v2.1)

לפיצ'ר חדש בקוד. **גרסה 2.1** מבוססת על Anthropic 2026 + Wharton 2025 + Schulhoff Prompt Report.

> **v2.1 change (2026-05-24, MEH-686 Phase δ step 15):** removed 4 references to `_migrate_columns()` (deleted in MEH-267, root cause of MEH-265 incident). Replaced with Alembic + ADR-003 + ADR-007 + `docs/MIGRATIONS.md` pointers. Alembic is sole schema authority per ADR-003.

-----

## 📋 מתי להשתמש

✅ פיצ'ר חדש שמשלב backend + frontend
✅ endpoint חדש + UI שמציג אותו
✅ טבלה חדשה ב-DB + CRUD שלה
✅ אינטגרציה חיצונית (Stripe, Twilio)

❌ עיצוב בלבד → 01-claude-design.md
❌ תיקון באג → 03-claude-code-bug.md
❌ refactor בלי פונקציונליות → 04-claude-code-refactor.md

-----

## 🎯 מודל מומלץ

|סוג פיצ'ר                     |מודל        |למה                              |
|------------------------------|------------|---------------------------------|
|Single-component CRUD         |🟢 Sonnet 4.6|routine, מולטי-step אבל לא מורכב |
|Backend + frontend coupled    |🟣 Opus 4.7  |multi-file context               |
|External integration (API חדש)|🟣 Opus 4.7  |architecture decisions           |
|Hebrew NLP / Search logic     |🟣 Opus 4.7  |reasoning-heavy                  |
|Auth / Security / Payment     |🟣 Opus 4.7  |high stakes, easy to miss vectors|

ראי `00-model-selection-guide.md` ל-decision flow.

-----

## 🧱 Prompt Structure (Opus 4.7 version — recommended)

```xml
Read .claude/rules/. Read HANDOFF.md. Read docs/DATA.md.

<role>
Engineer building MEH-XX on mehamakor.online.
Stack: Next.js + FastAPI + Postgres. RTL Hebrew, feminine voice.
</role>

<intent>
[משפט אחד — מה המשתמשת יכולה לעשות אחרי שזה נגמר. מנקודת מבטה.]
דוגמה: "בית עסק יכולה להוסיף שעות פעילות לעמוד שלה ולקוחות יראו אותם בכרטיס."
</intent>

<acceptance_criteria>
- [Outcome מדיד 1]
- [Outcome מדיד 2]
- pytest tests/test_[feature].py — all green
- npm run build — green
- preview URL sent for mobile testing
- HANDOFF.md updated
</acceptance_criteria>

<file_locations>
Backend: backend/app/routers/[X].py
Frontend: frontend/components/[Y].jsx, frontend/app/[page]/page.js
Tests: tests/test_[X].py
Migration: backend/alembic/versions/ (אם DB schema משתנה — Alembic only per ADR-003 + ADR-007; see docs/MIGRATIONS.md)
</file_locations>

<scope>
Touch only files listed above.
Do not touch: anything else without explicit ask.
Do not add new env vars without listing them and waiting for approval.
Do not add/remove DB columns without showing exact SQL + generating an Alembic revision (see docs/MIGRATIONS.md + ADR-003).
</scope>

<constraints>
- Branch: feature/meh-XX-[slug] off staging
- One PR per logical change
- RTL: never left-*/right-*/ml-*/mr-* — always start-*/end-*/ms-*/me-*
  (exceptions: eye toggles, carousel arrows, /map geographic positions; comment when used)
- Hebrew copy: feminine ("בית עסק" not "יצרן")
- Backend code/routes/DB: English
- Auth: JWT + Google OAuth (existing patterns in auth.py)
</constraints>

<examples>
[ONE concrete reference from the repo. Use file:line format.]

Example: "Similar pattern in backend/app/routers/producers.py:142-178 — 
POST endpoint with auth check + validation + slowapi rate limit. Mirror this structure."
</examples>

<confidence_calibration>
- File:line evidence required for any code claim.
- "I haven't verified X yet" > "X probably works."
- Stuck after 2 attempts → STOP, describe blocker, ask. No silent 3rd workaround.
- If a spec is ambiguous → ask before coding. Do not infer.
</confidence_calibration>

<over_engineering_guard>
- Minimal change scope. No new files unless required by spec above.
- No abstractions or "flexibility for future" not requested.
- Mirror existing patterns in the repo. Don't introduce new libraries.
- If you find yourself adding helper utilities → STOP and ask if needed.
</over_engineering_guard>

<verification_step>
Before declaring done:
1. Run pytest locally — paste output.
2. Run npm run build — confirm green.
3. List all files changed with one-line diff summary.
4. State any tradeoffs you made + why.
</verification_step>
```

-----

## 🧱 Prompt Structure (Sonnet 4.6 version)

זהה למבנה Opus, **אבל הוסיפי**:

```xml
<thinking_guidance>
This task involves multi-step reasoning. Think carefully through:
1. What changes in DB / backend / frontend?
2. What's the order of changes (DB first → backend → frontend → tests)?
3. What's the minimum test that proves it works?
4. What edge cases exist (missing field, network error, race condition)?
Think before coding. Output your plan first, wait for "go".
</thinking_guidance>
```

**ולמה:** Sonnet 4.6 לא חושב אדפטיבית כברירת מחדל. הוראת `<thinking_guidance>` עוזרת לאיכות.

ב-Opus 4.7 — **דלגי על זה.** xhigh = adaptive thinking פעיל אוטומטית.

-----

## 📊 דוגמה מלאה — MEH-103 Reviews System (Opus 4.7)

```xml
Read .claude/rules/. Read HANDOFF.md. Read docs/DATA.md.

<role>
Engineer building MEH-103 (Reviews system) on mehamakor.online.
Stack: Next.js + FastAPI + Postgres. RTL Hebrew, feminine.
</role>

<intent>
לקוחה שלחצה על WhatsApp של בית עסק יכולה אחר כך להשאיר ביקורת.
הביקורת רק מוצגת אם היא verified (יש לה הוכחה לקליק).
</intent>

<acceptance_criteria>
- POST /reviews — auth required, body: {producer_id, rating 1-5, comment?, click_token}
- Click token issued when WhatsApp link is opened (signed JWT, 24h TTL)
- GET /producers/{id}/reviews — public, only verified=true returned
- ReviewCard component shows: rating, comment, date, "verified" badge
- ProducerDetail page integrates reviews section after description
- pytest: happy path + invalid token + duplicate review (per producer per user)
- npm run build green
- Mobile preview tested
</acceptance_criteria>

<file_locations>
Backend NEW: backend/app/routers/reviews.py
Backend UPDATE: backend/app/main.py (add router only)
Migration NEW: backend/alembic/versions/[timestamp]_add_reviews_and_click_tokens.py (Alembic revision per ADR-003 + ADR-007; see docs/MIGRATIONS.md for generation steps)
Frontend NEW: frontend/components/ReviewCard.jsx, frontend/components/ReviewForm.jsx
Frontend UPDATE: frontend/app/producers/[slug]/page.js (integrate)
Tests NEW: backend/tests/test_reviews.py
</file_locations>

<scope>
Touch only files above.
DB schema changes require explicit approval before applying. Show exact SQL.
</scope>

<constraints>
- Branch: feature/meh-103-reviews-system off staging
- WhatsApp click_token: HS256, secret from existing JWT_SECRET
- Rate limit: 5 reviews per user per day (slowapi)
- RTL: start-*/end-* only
- Hebrew copy provided below
</constraints>

<hebrew_copy>
Empty state: "עדיין אין ביקורות. תהיי הראשונה."
Form label rating: "כמה כוכבים?"
Form label comment: "ספרי לנו על החוויה (אופציונלי)"
Submit button: "שלחי ביקורת"
Verified badge: "✓ ביקורת מאומתת"
</hebrew_copy>

<examples>
Auth pattern: backend/app/routers/auth.py:45-72 — get_current_user dependency.
Rate limit pattern: backend/app/routers/producers.py:101 — @limiter.limit decorator.
Migration pattern: backend/alembic/versions/ — examples of revision files (Alembic upgrade/downgrade pattern per docs/MIGRATIONS.md).
RTL component: frontend/components/ProducerCard.jsx — start-/end- usage.
</examples>

<confidence_calibration>
- File:line evidence required.
- Click token verification logic — show me the verify function before writing tests.
- If unsure about rate limit semantics → ask.
</confidence_calibration>

<over_engineering_guard>
- No reviews moderation system. No reply system. No upvotes. v1 only.
- Use existing patterns. No new libraries.
</over_engineering_guard>

<verification_step>
Before PR:
1. pytest backend/tests/test_reviews.py — paste output
2. npm run build — confirm
3. Manual flow: WhatsApp click → 24h later → submit review → see verified
4. Edge case: try submitting without click_token → expect 403
</verification_step>
```

-----

## 🚨 Anti-patterns

❌ **לא להוסיף `<thinking>` blocks ב-Opus 4.7 prompts.** xhigh = automatic.
❌ **לא לכתוב `<role>` של 5 שורות "expert with PhD".** Wharton 2025: לא עוזר factual recall.
❌ **לא לתת prompt עמום ולתקן אחר כך.** Multi-turn ambiguity מוריד איכות. Bundle הכל ב-turn 1.
❌ **לא לדלג על `<acceptance_criteria>`.** זה ההבדל בין "כן עבד" ל-"DoD מאומת".
❌ **לא לשכוח `<over_engineering_guard>`.** Opus 4.5/4.6 ידועים בלהוסיף קבצים מיותרים.
❌ **לא להציע עריכה של `_migrate_columns()` ב-`backend/app/main.py`** — נמחק ב-MEH-267 (PR #311), root cause של MEH-265 incident. כל schema change דרך Alembic revision (ADR-003 + ADR-007 + docs/MIGRATIONS.md).

-----

## ✅ Definition of Done (כולל)

- [ ] Build green: npm run build + pytest
- [ ] Preview URL sent
- [ ] Mobile tested
- [ ] CHANGELOG updated
- [ ] HANDOFF.md updated
- [ ] PR description includes acceptance_criteria checklist
- [ ] Branch from staging, not main

-----

## 📚 מקורות

- Anthropic Best Practices for Claude Code with Opus 4.7 (Apr 2026)
- Wharton 2025 "Playing Pretend" — אל תשתמשי ב-expert persona embellishment
- Schulhoff "Prompt Report" arXiv 2406.06608 — XML structure תקפה
- ADR-003 (Alembic sole schema authority) · ADR-007 (Expand-Contract pattern) · docs/MIGRATIONS.md (operational guide)
