**התשובה:** אצלנו כבר יש את רוב מה שחברות גדולות עושות (ADR, docs-as-code, CODEOWNERS, שומרי CI על מסמכים, קובץ CLAUDE.md לכל תיקייה). מה שחסר הוא לא עוד מסמך אלא **בעלות לפי תחום** ו**בדיקה אוטומטית שמסמך תואם לקוד** במקומות שבהם זה אפשרי. ההמלצה: לצמצם, לא להוסיף.

# ידע על הקוד: איך שומרים אותו עדכני — השוואה

> **דוח מחקר בלבד.** שום קובץ, הגדרה או כלל לא שונו. ההחלטות בסוף הן של ספיר
> ([.claude/rules/decisions.md](../../.claude/rules/decisions.md)).
> נכתב 17/11/2026 מול `origin/staging` ‏(`e43e137`).

---

## 1. מה עושות חברות גדולות (עם מקורות)

| שיטה | מה זה | מי עושה | מקור |
|---|---|---|---|
| **ADR** | רשומה קצרה לכל החלטה ארכיטקטונית: הקשר, החלטה, השלכות. לא עורכים, מחליפים ב-ADR חדש. | Nygard (2011), ‏ThoughtWorks Radar «Adopt», ‏AWS, ‏GOV.UK | [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) · [adr.github.io](https://adr.github.io/) · [MADR](https://adr.github.io/madr/) · [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/welcome.html) |
| **Docs-as-code** | המסמכים בריפו, באותו PR כמו הקוד, עם ריוויו ו-CI. | Google (g3doc), ‏GitLab, ‏GOV.UK | [Write the Docs](https://www.writethedocs.org/guide/docs-as-code/) · [Software Engineering at Google, פרק 10](https://abseil.io/resources/swe-book/html/ch10.html) |
| **בעלות על מסמך** | לכל מסמך יש בעלים; מסמך בלי בעלים מתיישן. Google מצמידה «freshness date» ובעלים לכל דף. | Google | [SWE at Google פרק 10](https://abseil.io/resources/swe-book/html/ch10.html) |
| **CODEOWNERS** | קובץ שממפה נתיב → אחראי. עם כלל ענף «Require review from Code Owners», שינוי בנתיב לא נכנס בלי אישור שלו. | GitHub | [GitHub Docs: About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) |
| **דפי מערכת (catalog)** | קובץ קטן ליד כל שירות (`catalog-info.yaml`) שאומר מה הוא, מי הבעלים, ממה הוא תלוי; פורטל מרכז אותם. | Spotify Backstage | [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/) · [TechDocs](https://backstage.io/docs/features/techdocs/) |
| **סוגי מסמכים** | להפריד tutorial / how-to / reference / explanation; כל סוג מתיישן בקצב אחר. | Canonical, ‏Django, ‏Cloudflare | [Diátaxis](https://diataxis.fr/) |
| **קובץ הנחיות לסוכני AI** | `AGENTS.md` / `CLAUDE.md` בשורש ובתיקיות, נטען אוטומטית. | OpenAI, ‏Anthropic, ‏מאות ריפוים | [agents.md](https://agents.md/) · [Claude Code memory](https://code.claude.com/docs/en/memory) |
| **מסמך שנוצר מהקוד** | reference שנגזר אוטומטית (OpenAPI, סכמת DB) במקום לכתוב ביד. | כמעט כולם | [OpenAPI](https://spec.openapis.org/oas/latest.html) |

המכנה המשותף אצל כולן: **מסמך שאיש לא מחזיק ושאף בדיקה לא קוראת — מתיישן.** הכלים
שונים, העיקרון אחד: כמה שפחות טקסט ידני, וכל טקסט ידני עם בעלים ותאריך.

## 2. מה יש אצלנו (נבדק בקוד)

| שיטה | אצלנו | ראיה |
|---|---|---|
| ADR | **יש, 42** + אינדקס + כלל «לא עורכים ADR מאושר» | `docs/decisions/` (ADR-001…ADR-042), `docs/decisions/README.md:13-16` |
| שומר שציטוט ADR נכון | **יש** | `scripts/checks/adr-citation-guard.sh` |
| Docs-as-code | **יש**: 402 קובצי md בריפו, 57 בשורש `docs/` | `find docs -name "*.md" \| wc -l` |
| «בית אחד לכל עובדה» | **יש** כ-ADR | [ADR-035](../decisions/ADR-035-one-home-per-fact.md) |
| תאריך ריענון | **יש, אזהרה בלבד**, על 3 מסמכים | `scripts/checks/doc-freshness-guard.sh:4-7` (CONTEXT, BRAND, PROJECT_INSTRUCTIONS; 120 יום) |
| CODEOWNERS | **יש, בעלים אחד לכל דבר** | `.github/CODEOWNERS:3` (`* @levismadar80-ship-it`), ‏`:6-7` (`.github/`, ‏`.claude/`) |
| קבצי הנחיות לסוכן | **יש, 5 CLAUDE.md** + 16 קובצי `.claude/rules/` | `./CLAUDE.md`, `frontend/components/CLAUDE.md`, `frontend/e2e/CLAUDE.md`, `tests/CLAUDE.md`, `backend/app/routers/CLAUDE.md` |
| מפת ריפו | **יש** | `docs/ARCHITECTURE.md` (79 שורות) |
| דיאגרמות | **יש, 3** | `.ai/diagrams/{api-routes,auth-flow,db-schema}.md` |
| מסמך מהקוד | **חלקי**: מניפסט OpenAPI נבדק ב-CI; ‏`docs/DATA.md` נכתב ביד | `scripts/checks/openapi-codegen-drift-guard.sh`, ‏`scripts/checks/api-docs-route-guard.sh` |
| «עדכנת את המסמכים?» בריוויו | **יש בכלל**, לא אכיף | `.claude/rules/testing.md` כלל 5a (MEH-3192: «אין שומר שיכול לראות את זה») |
| כללים לא נעלמים | **יש** | `scripts/checks/rules-inventory-guard.sh` |

## 3. הפערים (מה נבדק ומה הוסק)

1. **בעלים אחד לכל דבר = בעלות לא אומרת כלום.** כשהמייסדת היא גם הבעלים של כל
   נתיב, CODEOWNERS לא מסנן ריוויו; הערך היחיד שלו כאן הוא ההגנה על `.github/` ו-`.claude/`
   (MEH-1915). *נבדק:* הקובץ. *הוסק:* שאין דרך להשתמש בו ל«מי אחראי על איזה מסמך» בלי עוד אנשים.
2. **תאריך ריענון רק על 3 מסמכים מתוך 402.** `DATA.md`, ‏`SECURITY.md`, ‏`DEPLOYMENT.md`
   ו-`ARCHITECTURE.md` לא נבדקים. *נבדק:* ראש הסקריפט. *הוסק:* הם המועמדים הראשונים
   להתיישן, כי הקוד שהם מתארים משתנה כל יום.
3. **`DATA.md` כתוב ביד מול 50 routers.** זה בדיוק סוג המסמך שחברות גדולות מייצרות מהקוד.
   *נבדק:* `ls backend/app/routers | wc -l` → 50. *לא נבדק:* כמה מ-`DATA.md` שגוי היום.
4. **הרבה מסמכים = עלות קריאה.** 402 קבצים + HANDOFF של 1,224 שורות. ADR-035 כבר מזהה
   את זה (אורך הקשר מוריד הצלחת סוכנים). *הוסק:* כל מסמך חדש מוסיף עלות לכל session.

## 4. אפשרויות

**אפשרות א — להשאיר כמו שזה**
- בעד: הכיסוי כבר רחב מכל מה שחברה בגודל הזה עושה; יש שומרים אמיתיים (ADR, כללים,
  OpenAPI). כל שינוי עולה זמן של ספיר, וזה המשאב הנדיר.
- נגד: `DATA.md` ו-`ARCHITECTURE.md` ימשיכו להתיישן בשקט.

**אפשרות ב — להרחיב את שומר הרענון לעוד 4–6 מסמכים (אזהרה בלבד)**
- בעד: שינוי של שורה ברשימה בסקריפט קיים; מתריע לפני שמסמך מטעה סוכן. זה מה ש-Google
  עושה עם freshness date.
- נגד: אזהרה שמופיעה בכל PR מתרגלים להתעלם ממנה; תאריך לא אומר שהתוכן נכון.

**אפשרות ג — לייצר את רשימת ה-API ב-`DATA.md` מה-OpenAPI**
- בעד: מבטל מחלקה שלמה של סטייה (המסמך הוא תוצר, לא טקסט); המניפסט כבר קיים ונבדק.
- נגד: עבודה של כמה שעות; החלקים ההסבריים ב-`DATA.md` עדיין ידניים.

**אפשרות ד — דפי מערכת בסגנון Backstage**
- בעד: מבנה אחיד לכל תחום (הזמנות, סלי הפתעה, קבוצות רכישה): מה זה, איפה הקוד, מי
  השומר, איזה ADR.
- נגד: ב-repo אחד עם מפתחת אחת זו שכבה נוספת של מסמכים לתחזק — בדיוק מה ש-ADR-035
  מזהיר ממנו. Backstage נבנה לארגון עם מאות שירותים.

**אפשרות ה — CODEOWNERS לפי תחום**
- בעד: יציב כשיצטרף אדם שני; מאפשר «Require review from Code Owners» לתחומים רגישים.
- נגד: היום יש בעלים אחד; אין מה למפות. ערך אפס עד שיש עוד אדם.

## 5. המלצה, לפי סדר

| # | מה | עלות | אבטחה | מתי |
|---|---|---|---|---|
| 1 | **ב** — להוסיף ל-`doc-freshness-guard.sh` את `DATA.md`, ‏`ARCHITECTURE.md`, ‏`SECURITY.md`, ‏`DEPLOYMENT.md` | ~30 דק', GREEN | אין | עכשיו |
| 2 | **ג** — רשימת ה-endpoints ב-`DATA.md` כתוצר של OpenAPI | 2–4 שעות, GREEN | אין (קריאה בלבד) | אחרי ההשקה |
| 3 | **א** לכל השאר — לא להוסיף מסמכים או פורטל | 0 | — | — |
| — | **ה** רק כשמצטרף אדם שני; **ד** לא | — | — | — |

הנימוק בקצרה: אצלנו הבעיה היא כבר עודף טקסט, לא חוסר. מה שחברות גדולות עושות **ושאין
לנו** הוא להפוך reference לתוצר של קוד — וזה מה שכדאי לקחת.

## מקורות

- [Michael Nygard — Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [adr.github.io](https://adr.github.io/) · [MADR](https://adr.github.io/madr/)
- [AWS — ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/welcome.html)
- [Software Engineering at Google, ch. 10 Documentation](https://abseil.io/resources/swe-book/html/ch10.html)
- [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)
- [GitHub — About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Backstage — Software Catalog](https://backstage.io/docs/features/software-catalog/) · [TechDocs](https://backstage.io/docs/features/techdocs/)
- [Diátaxis](https://diataxis.fr/)
- [AGENTS.md](https://agents.md/) · [Claude Code — memory](https://code.claude.com/docs/en/memory)
