**התשובה:** הבסיס כבר קיים (JSON-LD עשיר, `llms.txt`, ‏robots שמתיר סוכני חיפוש, API ציבורי לקריאה). הצעד הבא הזול הוא **MCP לקריאה בלבד** מעל ה-API הקיים (כרטיס MEH-2109, אחרי ≥50 בתי עסק). הזמנה דרך סוכן לא רלוונטית לתשלום — אין אצלנו checkout ואף אחד מהפרוטוקולים לא אומת כזמין בישראל. אם בכלל, סוכן ישלח **בקשת הזמנה** שהקונה מאשרת בקוד לטלפון.

# אתר מוכן לסוכני AI

> **דוח מחקר בלבד.** לא שונה קוד. ההחלטות של ספיר. נכתב 17/11/2026 מול `origin/staging` (`e43e137`).
> משלים את [docs/audits/2026-11-ai-crawler-access.md](../audits/2026-11-ai-crawler-access.md) (מי מורשה לזחול) — לא חוזר עליו.

> **בדיקת כפילויות (17/11):** Linear: «MCP», «llms.txt» → MEH-2109 (MCP ציבורי, Backlog) ו-MEH-3348 (JSON-LD, Done) — לא מחקר. GitHub: `docs/audits/2026-11-ai-crawler-access.md` (#4693) עונה על «מי מורשה לזחול», לא על השאלה כאן.

---

## 1. מה יש היום (נבדק בקוד)

| שכבה | מצב | ראיה |
|---|---|---|
| JSON-LD | `FoodEstablishment`, ‏`OpeningHoursSpecification`, ‏`OfferCatalog`/`Offer`, ‏`AggregateRating`, ‏`Event`, ‏`Organization`, ‏`WebSite`+`SearchAction`, ‏`BreadcrumbList`, ‏`FAQPage` | `frontend/lib/seo.js:211, 346, 402, 486, 625-655, 779, 1112-1137`; ‏MEH-3348 (Done) הוסיף אזור שירות וזמינות באירועים |
| `llms.txt` | קיים, 17 שורות, 11 עמודים | `frontend/public/llms.txt` |
| robots | סוכני חיפוש מורשים, זוחלי אימון חסומים | `frontend/public/robots.txt`; האודיט הקודם |
| API ציבורי לקריאה | `GET /producers`, ‏`/producers/{id}`, ‏`/producers/by-slug/{slug}`, ‏`/categories`, ‏חיפוש | `backend/app/routers/producers.py:116, 423, 471, 934`; ‏`routers/search.py:86` |
| OpenAPI | ברירת המחדל של FastAPI (`/docs`, ‏`/openapi.json`) לא כובתה | `backend/app/main.py:14` |
| הזמנה באתר | בבנייה, כבוי: קוד לטלפון, שליחה, סטטוס — **בלי תשלום** | MEH-3262/3263/3296 (In Progress), PR #4611 |
| MCP | אין. כרטיס קיים: MEH-2109 («קריאה בלבד, אחרי ≥50 בתי עסק») | Linear |

## 2. מה בחוץ (מקורות)

- **llms.txt.** הצעה פתוחה ([llmstxt.org](https://llmstxt.org/)). אין ראיה שזוחלי AI גדולים קוראים אותו; נציג גוגל אמר שמערכות ה-AI שלהם לא משתמשות בו (דיווח משני: [Search Engine Roundtable](https://www.seroundtable.com/google-ai-llms-txt-39607.html)). עלות תחזוקה כמעט אפס — שווה להשאיר, לא שווה להשקיע.
- **נתונים מובנים** הם עדיין מה שמנועי חיפוש ו-AI Overviews קוראים ([Google — LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business)). אצלנו זה כבר בשל.
- **MCP.** הגרסה הנוכחית היא **2026-07-28** (יצאה 28/7/2026): בלי session ובלי handshake — כל בקשה עומדת בפני עצמה, ולכן שרת קריאה רץ מאחורי load balancer רגיל בלי אחסון משותף ([MCP blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/) · [spec](https://modelcontextprotocol.io/specification/2026-07-28)). נוסף אימות `iss` בתגובות OAuth (SEP-2468). הרשאה ב-HTTP היא OAuth 2.1, אופציונלית; שרת לקריאה ציבורית לא צריך אותה ([authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)). דוגמה מהשוק: Shopify Storefront/Catalog MCP ([shopify.dev](https://shopify.dev/docs/agents/catalog/storefront-mcp)).
- **A2A** (סוכן↔סוכן, Google → Linux Foundation): פרוטוקול לסוכן שמדבר עם סוכן אחר ([Google OSS blog, 4/2026](https://opensource.googleblog.com/2026/04/a-year-of-open-collaboration-celebrating-the-anniversary-of-a2a.html)). לאתר שהוא מקור מידע ולא סוכן בעצמו — MCP מספיק.
- **Agentic commerce.** OpenAI Instant Checkout + ACP (עם Stripe): הושק בארה״ב, קונים ומוכרים אמריקאים, פריט אחד ([TechCrunch](https://techcrunch.com/2025/09/29/openai-takes-on-google-amazon-with-new-agentic-shopping-system)); ב-2/2026 עדיין מתואר כ-US-first ([Digital Commerce 360](https://www.digitalcommerce360.com/2026/02/16/openai-expands-agentic-commerce-push/)). Google AP2 עם «מנדטים» (כוונה/עגלה, תקרה), Visa/Mastercard — **זמינות בישראל לא נמצאה** לאף אחד מהם (שני חיפושים). **מה כן זמין בישראל:** ChatGPT עצמו (ישראל ברשימת המדינות הנתמכות — [OpenAI Help](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries)), ו-**Ads Manager** של ChatGPT פתוח למפרסמים ישראלים, בלי תאריך להצגת מודעות בישראל ([Calcalist Tech](https://www.calcalistech.com/ctechnews/article/s1700wbtkmx)). ‏ChatGPT Business / Apps SDK בישראל: לא נמצא דף שמגביל או מאשר.
- **דפוסי בטיחות לקנייה ע״י סוכן** (ידע כללי, לא אומת היום): אישור אנושי לכל קנייה, תקרת סכום, טוקן מוגבל-תחום, הסוכן לא רואה מספר כרטיס (Stripe Shared Payment Token / מנדט AP2).

## 3. מה זה אומר אצלנו

1. **אין כסף באתר** (CONTEXT §2, ADR-042) — ולכן «הסוכן לא רואה כרטיס» פתור מראש: אין כרטיס. כל ACP/AP2 לא חל.
2. **«חנות מוכנה לסוכנים» לבתי עסק בלי אתר:** הדף שלנו כבר משמש כאתר שלהם. מה שסוכן צריך ממנו — מוצרים, מחירים, זמינות, שעות, אזור משלוח — כבר ב-JSON-LD וב-API. החסר הוא **ממשק שסוכן יודע לקרוא בלי לגרד HTML** (MCP).
3. **הזמנה דרך סוכן:** מסלול ההזמנה שבבנייה כבר דורש קוד לטלפון. זה בדיוק «אישור לכל קנייה»: הסוכן יכול למלא בקשה, הקונה מאשרת בקוד. תקרה לא נחוצה כשאין תשלום.

## 4. אפשרויות

**א — לא לעשות כלום עכשיו**
- בעד: JSON-LD + robots + llms.txt כבר מכסים את מה שסוכני החיפוש קוראים היום. לפני ההשקה כל שעה הולכת לבתי עסק.
- נגד: מי שבונה MCP ראשון בקטגוריה נהיה «המקור» שהעוזרים מצטטים.

**ב — שרת MCP לקריאה בלבד, ציבורי, בלי התחברות** (MEH-2109)
- בעד: עטיפה דקה מעל endpoints קיימים (חיפוש, בית עסק, אירועים); שליטה מלאה במה שנחשף; מתאים ל«מגזין» — עוזר מביא קוראת לדף.
- נגד: עוד משטח לתחזק ולהגביל קצב; ערך תלוי בכמות בתי עסק (מכאן שער ה-≥50).

**ג — הזמנה דרך סוכן (MCP עם OAuth, כלי `request_order`)**
- בעד: בית עסק בלי אתר מקבל הזמנות מעוזרי AI; האישור בקוד לטלפון כבר קיים.
- נגד: משטח כתיבה = RED (auth, spam, התחזות); תלוי שההזמנות באתר יעלו ויעבדו; אין עדיין ביקוש מוכח.

**ד — להירשם ל-ACP / Instant Checkout**
- בעד: אם יגיע לישראל, חשיפה בתוך ChatGPT.
- נגד: מחייב checkout — סותר את ה-DNA. לא זמין בישראל לפי מה שנמצא.

## 5. המלצה ולוח זמנים

| מתי | מה | עלות | אבטחה |
|---|---|---|---|
| **עכשיו** | כלום חדש. לוודא ש-JSON-LD מכסה `dateModified` לבית עסק (קשור לדוח 1) | שעה | — |
| **חצי שנה** (≥50 בתי עסק) | **ב**: MCP לקריאה (מפרט 2026-07-28, stateless — מתאים ל-Railway), בלי auth, שלושה כלים: `search_businesses`, ‏`get_business`, ‏`list_events`. אותו rate-limit כמו ה-API | 2–3 ימים | קריאה בלבד; לא לחשוף טלפון/מייל מעבר למה שבדף; הגבלת קצב לפי IP |
| **אחר כך** | **ג**, רק אם ההזמנות באתר עובדות ויש בקשות אמיתיות | שבוע+ · RED | OAuth 2.1 + PKCE לפי המפרט; הקונה מאשרת כל בקשה בקוד; אין גישה לנתוני בית עסק אחר |
| **לא** | **ד** | — | — |

## מקורות

- [llmstxt.org](https://llmstxt.org/) · [Search Engine Roundtable — Google on llms.txt](https://www.seroundtable.com/google-ai-llms-txt-39607.html)
- [Google — LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [MCP spec changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog) · [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [Shopify Storefront MCP](https://shopify.dev/docs/agents/catalog/storefront-mcp)
- [Google OSS — A2A anniversary](https://opensource.googleblog.com/2026/04/a-year-of-open-collaboration-celebrating-the-anniversary-of-a2a.html)
- [OpenAI — Buy it in ChatGPT](https://openai.com/index/buy-it-in-chatgpt/) · [TechCrunch](https://techcrunch.com/2025/09/29/openai-takes-on-google-amazon-with-new-agentic-shopping-system) · [Digital Commerce 360](https://www.digitalcommerce360.com/2026/02/16/openai-expands-agentic-commerce-push/)
