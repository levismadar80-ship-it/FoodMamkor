# אירועים וסדנאות

**מה הם עושים.** בית עסק מפרסם אירוע או סדנה עם תאריך, שעה ומקום; מבקרות נרשמות באתר, מקבלות אישור במייל וקישור ביטול, ובית העסק מקבל הודעה על כל הרשמה.

**Routes**
* `frontend/app/[locale]/events/` · `frontend/app/[locale]/events/[id]/`
* `frontend/app/[locale]/producer/dashboard/events/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/registration/[token]/` — ביטול הרשמה דרך הקישור במייל.

**קבצים מרכזיים**
* `backend/app/routers/events.py` · `backend/app/routers/registrations.py`
* `backend/app/services/registration_emails.py` — שלושת המיילים; הנוסח אושר מילה במילה.
* `frontend/app/[locale]/events/EventsClient.jsx`
* `frontend/components/RegistrationOverlays.jsx` — פס ההרשמה.

**Flags.** אין.

**טסטים**
* `tests/test_events.py` · `tests/test_event_end_time.py` · `tests/test_events_cross_owner.py` · `tests/test_events_mine.py`
* `tests/test_meh2763_registrations.py` · `tests/test_meh3373_registration_recipient_limit.py` · `tests/test_meh1161_event_producer_gate.py`
* `frontend/e2e/flows/manual/dashboard-manage-events.spec.ts` · `frontend/e2e/flows/08-calendar-view.spec.ts`

**מזהי רישום שזה מכסה.** `events`.
