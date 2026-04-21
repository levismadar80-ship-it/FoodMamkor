# מהמקור — מפת דרכים

## v1 — MVP (סטטוס נוכחי)
- [x] דף בית: Hero + Category Grid + גריד עסקים + מהמטבח של השכן
- [x] מפה Leaflet + גריד מתעדכן
- [x] עמוד עסק מלא + slug URL
- [x] הרשמת צרכן + Google OAuth + Apple OAuth
- [x] הרשמת בית עסק (multi-step) → ממתין לאישור
- [x] התראות WhatsApp לאדמין (Twilio)
- [x] מועדפים
- [x] PWA + push notifications
- [x] /terms — תנאי שימוש
- [x] Freemium (3 תמונות חינם)
- [x] מערכת דירוג דרך WhatsApp
- [x] /about — חזון + ערכים
- [x] SEO עם Next.js (SSR, meta tags, sitemap)
- [x] DELETE /users/me (חובה App Store)
- [x] Top product + מחיר בכרטיסייה ובפופאפ מפה
- [x] "איך זה עובד?" בדף הבית (3 שלבים)
- [x] Bottom Navigation מובייל (4 טאבים)
- [x] ממשק אדמין מלא (7 דפים)
- [x] 24 בדיקות pytest + Playwright E2E

### עדיין ב-v1 — ממתין לביצוע
- [ ] עיצוב מעודכן (ראה docs/DESIGN.md + TASKS.md)
- [ ] Footer עם Instagram + ניוזלטר
- [ ] Social Proof Bar דינמי
- [ ] סקציות חדשות ב-/about (ערכים + מייסדת + טופס יצירת קשר)
- [ ] מפה: flyTo + openPopup בלחיצה על כרטיסייה (דו-כיווני)
- [ ] חיפוש חכם — תוצאות מיידיות + פאנל מסננים מתקדם
- [ ] רשימת ערים ישראל — autocomplete בכל שדות עיר
- [ ] Google OAuth + Apple OAuth — כניסה מאוחדת יפה
- [ ] /events — אירועים בחוות: גריד + לוח שנה + preview בדף הבית
- [ ] /producer/dashboard — זמינות יומית + סטטיסטיקות + הוספת אירוע
- [ ] "עסקים דומים" בתחתית עמוד עסק
- [ ] "עסקים חדשים" סקציה בדף הבית
- [ ] ProducerCard heart/favorite Phase C — post-login replay (user favorited while logged out → replay after login)
- [ ] Lightbox for gallery images — full-screen image viewer on producer detail page
- [ ] Events section on homepage — preview strip of upcoming farm/producer events (feeds from /events)

### לפני דומיין — חובה לעבור:
- [ ] Docker + localhost עובד
- [ ] כל 13 שלבי הבדיקה (עיצוב, auth, אדמין, מובייל, SEO)
- [ ] 5+ משתמשים ניסו + 3 יצרנים נרשמו

## v2 — אחרי שיש קהל
- [ ] ביקורות על עסקים מאומתים
- [ ] עסקים ש"אחרים שמרו" (social proof)
- [ ] EN/עב toggle (i18next)
- [ ] בוט Claude לשאלות תזונה
- [ ] מתכונים (הגשה ממשתמשים → אישור)
- [ ] React Native app
- [ ] ניוזלטר שבועי אוטומטי
- [ ] מאמתים מתנדבים (role: ambassador)
- [ ] CSA — מנוי קופסת ירקות שבועית
- [ ] עוקבים לבית עסק (producer_followers)
- [ ] קודי קופון לבתי עסק
- [ ] Freemium עם סליקת אשראי
- [ ] API פתוח לעסקים
- [ ] השוואת מחירים

## v2 — Claude Agent SDK Integration

### AI Support Agent
- Floating chat widget on all pages
- Answers questions about mehamakor in Hebrew
- Knows: how to register, find producers, post listings
- Uses claude-haiku (cheapest model)
- Implementation:
  pip install claude-agent-sdk
  ANTHROPIC_API_KEY already set in Railway ✅

### AI Search Agent
- Natural language search: "אני מחפשת בשר grass-fed בחיפה"
- Returns relevant producers automatically
- Replaces manual category/city filters

### Auto-Moderation Agent
- Reviews home listings automatically
- Flags suspicious content
- Already partially built in MODERATION.md

Priority: after v1 launch + 10 real producers onboarded.

> **Status note (אפריל 2026):** the simpler "AI Support Agent" pattern
> already shipped in v1 as a one-shot Claude Haiku endpoint
> (`backend/app/routers/chat.py` + `frontend/components/ChatWidget.jsx`).
> The v2 upgrade is to migrate it to the `claude-agent-sdk` so the bot
> can call backend tools (look up a producer by name, fetch upcoming
> events, list categories) instead of relying solely on the system
> prompt. The AI Search Agent and Auto-Moderation Agent above are
> still pending — Auto-Moderation also has a partial v1 implementation
> in `MODERATION.md` / `home_product_moderation.py` that can be lifted
> into the agent loop rather than rebuilt.

## v3+ — רעיונות
- שוק שבועי וירטואלי — "יום שוק"
- קהילות לפי אזור/שכונה
- שיתוף עם מסעדות ושפים
- הרחבה לחו"ל

## Future AI Workflow Improvements

### Marketing AI Agents (v3 — post-launch)
When mehamekor has active producers and users, set up specialized marketing agents using coreyhaines31/marketingskills:
- SEO Agent: optimize producer pages for local search ('אוכל בריא + עיר')
- Content Agent: generate producer descriptions and category content
- Growth Agent: referral programs, retention, churn prevention
- Strategy Agent: competitive analysis vs other Israeli food platforms

Reference: nocode.joshua TikTok — 7 Marketing AI Agents on autopilot
Install when: site has 50+ producers and 200+ monthly users

Do NOT implement now — this is a post-launch item.
