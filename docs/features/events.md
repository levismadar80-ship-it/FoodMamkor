# אירועים וסדנאות

**מה הם עושים.** בית עסק מפרסם אירוע או סדנה עם תאריך, שעה ומקום; מבקרות נרשמות באתר, מקבלות אישור במייל וקישור ביטול, ובית העסק מקבל הודעה על כל הרשמה.

**Routes**
* `frontend/app/[locale]/(whats-on)/` — ‏`/events` ו-`/experiences` הם שני דפים של מסך אחד: ה-layout המשותף (`frontend/app/[locale]/(whats-on)/layout.js`) מציג את `EventsClient` פעם אחת, והלשונית נגזרת מהכתובת בלבד. מעבר לשונית הוא `router.push` אמיתי (MEH-3463). השומר: `frontend/__tests__/NoHandWrittenRouteChangeGuard.test.js`.
* הרשימה הראשונה נקראת בשרת (MEH-2233): ה-layout קורא את `/events` ואת `/experiences` בלי סינון (cache של 60 שניות) ומעביר אותן כ-`initialRows`. ‏`EventsClient` משתמש ברשימה של הלשונית שאליה הגיעו, פעם אחת, ורק כשבכתובת אין סינון. מעבר לשונית ו-Back בלי סינון מציגים מיד את הרשימה האחרונה הידועה של הלשונית (מהשרת או מטעינה קודמת), בלי שלד, ומרעננים אותה בשקט ברקע (MEH-3626). סינון שולח בקשה כמו קודם. בזמן טעינה אמיתית מוצגים רק «הכל», הצ'יפ שנבחר והצ'יפים שהיו גלויים בלשונית הזאת, כדי שצ'יפ לא יופיע ואז ייעלם. השומר: `frontend/__tests__/EventsServerFirstList.test.jsx`.
* `frontend/app/[locale]/events/[id]/`
* `frontend/app/[locale]/producer/dashboard/events/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/registration/[token]/` — ביטול הרשמה דרך הקישור במייל.

**קבצים מרכזיים**
* `backend/app/routers/events.py` · `backend/app/routers/registrations.py` · `backend/app/services/registration_waitlist.py` (רשימת המתנה לאירוע מלא, MEH-3314)
* `backend/app/services/registration_emails.py` — מיילי ההרשמה (אישור, בעלים, ביטול, תזכורת MEH-3312, רשימת המתנה והצעת מקום MEH-3314).
* `frontend/app/[locale]/events/EventsClient.jsx`
* `frontend/components/RegistrationOverlays.jsx` — פס ההרשמה.
* `frontend/components/RegistrationCta.jsx` — כפתור ההרשמה. לחיצה על וואטסאפ, התקשרות או «שאלה» נספרת לבית העסק (`trackChannelClick`, MEH-2991), כמו בדף בית העסק. קישור הרשמה חיצוני לא נספר. שומר: `frontend/__tests__/RegistrationCtaContactCount.test.jsx`. לחיצה על וואטסאפ (הכפתור, רשימת ההמתנה או «שאלה» עם נייד) נשלחת גם ל-PostHog כאירוע `item_whatsapp_click`, עם סוג הדף, הפריט, בית העסק והקישור, כדי לראות כמה הרשמות נסגרות מחוץ לאתר. שום דבר לא נחסם (MEH-3194). שומר: `frontend/__tests__/RegistrationCtaOffSiteWhatsApp.test.jsx`. בטופס ההרשמה באתר, מתחת לכפתור, שורה שמציינת מול איזה בית עסק עושים את העסקה ושמהמקור לא צד לה (`frontend/components/public/NotAPartyLine.jsx`, MEH-3570).
* `frontend/app/[locale]/events/[id]/EventDetailClient.jsx` — תמונת השער: תמונת האירוע, ואם אין, התמונה הראשונה של הבעלים, כמו בכרטיס (MEH-3459). תמונת השיתוף ב-`frontend/app/[locale]/events/[id]/page.js` באותו סדר.
* `frontend/components/EventForm.jsx` · `backend/app/data/form_maps/event.json` · `frontend/lib/event-draft.js` — «יש לכם מודעה על האירוע?» (MEH-3751): בטופס אירוע חדש מדביקים פוסט או הודעה ומקבלים טיוטה של הטופס, בלי שמירה. אותו מנוע ואותו route כמו במתכונים (`backend/app/services/form_filler.py`, `POST /producers/me/ai-fill/event`): קטגוריה רק מהארבע, תאריך רק מהיום ועד שנה, עיר רק מהרשימה ורק אם היא כתובה בטקסט, מחיר ומספר מקומות רק כשהמספר כתוב ליד היחידה שלו («20 ש״ח», «40 משתתפים», «בחינם» הוא 0). כתובת מהטיוטה מנקה את הנעיצה ומעבירה נקודה שמורה שנבחרה ל«כתובת אחרת». לכל שדה «?» עם ההסבר מ-`events.form.help`. הטסטים: `tests/test_meh3751_event_fill.py` · `frontend/__tests__/EventFormAiFill.test.jsx`.
* `frontend/lib/use-duplicate-source.js` — «שכפול» ברשימת האירועים פותח את `new?from=<id>` עם כל השדות מלאים חוץ מהתאריך. השורה נמצאת ברשימה של העסק עצמו, `/events/mine` (MEH-3438). הטסט `frontend/__tests__/MEH3438LessTyping.test.jsx`.

* `backend/app/routers/admin_business_content.py` · `frontend/components/admin/AdminBusinessEventsPanel.jsx` — האדמין מוסיפה ועורכת אירועים (וחוויות, דרך ה-API) בשם בית עסק, מתוך עמוד העריכה של העסק באדמין (MEH-3873). אותו `EventForm` (`adminProducerId`), עם תיבה חובה שבית העסק אישר בכתב; ההסכמה נרשמת ביומן פעולות האדמין. עובד גם לעסק שעוד אין לו חשבון בעלים; חוויה צריכה חשבון בעלים. הטסט `tests/test_meh3873_admin_business_content.py`.

**Flags.** אין.

**טסטים**
* `tests/test_events.py` · `tests/test_event_end_time.py` · `tests/test_events_cross_owner.py` · `tests/test_events_mine.py`
* `tests/test_meh2763_registrations.py` · `tests/test_meh3373_registration_recipient_limit.py` · `tests/test_meh1161_event_producer_gate.py` · `tests/test_meh3314_registration_waitlist.py` · `tests/test_meh3315_party_size_attendance.py`
* `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts` · `frontend/e2e/flows/08-calendar-view.spec.ts`

**מזהי רישום שזה מכסה.** `events`.
