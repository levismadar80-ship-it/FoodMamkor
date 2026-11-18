# צ'אט

**מה הוא עושה.** עוזרת באתר שעונה על שאלות על בתי עסק, קבוצות רכישה ושקיות. היא מרחפת בפינה; ב-`/map` היא כבויה לפי pathname כדי לא להתנגש בפקדי המפה.

**Routes**
* אין route משלו — הווידג'ט מרונדר בתוך ה-layout.

**קבצים מרכזיים**
* `frontend/components/ChatWidget.jsx` — ‏z-index דרך inline style, ולכן grep על `z-<name>` לבדו מפספס אותו.
* `backend/app/routers/chat.py` — הלקוח של Anthropic נבנה תמיד עם `http_client=httpx.Client()`.

**Flags.** אין. בלי `ANTHROPIC_API_KEY` הצ'אט מחזיר הודעת «לא זמין» בעברית ולא קורס.

**טסטים**
* `tests/test_meh3004_chat_group_buys_rescue.py`
* `frontend/e2e/flows/23-ai-artifact-probe.spec.ts`

**מזהי רישום שזה מכסה.** אין — הצ'אט אינו כלי של בית העסק.
