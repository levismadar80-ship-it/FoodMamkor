**התשובה:** **Impeccable אמיתי, מתוחזק — וכבר מותקן אצלנו** (21 skills, נעולים ב-hash). **Hallmark** אמיתי (`nutlope/hallmark`, של Together AI) ופעיל. **«UI SDK»** לא מזוהה ככלי עיצוב אחד — יש כמה ספריות בשם הזה, אף אחת לא כלי ביקורת עיצוב. ההמלצה: לא להתקין שום דבר חדש; לבדוק את פקודת `audit` של Impeccable שכבר יש מול הרכיבים המשותפים לפני שמחפשים כלי נוסף.

# כלי עיצוב: Impeccable, ‏Hallmark, ‏UI SDK

> **דוח מחקר בלבד.** לא הותקן כלום ולא שונה עיצוב. ההחלטות של ספיר. נכתב 17/11/2026 מול `origin/staging` (`e43e137`).
> דפי GitHub ו-npm עצמם היו חסומים מה-sandbox; העובדות כאן ממראות ומ-registries — מסומן איפה.

> **בדיקת כפילויות (17/11):** Linear: «Impeccable» → 0; «design audit» לא נמצא כרטיס. GitHub: Impeccable כבר ב-`skills-lock.json`; ADR-026 מזכיר אותו. אין מחקר קודם על Hallmark או UI SDK.

---

## 1. מה כבר אצלנו (נבדק)

| מה | ראיה |
|---|---|
| **21 skills של Impeccable מותקנים**: `adapt, animate, arrange, audit, bolder, clarify, colorize, critique, delight, distill, extract, frontend-design, harden, normalize, onboard, optimize, overdrive, polish, quieter, teach-impeccable, typeset` | `skills-lock.json` (`"source": "pbakaus/impeccable"`) |
| שרשרת אספקה ל-skills: 5 שכבות, hash לכל skill, נכשל-סגור | `.claude/rules/skills.md`; [ADR-004](../decisions/ADR-004-skills-lockdown-5-layers.md) |
| ADR-026 כבר מזכיר את Impeccable | `docs/decisions/ADR-026-error-color-token.md` |
| רכיבים משותפים: 24 קבצים ב-`components/ui/`, טבלת בעלים + שומר לכל אחד | `frontend/components/CLAUDE.md:15-45`; ‏`ComponentCatalogGuard.test.js` |
| שומרי עיצוב ב-CI: RTL לוגי (חוסם), ‏«יצרן», אימוג'י, צבעים | `scripts/checks/rtl-logical-props-guard.sh`, ‏`brand-lexicon-guard.sh` (HANDOFF 17/11) |

## 2. שלושת הכלים

| | Impeccable | Hallmark | «UI SDK» |
|---|---|---|---|
| אמיתי? | כן — [github.com/pbakaus/impeccable](https://github.com/pbakaus/impeccable), ‏[npm](https://www.npmjs.com/package/impeccable) | כן, המועמד הסביר [github.com/nutlope/hallmark](https://github.com/nutlope/hallmark) | עמום |
| מתחזק | Paul Bakaus | Hassan El Mghari (Nutlope); ה-README: «Made by Together AI» | — |
| רישיון | Apache-2.0 (גרסאות 2.0.0–2.0.6 היו BSL-1.1) | MIT (לפי שלושה רישומים; קובץ הרישיון עצמו לא נקרא) | — |
| פעילות | npm 4.9.2 פורסם 16/11/2026 ([Snyk](https://security.snyk.io/package/npm/impeccable)) | 99 commits ב-repo; מספרי הכוכבים ברישומים סותרים (1.5K עד 47K) — לא אמין; עדכון אחרון שנרשם: 26/6/2026 | — |
| מה זה | skills בקבצי markdown + CLI (`npx impeccable detect`) + «Live Mode» שעורך קבצים | skill אחד (SKILL.md של ~67KB + references): ‏`audit` (ניקוד מול רשימת anti-patterns, בלי לערוך), ‏`redesign`, ‏`study <url>`; קורא/כותב `.hallmark/log.json` בפרויקט | ראו למטה |
| סיכון | Snyk: אין חולשות ידועות; ה-CLI מ-4.0 מוריד בינארי לפי פלטפורמה (סוכם checksum לפי release notes); ‏`detect <URL>` מריץ Puppeteer. ב-skills.sh: ‏Snyk **Fail** — הסיבה לא נקראה | markdown בלבד לפי הרישום; מראות רבות → סכנת התחזות | — |

**«UI SDK» — המועמדים:**
- [`@openai/apps-sdk-ui`](https://github.com/openai/apps-sdk-ui) — ערכת רכיבים ל-ChatGPT apps (MIT). לא רלוונטי לאתר.
- [`mcp-ui`](https://github.com/MCP-UI-Org/mcp-ui) — «MCP UI SDK», לרנדור ממשק מתוך שרת MCP (Apache-2.0).
- `@modelcontextprotocol/ext-apps` — MCP Apps, הארגון הרשמי.
- ui.sh (Tailwind) — ערכת עיצוב לסוכנים, waitlist בלבד; **לא אומת**.
אף אחד מהם הוא לא כלי audit לעיצוב. **צריך מספיר: איפה ראתה את השם.**

## 3. השוואה לרכיבים המשותפים שלנו

- **Impeccable `audit` / `normalize` / `polish`** בודקים נגישות, ביצועים, theming, רספונסיביות ועקביות. אצלנו כבר יש **שומר קוד** לרוב אותם תחומים (`HandWrittenRatchet`, ‏`FieldLookGuard`, ‏`ButtonPrimitiveGuard`, RTL). ההבדל: skill הוא **ביקורת חד-פעמית** שמציעה; שומר **נכשל ב-CI** כל פעם.
- **Hallmark audit** — «anti-AI-slop» כללי. החוקים שלנו ספציפיים יותר (BRAND.md §7, ‏ADR-019 לצבעי מצב, Phosphor בלבד לפי ADR-013). כלי כללי לא מכיר אותם, ועלול להציע שינוי שסותר נעילה.
- סיכון שאין ב-skills שלנו היום: **Live Mode** ו-`detect` של Impeccable מריצים קוד מקומי/דפדפן — מחוץ להגנות של `permissions` (לפי [Claude Code — plugin security](https://code.claude.com/docs/en/plugins/security)).

## 4. אפשרויות

**א — להשתמש במה שכבר מותקן (`/audit` של Impeccable) פעם אחת על `components/ui/`**
- בעד: אפס התקנה, אפס סיכון חדש; כבר נעול ב-hash; כנראה זה הכלי ששמעת עליו.
- נגד: ממצאים כלליים שצריך לסנן מול BRAND/ADR; תוצאה חד-פעמית.

**ב — להוסיף את Hallmark כ-skill (נעול ב-hash, markdown בלבד)**
- בעד: נקודת מבט שנייה ממקור אחר; רק markdown — סיכון נמוך אם נקרא לפני.
- נגד: SKILL.md של ~67KB נטען בהקשר; כותב קובץ `.hallmark/` בפרויקט; חופף ל-`audit` שכבר יש; כללים «אנטי-AI» כלליים שלא מכירים את BRAND.md.

**ג — לאמץ את ה-CLI של Impeccable (`detect`) כבדיקה ב-CI**
- בעד: בדיקה אוטומטית ולא חד-פעמית.
- נגד: בינארי שמורד מרחוק, Puppeteer, תלות חדשה ב-CI — בדיוק מה ש-ADR-004 בנוי לעצור; כבר יש שומרים ממוקדים יותר.

**ד — כלום**
- בעד: השומרים הקיימים מכסים את רוב התחומים; לפני ההשקה כל שינוי עיצוב עולה בדיקה.
- נגד: אין עין חיצונית על העיצוב.

## 5. המלצה, לפי סדר

| # | מה | עלות | אבטחה | מתי |
|---|---|---|---|---|
| 1 | **א** — הרצה אחת של `/audit` (Impeccable, מותקן) על `components/ui/` ושלושה דפים, כדוח בלבד | ~שעה | אפס — skill קיים, אין Live Mode, אין CLI | כשתרצי |
| 2 | **ד** לכל השאר | 0 | — | — |
| — | **ב** רק אם ה-audit של Impeccable לא נותן ערך; לקרוא את ה-SKILL.md, לנעול commit, להוסיף ל-allowlist לפי `skills.md` | ~שעה | ADR-004 | — |
| — | **ג** לא | — | — | — |

## מקורות

- [pbakaus/impeccable](https://github.com/pbakaus/impeccable) · [npm](https://www.npmjs.com/package/impeccable) · [Snyk](https://security.snyk.io/package/npm/impeccable) · [CLI 4.0 release notes](https://newreleases.io/project/github/pbakaus/impeccable/release/cli-v4.0.0)
- [nutlope/hallmark](https://github.com/nutlope/hallmark)
- [openai/apps-sdk-ui](https://github.com/openai/apps-sdk-ui) · [MCP-UI](https://github.com/MCP-UI-Org/mcp-ui)
- [Claude Code — plugin security](https://code.claude.com/docs/en/plugins/security)
