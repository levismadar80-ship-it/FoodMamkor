# אירועים וסדנאות

**מה הם עושים.** בית עסק מפרסם אירוע או סדנה עם תאריך, שעה ומקום; מבקרות נרשמות באתר, מקבלות אישור במייל וקישור ביטול, ובית העסק מקבל הודעה על כל הרשמה.

**Routes**
* `frontend/app/[locale]/(whats-on)/` — ‏`/events` ו-`/experiences` הם שני דפים של מסך אחד: ה-layout המשותף (`frontend/app/[locale]/(whats-on)/layout.js`) מציג את `EventsClient` פעם אחת, והלשונית נגזרת מהכתובת בלבד. מעבר לשונית הוא `router.push` אמיתי (MEH-3463). השומר: `frontend/__tests__/NoHandWrittenRouteChangeGuard.test.js`.
* הרשימה הראשונה נקראת בשרת (MEH-2233): ה-layout קורא את `/events` ואת `/experiences` בלי סינון (cache של 60 שניות) ומעביר אותן כ-`initialRows`. ‏`EventsClient` משתמש ברשימה של הלשונית שאליה הגיעו, פעם אחת, ורק כשבכתובת אין סינון. מעבר לשונית, Back וסינון שולחים בקשה כמו קודם. השומר: `frontend/__tests__/EventsServerFirstList.test.jsx`.
* `frontend/app/[locale]/events/[id]/`
* `frontend/app/[locale]/producer/dashboard/events/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/registration/[token]/` — ביטול הרשמה דרך הקישור במייל.

**קבצים מרכזיים**
* `backend/app/routers/events.py` · `backend/app/routers/registrations.py` · `backend/app/services/registration_waitlist.py` (רשימת המתנה לאירוע מלא, MEH-3314)
* `backend/app/services/registration_emails.py` — מיילי ההרשמה (אישור, בעלים, ביטול, תזכורת MEH-3312, רשימת המתנה והצעת מקום MEH-3314).
* `frontend/app/[locale]/events/EventsClient.jsx`
* `frontend/components/RegistrationOverlays.jsx` — פס ההרשמה.
* `frontend/components/RegistrationCta.jsx` — כפתור ההרשמה. לחיצה על וואטסאפ, התקשרות או «שאלה» נספרת לבית העסק (`trackChannelClick`, MEH-2991), כמו בדף בית העסק. קישור הרשמה חיצוני לא נספר. שומר: `frontend/__tests__/RegistrationCtaContactCount.test.jsx`. בטופס ההרשמה באתר, מתחת לכפתור, שורה שמציינת מול איזה בית עסק עושים את העסקה ושמהמקור לא צד לה (`frontend/components/public/NotAPartyLine.jsx`, MEH-3570).
* `frontend/app/[locale]/events/[id]/EventDetailClient.jsx` — תמונת השער: תמונת האירוע, ואם אין, התמונה הראשונה של הבעלים, כמו בכרטיס (MEH-3459). תמונת השיתוף ב-`frontend/app/[locale]/events/[id]/page.js` באותו סדר.
* `frontend/lib/use-duplicate-source.js` — «שכפול» ברשימת האירועים פותח את `new?from=<id>` עם כל השדות מלאים חוץ מהתאריך. השורה נמצאת ברשימה של העסק עצמו, `/events/mine` (MEH-3438). הטסט `frontend/__tests__/MEH3438LessTyping.test.jsx`.

**Flags.** אין.

**טסטים**
* `tests/test_events.py` · `tests/test_event_end_time.py` · `tests/test_events_cross_owner.py` · `tests/test_events_mine.py`
* `tests/test_meh2763_registrations.py` · `tests/test_meh3373_registration_recipient_limit.py` · `tests/test_meh1161_event_producer_gate.py` · `tests/test_meh3314_registration_waitlist.py` · `tests/test_meh3315_party_size_attendance.py`
* `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts` · `frontend/e2e/flows/08-calendar-view.spec.ts`

**מזהי רישום שזה מכסה.** `events`.
