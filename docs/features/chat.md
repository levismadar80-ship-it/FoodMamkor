# צ'אט

**מה הוא עושה.** עוזרת באתר שעונה על שאלות על בתי עסק, קבוצות רכישה ושקיות. היא מרחפת בפינה; ב-`/map` היא כבויה לפי pathname כדי לא להתנגש בפקדי המפה. בדף בית עסק אין כפתור צף (MEH-1168): בלוק בעמוד, מיד אחרי «מוצרים» (`frontend/__tests__/BusinessChatPlacement.test.js` שומר על המיקום), פותח את החלון לבית העסק הזה (MEH-3489).

**Routes**
* אין route משלו — הווידג'ט מרונדר בתוך ה-layout.

**קבצים מרכזיים**
* `frontend/components/ChatWidget.jsx` — ‏z-index דרך inline style, ולכן grep על `z-<name>` לבדו מפספס אותו.
* `backend/app/routers/chat.py` — הלקוח של Anthropic נבנה תמיד עם `http_client=httpx.Client()`.
* `backend/app/services/chat_business_context.py` — ‏MEH-3481: שאלה שמזכירה בית עסק אחד בשמו מקבלת את הנתונים הציבוריים שלו (כל המוצרים עד התקרה של בית עסק, MEH-3505; שעות, «פתוח עכשיו» ומתי נפתחים שוב — `next_opening`, מחושב בשרת ולא בידי המודל, MEH-3504, אזורי משלוח וימים, מוצרים ואלרגנים, איך מזמינים). ‏MEH-3510: `backend/app/services/chat_business_extras.py` מוסיף לכל עיר את כל ימי המשלוח, האזור ומעל כמה המשלוח חינם, ותאריך המשלוח הבא (`next_delivery`, אותו כלל כמו `frontend/lib/nextDelivery.js`, מחושב בשרת); לכל מוצר את שם הקבוצה ואת היחידה במילים של העמוד («למארז»); ואת האירועים, הסדנאות וקבוצות הרכישה הפתוחות של בית העסק דרך השאילתות הציבוריות של האתר (`activities`), והביקורות שהעמוד מציג — טקסט, כוכבים ותגובת בית העסק, בלי שם המבקר (`reviews`, `rating`). רשימה סגורה של שדות; טלפון, מייל, כתובת וקבוצת וואטסאפ לא נכנסים. מהדף: ‏MEH-3489 — כשהחלון נפתח מדף בית עסק, הבקשה נושאת `producer_id` (UUID), והשרת קורא אותו רק כבית עסק ציבורי (`is_business()`); שם של בית עסק בשאלה גובר על הדף. השם נבדק כמילה שלמה בשלוש השאלות האחרונות; שם שמוכל בשם ארוך יותר נותן לו קדימות, ושני שמות שונים = אין התאמה. ה-route מקבל עכשיו session של DB; הקריאה רצה לפני קריאות המודל וה-session מוחזר מיד אחריה.
* `frontend/lib/business-chat.js` — ‏MEH-3489: הדף מבקש מהווידג'ט להיפתח לבית עסק אחד (אירוע חלון, עם שמירה של 10 שניות לבקשה שנשלחה לפני שהווידג'ט נטען). ‏MEH-3505: האירוע נושא גם `ask`, השאלה שנלחצה בדף; היא נשלחת כשהחלון פתוח ואין תשובה בדרך.
* `frontend/lib/business-chat-prompts.js` — ‏MEH-3505: השאלות המוצעות בחלון של בית עסק נבנות מהנתונים של העמוד (מוצר מוביל עם רכיבים או תיאור, סימון תזונתי שקיים אצל מוצר, משלוחים, רק כשבית העסק מציע משלוח, שעות), עד 3. שאלה שאין לה תשובה בעמוד לא מוצגת; אין נתונים = אין שאלות מוצעות.
* `frontend/app/[locale]/producer/[id]/components/BusinessChatPrompt.jsx` — הבלוק בדף: כותרת «שאלו את העוזרת על {שם}» עם שורה «עוזרת AI שעונה לפי המידע בעמוד הזה», השאלות של בית העסק עצמו (MEH-3505, לחיצה פותחת את החלון ושולחת את השאלה) ושדה «כתבו שאלה משלכם…» שפותח את החלון; בלי שאלות — רק השדה. רק בדף מאושר ולא בתצוגה מקדימה.
* `backend/app/site_pages.py` + `frontend/lib/site-pages.js` — MEH-3528: רשימה אחת של עמודי האתר. העוזרת כותבת עמוד כנתיב (`/join/pricing`), ו-`frontend/components/ChatMessageText.jsx` הופך רק נתיבים מהרשימה לקישור עם שם העמוד (`chat.pages.<key>`). נתיב שלא ברשימה נשאר טקסט.
* `backend/app/services/chat_site_knowledge.py` — MEH-3528: הכלים שבית עסק מקבל נכנסים להנחיה מ-`backend/app/data/chat_business_features.json`, שנבנה מהרישום ומ-he.json ב-`frontend/lib/chat-knowledge.js`. אחרי שינוי ברישום או בקופי שלו: `WRITE_CHAT_KNOWLEDGE=1 npx vitest run __tests__/ChatKnowledgeSync.test.js`.
* `backend/app/services/chat_intent_router.py` — המסווג (שאלה על נתונים חיים או שאלה כללית). ה-system של שתי הקריאות נשלח כרשימת בלוקים: החלק הקבוע נושא `cache_control` (prompt caching, ‏MEH-3384), והנתונים החיים יושבים בבלוק נפרד אחריו, כדי ששאלה משתנה לא תבטל את ה-cache.

**Flags.** אין. בלי `ANTHROPIC_API_KEY` הצ'אט מחזיר הודעת «לא זמין» בעברית ולא קורס.

**טסטים**
* `tests/test_meh3004_chat_group_buys_rescue.py`
* `tests/test_meh3481_chat_business_context.py` — שדות פרטיים לא נכנסים, משלוח לעיר, «פתוח עכשיו», שני שמות תואמים = אין התאמה.
* `tests/test_meh3510_chat_new_facts.py` — תאריך המשלוח הבא בשעון קפוא, חופשה = אין תאריך, עיר עם כמה ימים, יחידה וקבוצה, פעילות שלא ציבורית לא נכנסת, וביקורת מוסתרת או שם של מבקר לא נכנסים.
* `tests/test_meh3489_chat_business_page.py` — שאלה בלי שם עונה על הדף, שם אחר גובר, דף לא ציבורי לא מוסיף כלום.
* `frontend/__tests__/businessChatPrompts.test.js` — 0 / 1 / רבות שאלות, עסק בלי משלוחים לא מקבל שאלת משלוחים.
* `frontend/__tests__/ChatWidgetBusiness.test.jsx` — אין כפתור צף בדף, החלון נפתח לבית העסק ושולח `producer_id`, הפוקוס חוזר לכפתור.
* `tests/test_meh3384_prompt_caching.py` — מבנה ה-system וה-cache, ושהתשובה יוצאת גם בלי מוני cache.
* `tests/test_site_pages_registry.py` — MEH-3528: שתי הרשימות שוות, כל נתיב הוא עמוד אמיתי, אין בהנחיה עמוד בשם בלי נתיב, אין «בלי עמלה», והכלים מהרישום נמצאים בהנחיה. וגם: כל עמוד חדש באתר נמצא ברשימת העוזרת או ב-`NOT_FOR_ASSISTANT` עם סיבה, אחרת הטסט נכשל.
* `frontend/__tests__/ChatSiteLinks.test.jsx` — נתיב מהרשימה הופך לקישור, נתיב מומצא / URL / תשובה ריקה נשארים טקסט.
* `frontend/__tests__/ChatKnowledgeSync.test.js` — העותק של הכלים שה-backend קורא מעודכן.
* `frontend/__tests__/PageMentionLinkGuard.test.js` — בכל האתר: מחרוזת שמפנה לעמוד שלנו בשם צריכה תג קישור.
* `frontend/e2e/flows/23-ai-artifact-probe.spec.ts`

**מזהי רישום שזה מכסה.** אין — הצ'אט אינו כלי של בית העסק.
