# 📊 Template 08 — Linear Issue Examples (Model Recommendations)

10 issues אמיתיים מהbacklog של מהמקור — כל אחד עם המלצה מדויקת. גרסה 2.0 · אפריל 2026.

> v2.0 · 2026-05: founder name reconciliation per MEH-693

---

## 🎯 איך להשתמש

לפני שפותחת issue חדש ב-Linear:
1. מצאי את ה-row הכי דומה במטריצה למטה
2. השתמשי באותו model + effort + thinking
3. אם המשימה שלך לא דומה → ראי `00-model-selection-guide.md` decision flow

---

## 📋 Backlog Snapshot — אפריל 2026

| MEH-XX | כותרת | סוג | Model | Effort | Adaptive Thinking | למה הבחירה הזאת |
|---|---|---|---|---|---|---|
| **MEH-78** | Map opens on Golan instead of Tel Aviv | 🐛 Bug | 🟢 Sonnet 4.6 | high | **ON** | קובץ אחד (MapClient), אבל root cause לא ברור — adaptive thinking יעזור לdiagnose |
| **MEH-99** | Smart Search (Hebrew morphology) | ✨ Feature | 🟣 Opus 4.7 | xhigh | **ON** | Hebrew morphology = reasoning-heavy. Opus 4.7 + thinking הכרחי לnaming/categorization across name+category+city |
| **MEH-100** | About page real photo | 💬 Quick | 🟢 Sonnet 4.6 | low | OFF | Mechanical change בקובץ אחד. Thinking = רעש |
| **MEH-103** | Reviews system (verified) | ✨ Feature | 🟣 Opus 4.7 | xhigh | **ON** | Multi-layer (DB+JWT+2 endpoints+2 components). Security-sensitive |
| **MEH-122** | Map redesign (split view + bottom sheet) | 🎨 Design+Code | 🟣 Opus 4.7 | max | **ON** | Design taste + multi-file + vision (review screenshots). הכי מורכב במצב הנוכחי |
| **MEH-123** | Logo + Hero design (post Olive branch retire) | 🎨 Design | 🟣 Opus 4.7 | xhigh | **ON** | Logo = brand-level decision. Trade-offs, options-first protocol |
| **MEH-191** | Reset-password email bug | 🐛 Bug | 🟢 Sonnet 4.6 | high | OFF | אם MEH-331 base64 fix נפרס מרכזית — זה quick verify. אם לא — escalate ל-Opus |
| **MEH-296** | Multi-channel contact (WhatsApp/email/Insta/etc.) | ✨ Feature | 🟣 Opus 4.7 | xhigh | **ON** | Architecture decision (איזה primary, איך fallback, validation). Long-term implications |
| **MEH-329** | XSS sanitization sweep with bleach | 🔒 Security | 🟣 Opus 4.7 | max | **ON** | Security-critical. Easy to miss attack vectors. עלות הטעות גבוהה |
| **MEH-330** | Dependabot + npm/pip audit CI | 🔧 Refactor/CI | 🟢 Sonnet 4.6 | medium | OFF | Config files עם pattern ידוע. CI templates יש להם cookbooks |

---

## 🧠 הסבר ההמלצות לפי קטגוריה

### 🐛 Bugs

**Sonnet 4.6 + thinking ON** = הברירת מחדל לbugs לא טריוויאליים.
**Sonnet 4.6 + thinking OFF** = quick fix שצוין באישור (regression test, verified pattern).
**Opus 4.7 + thinking ON** = bug שלא נפתר אחרי 2 ניסיונות ב-Sonnet, או cross-file.

⚠️ **MEH-78 lesson:** אל תקפצי ישר ל-Opus לbug בקובץ יחיד. נסי Sonnet + thinking קודם — אם הוא לא מצא ב-2 turns, אז escalate.

### ✨ Features

**Sonnet 4.6** ל-CRUD יחיד / component יחיד / endpoint עם pattern ידוע (auth.py copy-paste).
**Opus 4.7** ל-multi-layer / security / architecture / Hebrew NLP.

⚠️ **MEH-103 lesson:** Reviews נראה "פשוט" אבל אחרי DB schema + JWT click_token + verification logic — זה Opus territory. אל תזלזלי בscope.

### 🎨 Design

**Opus 4.7 תמיד.** Design = taste + trade-offs.

⚠️ **MEH-123 lesson:** Logo decision נכשל ב-V1 (Olive branch retired). Options-first protocol מ-template 01 חובה — 4 directions לפני implementation.

### 🔒 Security / Critical

**Opus 4.7 + max effort + thinking ON.**

⚠️ **MEH-329 lesson:** Sapir אישרה "advised against Ultra for this" — זה אומר שלא max budget של Anthropic, אבל **כן** max effort (Anthropic-side). אל תבלבלי בין השניים.

### 🔧 Refactor / Quick

**Sonnet 4.6** ברוב המקרים. Thinking OFF אם הpattern ידוע (Dependabot config, CSS swap).

---

## 🚨 Edge Cases — לא ברור מה לבחור

### "זה bug אבל גם פיצ'ר"
דוגמה: "VerifyEmail לא עובד וגם צריך להוסיף resend button"
→ **הפרידי לשני issues.** Bug ב-Sonnet, Feature לפי scope.

### "זה quick אבל יש לי חשד שיש משהו עמוק"
דוגמה: "סתם להחליף מילה — אבל אולי יש עוד 5 מקומות"
→ **התחילי quick (Sonnet, OFF). אם מתגלה scope creep → STOP, פתחי 06.**

### "Sapir ביקשה Opus אבל זה נראה Sonnet"
→ **Pre-go scope-match check** (workflow.md rule). אם spec עבור Opus היה כי המשימה מורכבת — Sonnet יכול לפספס. אם spec היה כי Sapir רגיל — אפשר לרדת.

### "פיצ'ר חדש אבל יש pattern קיים"
דוגמה: עוד endpoint שדומה ל-/producers
→ **Sonnet 4.6 + ON.** Thinking יעזור להעתיק את הpattern נכון, לא לכל המקומות בעיוורון.

---

## 📊 דקדוק עלויות (Cost reality check)

לעבודה במהמקור, הסדר היחסי:

```
1 משימה ב-Sonnet 4.6 thinking OFF  ≈ 1 unit (זול)
1 משימה ב-Sonnet 4.6 thinking ON   ≈ 1.5-2 units
1 משימה ב-Opus 4.7 effort xhigh    ≈ 5-8 units
1 משימה ב-Opus 4.7 effort max      ≈ 10-15 units
```

**אצל Sapir (Claude Code Max plan):** Sonnet יש לה במעט בלתי-מוגבל. Opus יש cap. אסטרטגיה אופטימלית:
- 80% משימות → Sonnet 4.6 (לא לחיסכון, אלא כי זה הכלי הנכון)
- 20% משימות → Opus 4.7 (כי באמת צריך)
- אחוזים בודדים → Opus 4.7 max effort (MEH-329 / MEH-99 type)

---

## 🔄 איך לעדכן את הטבלה הזאת

כל פעם שאת סוגרת issue:
1. אם הבחירה הייתה נכונה → השאירי
2. אם המשימה דרשה escalate (Sonnet → Opus) → עדכני ב-row
3. אם Opus היה overkill → סמני "should have been Sonnet"

זה הופך את הטבלה לbase למשימות הבאות.

---

## 📚 Cross-references

- `00-model-selection-guide.md` — decision flow מלא + adaptive thinking
- `06-linear-issue.md` — full issue structure
- `07-linear-quick.md` — quick task < 1h
