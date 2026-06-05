# מהמקור — COPY BANK
> Single source of truth for all copy decisions.
> Last updated: 2026-05-22
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
| **Current** | `ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך.` |
| **Previous** | `בתי עסק מקומיים, כולם במקום אחד.` |
| **i18n key** | `home.hero.subtitle` |
| **Status** | ✅ (MEH-620, PR #690) |
| **Why** | MEH-522 ideation winner (variant κ). H1 asks "לא ידעת איפה" → Sub answers "אנחנו כבר בדקנו". Closes the arc; uses "כבר" work-already-done signal. |
| **MEH** | MEH-620 (refs MEH-522) |

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

### Stats counter — businesses label
| Field | Value |
|---|---|
| **Current** | `בתי עסק` |
| **Previous** | `בתי עסק מאומתים` (deprecated per MEH-579 over-claim guard) |
| **i18n key** | `home.stats.businesses` |
| **Status** | ✅ (refs MEH-579; removed in i18n sweep, likely MEH-472) |
| **Note** | Prior `MEH-654` reference was a typo (MEH-654 = adversarial-review CI job, unrelated to copy) — corrected per MEH-746/MEH-750. |
| **Why** | MEH-579 over-claim guard prohibits unsubstantiated trust claims pre-launch. "מאומתים" implied vetting infrastructure that doesn't exist yet. Removed in i18n sweep (likely MEH-472). Doc now matches actual key `home.stats.businesses` in `frontend/messages/he.json`. |
| **MEH** | MEH-654 (doc sync), MEH-521 (original entry), MEH-579 (over-claim guard) |

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
| **Body** | `האוכל מגיע אלייך טרי. כל בית עסק כאן עומד מאחורי מה שהיא מציעה.` |
| **Previous body** | `אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות` |
| **i18n keys** | `home.how_it_works.step03_title` / `home.how_it_works.step03_text` |
| **Status** | ✅ (MEH-609, PR #682, 2026-05-16) |
| **Why** | Drops double-negative ("בלי X, בלי Y") for positive outcome + founder-accountability framing per Brand Hub v1.1 §8-9 + discovery synthesis F6. |
| **MEH** | MEH-609 |

### Categories — subheading
| Field | Value |
|---|---|
| **Current** | `כל קטגוריה — בית עסק אחר, סיפור אחר.` |
| **Previous** | `ישר מבית העסק — בלי מתווכים` |
| **i18n key** | `home.categories.subheading` |
| **Status** | ✅ (MEH-606, PR #682, 2026-05-16) |
| **Why** | Drops saturated formula (5/7 Israeli competitors use a variant per Sub 2 Anti-pattern 1). Option A from issue menu chosen. |
| **MEH** | MEH-606 |

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
| **Current** | `אוכל טוב — לא שומרים לעצמנו` |
| **Previous** | `כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר` |
| **i18n key** | `about.consumer.parallax.quote` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx` (ParallaxQuote) |
| **Status** | ✅ (MEH-750) |
| **Why** | S8 review: old quote ranked source over food ("ומאיפה קונים — חשוב יותר" = where you buy matters more), a nutritional contradiction. New line echoes the brand idiom (newsletter heading) — good food is shared, not hoarded. |
| **MEH** | MEH-750 |

### /about — Sub copy paragraph 1
| Field | Value |
|---|---|
| **Current** | `כל מה שקרוב אלייך, במקום אחד.` |
| **Previous** | `העסקים שתמיד היו — רק שעכשיו את רואה אותם.` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx:157` |
| **Status** | ✅ (MEH-208/MEH-209, PR #579) |
| **Why** | Old closer was arrhythmic and passive ("businesses that always existed"). New copy is direct, rhythm-preserving, non-boastful. PR #579 merged 2026-05-10. |
| **MEH** | MEH-208 / MEH-209 |

### /about — Benefits section (heading + 3 pillars)
| Field | Value |
|---|---|
| **Heading** | `למה מהמקור` (NEW — `about.consumer.benefits.heading`) |
| **Pillar 1** | `קרוב אלייך` · body `בתי עסק מהאזור שלך, עם שרשרת קצרה ככל האפשר. פחות דרך, יותר טריות.` |
| **Pillar 2** | `אפשר לסמוך` · body `כל בית עסק נבדק אישית לפני שהוא עולה לאתר. אנחנו שואלות, מבררות, ולפעמים גם מבקרות — לפני שאומרות כן.` |
| **Pillar 3** | `קהילה מקומית` · body `כל קנייה תומכת ישירות באנשים מהשכונה — לא ברשת גדולה, אלא בבעלת עסק מהאזור שלך.` |
| **Previous** | titles `אוכל אמיתי קרוב אלייך` / `לסמוך על מה שאת אוכלת` / `לעזור לעסקים הקטנים`; trust body said `רק בתי עסק מאומתים. אנחנו בודקות כל אחת...` |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx` (Section 3) |
| **Status** | ✅ (MEH-750 — swallows MEH-746) |
| **Why** | S8 copy wave: tighter pillar titles + added section heading. `trust.body` drops "מאומתים" — MEH-742 gate (verified/declared lock) + MEH-579 over-claim guard. MEH-746 (same key) swallowed here. |
| **MEH** | MEH-750 (refs MEH-742, MEH-579, MEH-746) |

### /about — Criteria admission headline — 🗑️ RETIRED
| Field | Value |
|---|---|
| **Was** | `לא כל עסק נכנס למהמקור. אלו הקריטריונים שאנחנו בודקות:` |
| **Status** | 🗑️ Retired (MEH-750) — not present on the live page. The values section uses `about.consumer.values.heading` = `כך אנחנו בוחרות` + `values.intro`. Stale row removed to stop drift. |
| **MEH** | MEH-750 |

### Testimonials — /about placeholder state
| Field | Value |
|---|---|
| **Heading** | `הסיפורים שעוד ייכתבו כאן` |
| **Subtitle** | `המקום הזה שמור לסיפורים שלכן.` |
| **CTA** | `יש לך סיפור? ספרי לנו` |
| **Previous** | `מה אומרים עלינו` / `הסיפורים מגיעים בקרוב` / `גם את רוצה לשתף? כתבי לנו` |
| **i18n keys** | `about.consumer.testimonials.heading` / `.subtitle` / `.cta` |
| **Status** | ✅ (MEH-750) |
| **Why** | S8: old `מה אומרים עלינו` promised testimonial content that doesn't exist yet. Reframed as an honest "stories yet to be written" placeholder. |
| **MEH** | MEH-750 |

### EditorialBreath pull-quote (§06) — SHELVED
| Field | Value |
|---|---|
| **Quote** | `תכירי את מי שמאחורי האוכל` |
| **i18n key** | (removed — was `home.editorial_breath.quote`) |
| **Status** | 🕐 Shelved (MEH-733, 2026-06-05) |
| **Why** | Removed pre-launch (lone numeral, semantic mismatch with categories); intended future home: Producer Stories MEH-542 opener. |
| **MEH** | MEH-733 (refs MEH-542) |

---

## Section 4 — Producer-facing copy

### /register/producer — Step 2 subhead
| Field | Value |
|---|---|
| **Current** | `כמה שדות בלבד — תשלימי את שאר הפרטים מהדשבורד אחרי האישור.` |
| **Previous** | `3 שדות בלבד — תשלימי...` (literal "3" — drift) |
| **i18n key** | `register.producer.steps.business.subtitle` |
| **Location** | `frontend/app/[locale]/register/producer/page.js:393` |
| **Status** | ✅ (MEH-608, PR #683, 2026-05-16) |
| **Why** | Step 2 actually renders 6 fields after MEH-530 (license) + MEH-532 (description) shipped. Count-free wording prevents future drift per synthesis Finding F11. |
| **MEH** | MEH-608 |

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
| **Body** | `אם יש לך עסק שמייצר אוכל אמיתי — נשמח להכיר. מהמקור הוא הבית של בעלות עסק קטנות בישראל. כל עסק נבחר אישית, ומקבל עמוד מלא עם תמונות וסיפור.` |
| **Previous body** | `אם את בעלת עסק, חקלאית או מגדלת — הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי.` |
| **Button** | `הוסיפו את העסק שלך 🌿` |
| **i18n keys** | `home.cta.heading` / `home.cta.body` / `home.cta.button` |
| **Status** | ✅ (MEH-605, PR #682, 2026-05-16) |
| **Why** | Removes "דירקטורי" (marketplace word) + partial category list ("חקלאית או מגדלת" excluded ~75% of base — bakeries, dairies, wineries, chocolatiers). Brand Hub v1.1 §8: no partial category lists. |
| **MEH** | MEH-605 |

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
| 2026-06-05 | MEH-751 | /login `auth.login.value_publish` (he+en) | `פרסמי מטבח ביתי` / `Publish your home kitchen` | `הוסיפי את העסק שלך` / `Add your business` | DNA LOCK violation: "מטבח ביתי" = forbidden home-cook framing (legal-exposure family). Hotfix only; full feminine→neutral sweep of `auth.login.*` deferred to S9 copy wave (ADR-014). |
| 2026-06-05 | MEH-751 | /login `seo.login.og_description` (he+en) | `…ולתמוך ביצרניות איכותיות.` / `…support quality producers.` | `…ולתמוך בעסקים קטנים מהסביבה שלך.` / `…support small local businesses.` | Double LOCK violation: `יצרניות` (must be "בית עסק", not "יצרן") + `איכותיות` (balloon word, MEH-579 over-claim guard). |
| 2026-06-05 | MEH-750 | /about H1 + hero sub | `…עכשיו לא.` | `…עכשיו כבר לא` + NEW sub `אוכל מבתי עסק קטנים שבדקנו אישית — קרוב אלייך, בלי לחפש שעות.` | S8: drop terminal period on H1; add hero subheading rendered under H1. |
| 2026-06-05 | MEH-750 | /about Sapir story (greeting + p1–p5, −caption2) | old narrative + greeting `היי, אני ספיר.` | locked S8 narrative (word-of-mouth/whisper arc); greeting `היי, אני ספיר` (no period); `story.caption2` deleted | S8: stronger first-person narrative; greeting loses terminal period; 3rd caption dropped (kept caption1+caption3). |
| 2026-06-05 | MEH-750 | /about parallax quote | `…ומאיפה קונים — חשוב יותר` | `אוכל טוב — לא שומרים לעצמנו` | S8: old quote ranked source over food (nutritional contradiction); new line echoes brand idiom. |
| 2026-06-05 | MEH-750 | /about benefits (heading + titles + trust body) | titles `אוכל אמיתי קרוב אלייך`/`לסמוך…`/`לעזור…`; trust `רק בתי עסק מאומתים…` | NEW heading `למה מהמקור`; titles `קרוב אלייך`/`אפשר לסמוך`/`קהילה מקומית`; trust drops "מאומתים" | S8 copy wave; trust.body over-claim removal — swallows MEH-746 (MEH-742 gate + MEH-579). |
| 2026-06-05 | MEH-750 | /about testimonials | `מה אומרים עלינו` / `הסיפורים מגיעים בקרוב` | `הסיפורים שעוד ייכתבו כאן` / `המקום הזה שמור לסיפורים שלכן.` | S8: stop promising testimonial content that doesn't exist yet. |
| 2026-06-05 | MEH-750 | /about CTA heading + values.closing | `יש לך בית עסק? בואי אלינו.` + closing `אם זו את — בעלת עסק…` | `בנית עסק שמגיע לו בית? אנחנו רוצות להכיר.` (closing DELETED) | S8: merge duplicate business invites (closing+CTA were adjacent); neutral homograph `בנית` echoes tagline (ADR-011); drops gendered `בעלת עסק` exclusion (ADR-014 recruit-neutral). |
| 2026-06-05 | MEH-472 | Categories heading | `גלי לפי קטגוריה` | `גלו לפי קטגוריה` | ADR-014:80 ambiguous-surface fallback → UI rules (gender-neutral). Sapir adjudicated section headings to the UI side → feminine-singular `גלי` → plural `גלו`. EN heading is proper English (`Browse by category`), untouched. |
| 2026-05-16 | MEH-620 | Hero subtitle | `בתי עסק מקומיים, כולם במקום אחד.` | `ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך.` | MEH-522 winner κ — H1↔Sub arc closes ("לא ידעת איפה" → "אנחנו כבר בדקנו"). |
| 2026-05-16 | MEH-605 | Home CTA body | `...הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי.` | `אם יש לך עסק שמייצר אוכל אמיתי — נשמח להכיר. מהמקור הוא הבית של בעלות עסק קטנות בישראל. כל עסק נבחר אישית, ומקבל עמוד מלא עם תמונות וסיפור.` | Removes "דירקטורי" (marketplace word) + partial category list per Brand Hub v1.1 §8. |
| 2026-05-16 | MEH-606 | Categories subhead | `ישר מבית העסק — בלי מתווכים` | `כל קטגוריה — בית עסק אחר, סיפור אחר.` | Drops saturated formula (5/7 Israeli competitors use a variant per Sub 2 Anti-pattern 1). |
| 2026-05-16 | MEH-609 | HIW step 3 body | `אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות` | `האוכל מגיע אלייך טרי. כל בית עסק כאן עומד מאחורי מה שהיא מציעה.` | Drops double-negative for positive outcome + founder-accountability framing. |
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

## Brand phrasings

Canonical reusable brand phrases. When the same phrase appears across
multiple surfaces, lock it here so future copy edits stay consistent.

### `בלי לחפש שעות`
| Field | Value |
|---|---|
| **Canonical phrase** | `בלי לחפש שעות` |
| **Meaning** | "Without searching for hours" — captures the core value prop: everything in one place, no time wasted hunting for local food businesses. |
| **Status** | ✅ canonical |
| **Appears in** | `frontend/messages/he.json:534` (SEO/meta description) · `frontend/messages/he.json:2012` (/about page paragraph p5) |
| **Why** | Recurs as the closing beat across surfaces — pairs the "מקום אחד" (one place) promise with the time-saved payoff. Keep verbatim; do not paraphrase to "בלי לבזבז זמן" or similar. |
