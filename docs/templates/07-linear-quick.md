# 💬 Template 07 — Linear Quick Task (v2.0)

למשימה קטנה (<1 שעה). PR של 1-20 שורות. גרסה 2.0.

---

## 📋 מתי להשתמש

✅ Copy change ב-1-2 מקומות
✅ Token drift fix בקובץ אחד
✅ Typo / quick text addition
✅ Color/size change
✅ Placeholder replacement
✅ Single CSS class swap

❌ פיצ'ר → 06-linear-issue.md
❌ Bug עם investigation → 06 + template 03

---

## 🎯 מודל מומלץ

**Quick task = Sonnet 4.6 always.**

למה: localized scope, mechanical change. Opus 4.7 = overkill, מבזבז tokens על thinking שלא נחוץ.

Effort: `low` או `medium` — לא יותר.

---

## 🧱 מבנה מינימלי

```markdown
## מה
[משפט אחד — מה לעשות]

## איפה
- File: [path]
- Line: [number, אם ידוע]

## Model + Effort
- 🟢 Sonnet 4.6
- Effort: low

## Prompt לClaude Code

\```
Read .claude/rules/. Quick fix.

Branch: feature/meh-XX-[slug] off staging.
One PR. Build verify before push.

[Fix description in 2-3 lines]

Constraints:
- Single file: [path]
- Do not touch other files
- RTL: start-/end- only
\```

## DoD
- [ ] Change visible
- [ ] npm run build green
- [ ] preview URL
```

---

## 📝 דוגמה — MEH-100 About Page Photo

```markdown
## מה
החלף Leaf placeholder בתמונה אמיתית של ספיר ב-/about.

## איפה
- File: frontend/app/about/page.js
- Find: `<Leaf />` element

## Model + Effort
- 🟢 Sonnet 4.6
- Effort: low

## Prompt לClaude Code

\```
Read .claude/rules/. Quick fix.

Replace Leaf placeholder with real photo on /about page.

Cloudinary URL: [URL provided by Sapir]

Branch: feature/meh-100-about-photo off staging. One PR.

Implementation:
- Use next/image <Image>
- Round 200px container, primary border
- onError fallback to BotanicalSVG component
- alt="ספיר, מייסדת מהמקור"

Single file: frontend/app/about/page.js
Do not touch any other files.
\```

## DoD
- [ ] Real photo displayed
- [ ] Fallback works (test by breaking URL)
- [ ] npm run build green
- [ ] preview URL
```

---

## ⚡ ההבדל מ-template 06

| ממד | Quick (07) | Full (06) |
|---|---|---|
| זמן | <1 שעה | 1-10 שעות |
| שורות קוד | 1-20 | 20-500+ |
| Tests | לא חובה | חובה |
| Docs update | לא חובה | חובה |
| Design review | לא | כן (אם UI) |
| Model | Sonnet 4.6 | Opus 4.7 לרוב |
| Effort | low | high/xhigh |

---

## ⚠️ אזהרה — Scope creep detection

**אם תוך כדי quick task את מגלה זיזים → STOP.**

סימני אזהרה (לא באמת quick):
- "רגע, צריך גם לעדכן את X"
- "דרך אגב, Y גם שבור"
- "איך אני בודקת את זה?"
- Claude Code שואל יותר משאלה אחת לפני שמתחיל

→ סגרי את ה-quick task. פתחי 06 חדש. אל תגררי feature לתוך quick.

(זה היה אחראי להרבה PRs נשברים בעבר.)

---

## 🚨 Anti-patterns

❌ **Quick task ל-Opus 4.7.** ה-token cost לא מצדיק. Sonnet 4.6 מספיק.

❌ **DoD מורחב.** Quick = build + visible + preview. Don't add tests/docs.

❌ **לגעת ביותר מקובץ אחד.** אם אתה חייב — זה לא quick. עברי ל-06.

❌ **Prompt ארוך.** 5-10 שורות maksimum. אם זה ארוך — זה לא quick.

---

## ✅ Quick Task Pre-flight Checklist

- [ ] משימה באמת <1 שעה
- [ ] Fix ב-1-3 קבצים maksimum (1 עדיף)
- [ ] Prompt ב-5-10 שורות
- [ ] DoD: רק build + visible + preview
- [ ] Sonnet 4.6, effort low
- [ ] Branch from staging
```

---

## 📚 דוגמאות Quick Tasks

- **MEH-94** — Yellow badge → slate (1 line CSS)
- **MEH-40** — Hide neighbor section when empty (1 conditional)
- **MEH-75** — Chat cursor bug (1 className add)
- **MEH-100** — About page photo
- Copy: "החלף 'יצרן' ל'בית עסק' ב-Footer.jsx:45"

---

## 📚 מקורות

- Anthropic 2026: "Use low effort for speed-sensitive or simple tasks"
- Mehamakor scope-creep retrospectives
