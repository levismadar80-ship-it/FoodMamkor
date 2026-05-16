# מהמקור — COPY BANK
> Single source of truth for all copy decisions.
> Last updated: 2026-05-10 (initial — MEH-541)
> **Status key:** ✅ Merged to staging · ⏳ PR open · 🕐 Pending
>
> Rule: document only **merged** copy. Pending entries show the MEH ticket to watch.

---

## Section 1 — Hero & Header copy

### H1 — Homepage hero title
| Field | Value |
|---|---|
| **Current** | `האוכל הכי טוב קרוב אלייך. פשוט לא ידעת איפה.` |
| **i18n key** | `home.hero.title` |
| **Status** | ✅ |
| **Why** | Direct, factual, non-boastful. Addresses the problem (doesn't know where) without promising a solution upfront. Pre-Linear decision. |

### Subtitle — Homepage hero
| Field | Value |
|---|---|
| **Current** | `בתי עסק מקומיים, כולם במקום אחד.` |
| **i18n key** | `home.hero.subtitle` |
| **Status** | ✅ |
| **Why** | States the value proposition in one phrase. Short, punchy, memorable. |

### Subtitle — Friday variant
| Field | Value |
|---|---|
| **Current** | `שישי הגיע 🛒 מה הולך על שולחן השבת שלך?` |
| **i18n key** | `home.hero.friday_subtitle` |
| **Status** | ✅ |
| **Why** | Context-aware copy shown on Fridays. Connects to the Shabbat shopping ritual. |

### Search placeholder
| Field | Value |
|---|---|
| **Current** | `לחם מחמצת, ביצים אורגניות, ירקות ופירות` |
| **i18n key** | `home.search.placeholder` |
| **Status** | ✅ |
| **Why** | Real product examples from producers on the platform. Guides intent. |

### Near me CTA button
| Field | Value |
|---|---|
| **Current** | `קרוב אלי` |
| **i18n key** | `home.hero.near_me` |
| **Status** | ✅ (MEH-41) |
| **Why** | Short, location-action verb. Mirrors the "קרוב אלייך" theme of the H1. |
| **MEH** | MEH-41 (location feature) |

### Header banner CTA
| Field | Value |
|---|---|
| **Current** | ⏳ **PENDING** |
| **Status** | ⏳ PR #575 (MEH-520) — awaiting merge |
| **MEH** | MEH-520 |

### Nav — Add business
| Field | Value |
|---|---|
| **Current** | `הוסיפו את העסק שלך` |
| **i18n key** | `nav.add_business` |
| **Status** | ✅ |

---

## Section 2 — Trust signals & Social proof

### Stats counter — verified businesses label
| Field | Value |
|---|---|
| **Current** | `בתי עסק מאומתים` |
| **i18n key** | `home.stats.verified_businesses` |
| **Status** | ✅ (MEH-521) |
| **Why** | "מאומתים" (verified) is the key trust word. Chosen over "רשומים" (registered) — MEH-521 fixed visibility logic to only show approved producers. |
| **MEH** | MEH-521 |

### Stats counter — categories label
| Field | Value |
|---|---|
| **Current** | `קטגוריות` |
| **i18n key** | `home.stats.categories` |
| **Status** | ✅ |

### Stats counter — countrywide label
| Field | Value |
|---|---|
| **Current** | `מכל רחבי הארץ` |
| **i18n key** | `home.stats.countrywide` |
| **Status** | ✅ |

### Stats fallback (< 5 approved producers)
| Field | Value |
|---|---|
| **Current** | `מתחילות עכשיו · בכל רחבי הארץ 🌿` |
| **i18n key** | `home.stats.fallback` |
| **Status** | ✅ (MEH-521) |
| **Why** | Shows when producer count < 5. Avoids showing "0 businesses". Warm, aspirational tone. |
| **MEH** | MEH-521 (PR #576) |

### Trust strip — 8 attributes
| Field | Value |
|---|---|
| **Current** | 🕐 **PENDING** |
| **Status** | 🕐 Not yet merged (likely MEH-522+) |

### Comparison strip — סופר vs מהמקור
| Field | Value |
|---|---|
| **Current** | 🕐 **PENDING** |
| **Status** | 🕐 Not yet implemented |

---

## Section 3 — Content sections

### "איך זה עובד" — Step 1
| Field | Value |
|---|---|
| **Title** | `מצאו` |
| **Body** | `גלו בתי עסק קרובים אליכם — ירקות טריים, גבינות מהחווה, לחם מחמצת` |
| **i18n keys** | `home.how_it_works.step01_title` / `home.how_it_works.step01_text` |
| **Status** | ✅ |

### "איך זה עובד" — Step 2
| Field | Value |
|---|---|
| **Title** | `צרו קשר` |
| **Body** | `דברו ישירות עם בית העסק בוואטסאפ, בטלפון או באינסטגרם` |
| **i18n keys** | `home.how_it_works.step02_title` / `home.how_it_works.step02_text` |
| **Status** | ✅ |

### "איך זה עובד" — Step 3
| Field | Value |
|---|---|
| **Title** | `קבלו` |
| **Body** | `אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות` |
| **i18n keys** | `home.how_it_works.step03_title` / `home.how_it_works.step03_text` |
| **Status** | ✅ |

### Sapir quote — Homepage
| Field | Value |
|---|---|
| **Current** | `אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית.` |
| **Attribution** | `ספיר, מייסדת מהמקור →` |
| **i18n keys** | `home.founder_quote.text` / `home.founder_quote.attribution` |
| **Status** | ✅ |

### Sapir quote — /about page prominent callout
| Field | Value |
|---|---|
| **Current** | `כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx` (Quote component) |
| **Status** | ✅ |

### /about — Sub copy paragraph 1
| Field | Value |
|---|---|
| **Current** | `כל מה שקרוב אלייך, במקום אחד.` |
| **Previous** | `העסקים שתמיד היו — רק שעכשיו את רואה אותם.` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx:157` |
| **Status** | ✅ (MEH-208/MEH-209, PR #579) |
| **Why** | Old closer was arrhythmic and passive ("businesses that always existed"). New copy is direct, rhythm-preserving, non-boastful. PR #579 merged 2026-05-10. |
| **MEH** | MEH-208 / MEH-209 |

### /about — Section 1 H3 titles (3 pillars)
| Field | Value |
|---|---|
| **Pillar 1** | `אוכל אמיתי קרוב אלייך` |
| **Pillar 2** | `לסמוך על מה שאת אוכלת` |
| **Pillar 3** | `לעזור לעסקים הקטנים` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx` |
| **Status** | ✅ |

### /about — Criteria admission headline
| Field | Value |
|---|---|
| **Current** | `לא כל עסק נכנס למהמקור. אלו הקריטריונים שאנחנו בודקות:` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx` |
| **Status** | ✅ |

### Testimonials
| Field | Value |
|---|---|
| **Current** | 🕐 **PENDING** — not yet implemented |

---

## Section 4 — Producer-facing copy

### Welcome email — Consumer
| Field | Value |
|---|---|
| **Subject** | `ברוכה הבאה למהמקור 🌿` |
| **Body** | `שלום {name},\n\nברוכה הבאה למהמקור! 🌿\nעכשיו את יכולה לגלות בתי עסק מקומיים, כולם במקום אחד —\nכל האוכל האמיתי, במקום אחד.` |
| **Location** | `backend/app/services/auth_emails.py:send_welcome_email()` |
| **Status** | ✅ (MEH-287) |
| **MEH** | MEH-287 |

### Welcome email — Producer
| Field | Value |
|---|---|
| **Subject** | `ברוכה הבאה למהמקור 🌿` |
| **Key line** | `העסק שלך ממתין כרגע לאישור אדמין` |
| **Location** | `backend/app/services/auth_emails.py:send_welcome_email()` |
| **Status** | ✅ (MEH-287) |
| **MEH** | MEH-287 |

### Welcome WhatsApp — Producer (direct API)
| Field | Value |
|---|---|
| **Message** | `ברוכה הבאה למהמקור! 🌿\nהעסק '{name}' נרשם בהצלחה.\nהשלימי את הפרופיל כדי שלקוחות יוכלו למצוא אותך:\n{frontend_url}/producer/dashboard` |
| **Template (Meta)** | `producer_welcome_v1` (4 approved utility templates — see MEH-508 HANDOFF) |
| **Location** | `backend/app/services/auth_notifications.py:notify_producer_registered()` |
| **Status** | ✅ (MEH-287 + MEH-508) |
| **MEH** | MEH-287 (original), MEH-508 (Twilio → Meta Cloud API) |

### Admin notification — New producer
| Field | Value |
|---|---|
| **Message** | `בית עסק חדש: {name} - {city}\nלאישור: {frontend_url}/admin` |
| **Location** | `backend/app/services/auth_notifications.py:notify_admin_new_producer()` |
| **Status** | ✅ |

### Onboarding follow-ups (post-registration)
| Field | Value |
|---|---|
| **Current** | 🕐 **PENDING** |
| **Status** | 🕐 MEH-539 |

### Empty states (producer dashboard)
| Field | Value |
|---|---|
| **Current** | 🕐 **PENDING** |
| **Status** | 🕐 MEH-289 |

---

## Section 5 — Footer & CTAs

### Newsletter tagline (heading)
| Field | Value |
|---|---|
| **Current** | `אוכל טוב לא שומרים לעצמנו.` |
| **i18n key** | `nav.footer.newsletter_heading` |
| **Status** | ✅ |
| **Why** | Plays on the Hebrew idiom "לא שומרים לעצמנו" — food is social, not kept secret. Core brand voice. Pre-Linear. |

### Newsletter input placeholder
| Field | Value |
|---|---|
| **Current** | `האימייל שלך, בבקשה` |
| **i18n key** | `nav.footer.newsletter_placeholder` |
| **Status** | ✅ |

### Newsletter success message
| Field | Value |
|---|---|
| **Current** | `ברוכים הבאים למהמקור 🌱 נפגשות בתיבה` |
| **i18n key** | `nav.footer.newsletter_success` |
| **Status** | ✅ (MEH-535) |
| **Why** | "נפגשות בתיבה" (we'll meet in the inbox) is warm + personal. Feminine form consistent with brand voice. |
| **MEH** | MEH-535 |

### Footer brand tagline
| Field | Value |
|---|---|
| **Current** | `ישר מהמקור אליך — בתי עסק מקומיים, כולם במקום אחד.` |
| **i18n key** | `nav.footer.brand_tagline` |
| **Status** | ✅ |
| **Why** | Reinforces the brand name as a direction ("מהמקור" = from the source). |

### Footer CTA pitch (business owner)
| Field | Value |
|---|---|
| **Current** | `יש לך עסק מזון מקומי?` |
| **Subpitch** | `הצטרפו לקהילה הראשונה של בתי עסק אמיתיים בישראל` |
| **i18n keys** | `nav.footer.cta_pitch` / `nav.footer.cta_subpitch` |
| **Status** | ✅ |

### Homepage bottom CTA
| Field | Value |
|---|---|
| **Heading** | `יש לך עסק? בואי אליו` |
| **Body** | `אם את בעלת עסק, חקלאית או מגדלת — הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי.` |
| **Button** | `הוסיפו את העסק שלך 🌿` |
| **i18n keys** | `home.cta.heading` / `home.cta.body` / `home.cta.button` |
| **Status** | ✅ |

### Footer made-with-love
| Field | Value |
|---|---|
| **Current** | `נעשה באהבה בישראל 🌿` |
| **i18n key** | `nav.footer.made_with_love` |
| **Status** | ✅ |

---

## Section 6 — Decision log

| Date | MEH | Changed | Before | After | Why |
|---|---|---|---|---|---|
| 2026-05-10 | MEH-208/209 | /about paragraph 1 sub copy | `העסקים שתמיד היו — רק שעכשיו את רואה אותם.` | `כל מה שקרוב אלייך, במקום אחד.` | Old closer was arrhythmic + passive. New copy: direct, rhythm-preserving, non-boastful. |
| 2026-05-08 | MEH-521 | Stats strip visibility | Always visible | Hidden when < 5 approved producers; fallback text shown | Prevent "0 businesses" credibility gap during bootstrap phase. |
| 2026-05-09 | MEH-508 | Producer welcome WhatsApp | Twilio `producer_welcome_v1` template | Meta Cloud API direct `send_text()` call | Twilio → Meta Cloud API migration. Message content unchanged. |
| 2026-04-XX | MEH-287 | Producer welcome | Silent failure on Twilio misconfiguration | loud `logger.error` + `whatsapp_sent: false` in response | Observability: surface misconfiguration loudly, fail-open gracefully. |

---

## Pending decisions (track before next copy sweep)

| MEH | Topic | Notes |
|---|---|---|
| MEH-520 | Header banner CTA copy | PR #575 open |
| MEH-522–527 | Copy sweep (unknown scope) | Likely not started |
| MEH-534–540 | Copy sweep (unknown scope) | Likely not started |
| MEH-539 | Producer onboarding follow-up messages | Not merged |
| MEH-289 | Empty states (producer dashboard) | Not merged |

---

## Anti-patterns (do not use)

- ❌ `יצרן` / `יצרנית` — always "בית עסק" / "בעלת עסק"
- ❌ "marketplace" / "פלטפורמה" — we are a directory, not a marketplace  
- ❌ `שגיאה התרחשה` — use `משהו השתבש, נסו שוב`
- ❌ Mixed gender (זכר) — brand voice is consistently נקבה (feminine)
- ❌ `מוצרים` for food business pages — use `פריטים` or category-specific terms

---

## Customer-centric voice rule (MEH-579, May 14, 2026)

Feminine grammar is necessary but not sufficient. Every line of user-facing
UI copy must also pass the **subject test**: who is the grammatical subject?

| ❌ Founder-voice | ✅ Customer-voice |
|---|---|
| "אנחנו לא לוקחות עמלה" (subject: we) | "את לא משלמת לנו" (subject: you) |
| "אני בודקת תעודות" (subject: I) | "תהיי בסביבה של עסקים שעברו שיחה" (subject: you) |
| "הרשמה לוקחת 10 דקות" (subject: process) | "תוך 10 דקות יש לך דף חי" (subject: you) |

The rule: if the answer to a customer's question puts Mehamakor (we/I) as
the grammatical subject, rewrite to put the customer (את) as the subject.
The customer reads to learn what *she* gets, not what we do.

**Applies to:** FAQ pages, /about marketing copy, /register flow, error
messages, empty states, onboarding — anywhere a user reads about what
Mehamakor offers her.

**Does NOT apply to:** legal/privacy pages (must say "אנחנו אוספים"),
backoffice/admin tools (technical), or first-person founder bio on /about
(intentional "I" voice).

**Over-claim guard (also learned MEH-579):** Do not claim platform
authority that doesn't yet exist. ❌ "Verified by Mehamakor trust badge"
when there's no vetting infrastructure. ✅ "Pre-launch conversation with
every business" — what's actually true today.

**Anti-defensive framing:** Avoid answering questions customers don't ask.
"מה אם תיסגרו?" → reframe as "הלקוחות שיגיעו דרככם — שלכם או שלי?" The
answer is identical, but the question matches what's actually in her head.

---

## Customer-centric voice rule (MEH-579, May 14 2026)

Feminine grammar is necessary but not sufficient. Every line of user-facing
UI copy must also pass the **subject test**: who is the grammatical subject?

| ❌ Founder-voice | ✅ Customer-voice |
|---|---|
| "אנחנו לא לוקחות עמלה" (subject: we) | "את לא משלמת לנו" (subject: you) |
| "אני בודקת תעודות" (subject: I) | "תהיי בסביבה של עסקים שעברו שיחה" (subject: you) |
| "הרשמה לוקחת 10 דקות" (subject: process) | "תוך 10 דקות יש לך דף חי" (subject: you) |

The rule: if the answer to a customer's question puts Mehamakor (we/I) as
the grammatical subject, rewrite to put the customer (את) as the subject.
The customer reads to learn what *she* gets, not what we do.

**Applies to:** FAQ pages, /about marketing copy, /register flow, error
messages, empty states, onboarding — anywhere a user reads about what
Mehamakor offers her.

**Does NOT apply to:** legal/privacy pages (must say "אנחנו אוספים"),
backoffice/admin tools (technical), or first-person founder bio on /about
(intentional "I" voice).

## Anti-defensive framing (MEH-579, May 14 2026)

Avoid answering questions customers don't ask. Defensive framing tells the
reader something is at risk by raising the worry yourself.

Anti-pattern: "מה אם תיסגרו?" — this raises platform-shutdown anxiety
even if the customer hadn't thought about it. The answer sounds like a
promise that betrays its own fragility.

Better framing: "הלקוחות שיגיעו דרככם — שלכם או שלי?" — same answer,
but the question matches what's actually in her head: ownership of customer
relationships. The shutdown scenario is covered inside the answer, not
broadcast in the question.

Test: write the question as the reader would ask a friend over coffee.
If it sounds like a marketing department wrote it to address a corporate
concern, reframe.

## Over-claim guard + no-jargon rule (MEH-579, May 14 2026)

**Over-claim guard:** Do not claim platform authority, scale, or features
that don't yet exist. Pre-launch and early-stage platforms have very
little authority — pretending otherwise undermines trust the moment the
reader pokes at it.

| ❌ Over-claim | ✅ True today |
|---|---|
| "Verified by Mehamakor trust badge" | "שיחה אישית עם כל בית עסק לפני הרישום" |
| "אלפי לקוחות כבר מצאו אותך" | (omit — say nothing about customer base yet) |
| "Used by hundreds of businesses" | "אנחנו בpre-launch — את מהראשונות" |

Test before publishing any claim: "If a journalist or skeptical reader
followed up on this, would the evidence hold?" If no — rewrite or remove.

This guard is especially important for "trust" and "social proof" claims,
which are exactly where over-claim is most tempting and most damaging
when discovered.

**No-jargon rule:** No technical jargon in user-facing copy. The reader
should never have to know what an industry term means.

| ❌ Jargon | ✅ Plain Hebrew |
|---|---|
| "מתועדף ב-SEO" | "עולה בחיפושים" |
| "אלגוריתם שמדרג אותך" | "מי שמדרג אותך" |
| "פרופיל" (in business UI context) | "דף העסק שלך" |
| "מודרציה" | "אישור ידני" |
| "פלטפורמה" (when "אתר" works) | "אתר" |

**No over-specific examples:** Concrete examples must work across
producer types. "גבינות עזים תל אביב ב-9 בערב" locks out anyone not
selling cheese in Tel Aviv. Use "מישהי שמחפשת אוכל מקומי בגוגל" instead.
