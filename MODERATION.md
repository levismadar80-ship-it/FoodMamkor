# מהמקור — מערכת מודרציה למהמטבח של השכן
> קרא CLAUDE.md קודם. עדכן CLAUDE.md בסוף.

---

## הרקע — למה זה חשוב

סקציית "מהמטבח של השכן" מאפשרת לכל אחד לפרסם מוצל ביתי ללא אישור.
הסיכונים: ספאם, תוכן לא הולם, מוצרים מסוכנים, הונאות.
הפתרון: AI בדיקה מהירה + פרסום עם badge + אדמין רק למקרים קשים.

---

## הארכיטקטורה — Hybrid Moderation

```
משתמש מגיש טופס
       ↓
  Claude API בודק (2-3 שניות)
       ↓
  ┌────────────────────────────┐
  │  תוצאה: APPROVED           │ → פרסם מיידי ✅
  │  תוצאה: FLAGGED            │ → פרסם עם badge "בבדיקה" 🟡
  │  תוצאה: REJECTED           │ → חסום + הסבר למשתמש ❌
  └────────────────────────────┘
       ↓ (רק FLAGGED)
  אדמין רואה בדאשבורד → מאשר / מוחק
```

---

## שלב 1 — Claude API Moderation

### Backend endpoint חדש:
`POST /home-listings/validate`

```python
# backend/app/routers/home_listings.py

import anthropic

async def validate_listing_with_ai(listing_data: dict) -> dict:
    client = anthropic.Anthropic()
    
    prompt = f"""
אתה מודרטור תוכן לאתר מהמקור — פלטפורמה ישראלית לאוכל בריא וביתי.
בדוק את המודעה הבאה ותחזיר תשובה ב-JSON בלבד.

המודעה:
כותרת: {listing_data['title']}
תיאור: {listing_data['description']}
קטגוריה: {listing_data.get('category', '')}
מחיר: {listing_data.get('price', '')}

הקריטריונים שלנו — APPROVED אם:
✓ מוצר מזון ביתי / טיפוח טבעי לגיטימי
✓ תיאור ברור ואמיתי
✓ מחיר סביר (לא 0 ולא אלפי שקלים לכמות קטנה)
✓ אין טענות בריאות מוגזמות ("מרפא סרטן")

FLAGGED אם:
⚠ טענות בריאות מוגזמות
⚠ מחיר חשוד (גבוה מאוד ביחס לכמות)
⚠ תוכן לא ברור או חסר מידע
⚠ נראה כמו עסק גדול שמתחזה לביתי

REJECTED אם:
✗ מוצרים לא קשורים לאוכל/טיפוח (נשק, תרופות, אלכוהול ללא רישיון)
✗ ספאם או תוכן כפול ברור
✗ תוכן פוגעני או גזעני
✗ מוצרים מסוכנים (פטריות בר ללא זיהוי מקצועי, וכו')

החזר JSON בלבד, בלי טקסט נוסף:
{{
  "status": "APPROVED" | "FLAGGED" | "REJECTED",
  "reason": "הסבר קצר בעברית",
  "suggestion": "הצעה לשיפור אם FLAGGED (או null)"
}}
"""
    
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}]
    )
    
    import json
    return json.loads(message.content[0].text)


@router.post("/home-listings/validate")
async def validate_listing(listing: HomeListing):
    result = await validate_listing_with_ai(listing.dict())
    return result


@router.post("/home-listings")
async def create_listing(listing: HomeListing, user=Depends(get_current_user)):
    # בדיקת AI
    moderation = await validate_listing_with_ai(listing.dict())
    
    if moderation['status'] == 'REJECTED':
        raise HTTPException(
            status_code=400,
            detail={
                "error": "listing_rejected",
                "reason": moderation['reason']
            }
        )
    
    # שמור עם סטטוס מתאים
    listing.moderation_status = moderation['status']  # APPROVED / FLAGGED
    listing.moderation_reason = moderation.get('reason')
    
    db_listing = await save_listing(listing)
    return db_listing
```

### עדכון DB schema:
```sql
ALTER TABLE home_listings ADD COLUMN moderation_status text DEFAULT 'APPROVED';
-- ערכים: APPROVED | FLAGGED | REJECTED (לא נשמר, נחסם)
ALTER TABLE home_listings ADD COLUMN moderation_reason text;
ALTER TABLE home_listings ADD COLUMN moderation_suggestion text;
```

---

## שלב 2 — Frontend: בדיקה בזמן אמת

### בטופס פרסום — הוסף validation לפני submit:

```jsx
// components/HomeListing/PublishForm.jsx

const [checking, setChecking] = useState(false)
const [moderationResult, setModerationResult] = useState(null)

// בדיקה כשמשתמש עוצר להקליד (debounce 1.5 שניות)
const checkContent = useMemo(
  () => debounce(async (title, description) => {
    if (!title || title.length < 5) return
    setChecking(true)
    
    const res = await fetch('/api/home-listings/validate', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
      headers: { 'Content-Type': 'application/json' }
    })
    const result = await res.json()
    setModerationResult(result)
    setChecking(false)
  }, 1500),
  []
)

// הצג feedback בטופס:
{checking && (
  <div className="text-sm text-gray-500 flex items-center gap-2">
    <Spinner size={14} /> בודקת תוכן...
  </div>
)}

{moderationResult?.status === 'FLAGGED' && (
  <div style={{
    background: '#FFF9E6',
    border: '1px solid #F0C040',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
  }}>
    ⚠️ {moderationResult.reason}
    {moderationResult.suggestion && (
      <div style={{marginTop: 6, color: '#666'}}>
        💡 {moderationResult.suggestion}
      </div>
    )}
  </div>
)}

{/* כפתור submit — חסום רק אם REJECTED */}
<button
  type="submit"
  disabled={moderationResult?.status === 'REJECTED' || checking}
  style={{
    background: moderationResult?.status === 'REJECTED' ? '#ccc' : '#2e6853',
    color: 'white',
    // ...
  }}
>
  {moderationResult?.status === 'REJECTED' 
    ? 'לא ניתן לפרסם' 
    : 'פרסם מוצר'}
</button>

{moderationResult?.status === 'REJECTED' && (
  <div style={{
    background: '#FFF0F0',
    border: '1px solid #F04040',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    color: '#c00',
  }}>
    ❌ {moderationResult.reason}
    <div style={{marginTop: 8, color: '#666'}}>
      יש שאלות? <a href="/contact" style={{color:'#2e6853'}}>צרי קשר</a>
    </div>
  </div>
)}
```

---

## שלב 3 — תצוגה: Badge "בבדיקה"

```jsx
// בכרטיסיית מוצר ביתי:
{listing.moderation_status === 'FLAGGED' && (
  <span style={{
    background: '#FFF9E6',
    color: '#946A00',
    border: '1px solid #F0C040',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
  }}>
    🔍 בבדיקה
  </span>
)}

{listing.moderation_status === 'APPROVED' && listing.is_verified && (
  <span style={{
    background: '#EAF3DE',
    color: '#2e6853',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: 12,
  }}>
    ✅ מאומת
  </span>
)}
```

---

## שלב 4 — אדמין: רק מה שדורש תשומת לב

```
/admin/reports → טאב חדש: "מוצרים ביתיים"

טבלה מוצגת רק עם status=FLAGGED:
  | כותרת | מוכר | סיבת דגל | תאריך | פעולות |
  
כפתורי פעולה:
  ✅ אשר → moderation_status = APPROVED
  ❌ מחק → is_active = false + הודעה למוכר
  👁️ צפה → פתח את הדף

הודעה אוטומטית למוכר במחיקה (WhatsApp/מייל):
  "היי [שם], המוצר '[כותרת]' הוסר כי: [סיבה].
   לשאלות: mehamekor.co.il/contact"
```

---

## תוצאה הסופית — חווית משתמש

```
מוכר טוב:
  מקליד → בדיקה שקטה → "פרסם" ✅ → עולה מיד

מוכר עם תוכן בעייתי:
  מקליד → הצגת אזהרה → "תוכל לפרסם אבל יעבור בדיקה" 🟡
  → עולה עם badge "בבדיקה" → אדמין בודקת

מוכר עם תוכן אסור:
  מקליד → כפתור נחסם → הסבר ברור ❌
  → לא עולה בכלל
```

---

## עדכן CLAUDE.md:
```
עדכן CLAUDE.md:
- מודרציה מהמטבח של השכן: Claude API (validate endpoint) + Hybrid
- סטטוסים: APPROVED | FLAGGED | REJECTED
- DB: home_listings.moderation_status, moderation_reason
- endpoint חדש: POST /home-listings/validate
- אדמין: /admin/reports → טאב "מוצרים ביתיים" (רק FLAGGED)
- הודעה אוטומטית למוכר בהסרה
```
