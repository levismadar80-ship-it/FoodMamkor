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

### Nav trust strip — homepage (collapsing)
| Field | Value |
|---|---|
| **Current** | `שיחה אישית עם כל בית עסק` |
| **Previous** | `כל בית עסק עובר אישור אישי` (placeholder shipped in #1262) |
| **i18n key** | `nav.trust_strip` |
| **Status** | ⏳ (PR for this copy lock; supersedes the #1262 placeholder) |
| **Why** | MEH-579 over-claim-safe — "conversation" register, not "approval/verified". Differentiates from the hero subtitle + trust band, which lead with `עסקים שכבר בדקנו בשבילך`. |
| **MEH** | MEH-884 (Chunk 2 trust strip), MEH-579 (over-claim guard) |

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

### /about — Founder story (greeting + 5 paragraphs)
| Field | Value |
|---|---|
| **Current** | `greeting` `היי, אני ספיר` · `p1` `תמיד היה לי חשוב לדעת מאיפה האוכל שלי מגיע. רציתי לקנות יותר טוב — יותר בריא, יותר מקומי.` · `p2` `אבל מהר מאוד גיליתי שזה לא נגיש. כדי למצוא אוכל איכותי באמת, הייתי צריכה לחפש שעות — לשאול את האנשים הנכונים, להצטרף לקבוצות וואטסאפ, לחפש בגוגל ובאינסטגרם.` · `p3` `ואז הבנתי: הבעיה היא לא שאין אוכל טוב. הבעיה שלא יודעים איפה למצוא אותו.` · `p4` `יש חקלאים שמוכרים ירקות טריים כמה דקות מהבית. יש מישהי שאופה לחם מחמצת בשכונה ליד. יש בתי עסק קטנים עם מוצרים מדהימים — שרוב האנשים בכלל לא מכירים. אז ממשיכים לקנות בסופר — לא כי זה הכי טוב, אלא כי זה הכי נוח.` · `p5` `וכאן נולדה מהמקור. מקום אחד שמרכז עבורך אוכל אמיתי, מקומי ובריא — קרוב לבית. בלי לחפש שעות.` |
| **Previous** | `p1` `לפני שנתיים מצאתי את עצמי עומדת מול מדף בסופר…` · `p2` `התחלתי לשאול. חברה הכירה אופה…` · `p3` `וזה בדיוק מה שהפריע לי…` · `p4` `אז התחלתי לבנות את המקום הזה בעצמי…` · `p5` `היום מהמקור הוא בדיוק זה…` (MEH-750 wave) |
| **Unchanged** | `caption1` `מייסדת מהמקור. תוכניתנית במקצועה, לומדת רפואה תזונתית.` · `caption3` `את הקריטריונים — אני כותבת מתוך מה שאני בעצמי מחפשת באוכל.` |
| **Anchor phrase** | `בלי לחפש שעות` (canonical, COPY_BANK / MEH-719) — closes `p5`, echoes the hero sub from MEH-750 |
| **i18n keys** | `about.consumer.story.greeting` / `.p1`–`.p5` (he + en) |
| **Location** | `frontend/app/[locale]/about/AboutClient.jsx:100-105` |
| **Status** | ✅ (MEH-757) |
| **Why** | Sapir's 05/06 rewrite — problem→discovery→insight→solution arc, tighter than the MEH-750 narrative, landing on the `בלי לחפש שעות` brand anchor. Copy-only swap; closing captions untouched. |
| **Note** | `greeting` kept without a terminal period (bold heading, EN parity `Hi, I'm Sapir`), preserving the MEH-750 styling decision; MEH-757's prose block writes it with a period — flip the single char if a period is wanted. |
| **MEH** | MEH-757 (rides MEH-750 wave) |

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

### /register/producer — Licensing declaration (continuous commitment)
| Field | Value |
|---|---|
| **Current (he)** | `אני מצהיר/ה שהעסק פועל כדין, ושאם נדרשים לפעילותו רישיון או היתר — הם קיימים ובתוקף. אני מתחייב/ת שההצהרה תישאר נכונה כל עוד העסק מופיע במהמקור, ולעדכן את מהמקור אם משהו ישתנה.` |
| **en** | `I declare that the business operates lawfully, and that if a license or permit is required for its activity — they exist and are valid. I undertake that this declaration will remain true for as long as the business appears on Mehamakor, and to update Mehamakor if anything changes.` — **en pending Sapir review** |
| **Previous (he)** | `, ומצהירה שיש ברשותי את כל הרישיונות הנדרשים למכירת המוצרים לפי חוק רישוי עסקים.` (v1 launch text, appended to the ToS checkbox) |
| **i18n key** | `auth.register.producer.terms.declaration` (he+en) |
| **Location** | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` (own checkbox, `declarationConfirmed`) |
| **Audit version** | `DECLARATION_VERSION = "2026-06-v2"` (`backend/app/constants.py`) — v1 = old launch text, v2 = this continuous-commitment wording |
| **Status** | 🟡 **v2 — pending lawyer** (Brief Q1.1–Q1.5 draft; Sapir-locked wording, lawyer opinion outstanding) |
| **Why** | ADR-022 gate 2 / Brief Q1.3 — continuous commitment (not point-in-time) + Q1.4 audit trail. Own first-person checkbox per ADR-014 voice + stronger evidentiary value. |
| **MEH** | MEH-759 Chunk C (source ADR-022) |

### /register/producer — Grower declaration (conditional: ירקות / פירות)
| Field | Value |
|---|---|
| **Current (he)** | `התוצרת שאציע דרך מהמקור היא תוצרת שגידלתי בחלקתי בלבד.` |
| **en** | `The produce I will offer through Mehamakor is produce that I grew on my own plot only.` — **en pending Sapir review** |
| **i18n key** | `auth.register.producer.terms.farmer_declaration` (he+en) |
| **Location** | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` (conditional checkbox `farmerConfirmed`, shown + required only for categories ירקות / פירות) |
| **Status** | 🟡 **v2 — pending lawyer** (Sapir-locked wording, lawyer opinion outstanding) |
| **Why** | נספח א' / פס"ד קירשנר — "grown on my own plot only" is the legal line between license-exempt and license-required produce. Folds into the same `declaration_accepted` submission (no new API field). |
| **MEH** | MEH-759 Chunk C (source ADR-022) |

### /register/producer — Tagline (frame 03 STORY, "במשפט אחד")
| Field | Value |
|---|---|
| **Label (he)** | `במשפט אחד` |
| **Placeholder (he)** | `מה שהכי חשוב שידעו עליך` |
| **i18n keys** | `auth.register.producer.fields.tagline_label` / `.tagline_placeholder` |
| **Location** | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` (STORY frame — `short_description` input, `maxLength={160}` + live N/160 char-count, above the long-story `description`) |
| **Status** | ✅ (MEH-860, PR #1226, 2026-06-18) |
| **Why** | NN/G microcontent brevity + BoldBrush headline-above-bio convention — a one-line "dek" above the long story. he.json ONLY (MEH-472 HE-mirror freeze; en stale). |
| **MEH** | MEH-860 (S7 Chunk D) |

### /register/producer — Story reassurance card (frame 03)
| Field | Value |
|---|---|
| **Title (he)** | `הסיפור שלך הופך לעמוד העסק` |
| **Body (he)** | `מה שתכתבי כאן הופך לעמוד העסק שלך במהמקור — המקום שבו לקוחות פוגשים אותך לפני שהם פוגשים את מה שאת מוכרת. לא תיאור מוצר. סיפור.` |
| **i18n keys** | `auth.register.producer.story_card.title` / `.body` |
| **Location** | `frontend/app/[locale]/register/producer/RegisterProducerClient.jsx` (STORY frame — copy-only card, brand tokens `bg-background border border-primary/20`, no preview/logic) |
| **Status** | ✅ (MEH-860, PR #1226, 2026-06-18) |
| **Why** | Frames the magazine thesis — the story becomes the producer's page. "עמוד עריכותי" rejected as internal jargon → "עמוד העסק" (explicit). he.json ONLY (MEH-472). |
| **MEH** | MEH-860 (S7 Chunk D) |

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
| **Heading** | `יש לך עסק? בואו אלינו` |
| **Body (l1)** | `מהמקור הוא הבית של בתי עסק מקומיים בישראל — כל עסק נבחר אישית.` |
| **Body (l2)** | `תקבלו עמוד משלכם: תמונות, סיפור, וקו ישיר ללקוחות.` |
| **Body (l3)** | `חינם, בלי עמלות. נשמח להכיר.` |
| **Previous body** | `מהמקור הוא הבית של בתי עסק מקומיים בישראל. כל עסק כאן נבחר אישית. עמוד מלא, תמונות, סיפור — שלכם. נשמח להכיר.` (MEH-605 single-`body` → 3-line split) |
| **Button** | `הוסיפו את העסק שלך` |
| **i18n keys** | `home.cta.heading` / `home.cta.body_l1` / `home.cta.body_l2` / `home.cta.body_l3` / `home.cta.button` |
| **Status** | ✅ (variant B — MEH-980; ⏳ Sapir veto at merge) |
| **Why** | Variant B leads with what the business gets (own page, direct line to customers) and adds the free/no-commission reassurance. Keeps the "no partial category list" + no-"דירקטורי" rules from MEH-605. |
| **MEH** | MEH-605 → MEH-980 |

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
| 2026-06-05 | MEH-756 | /events S10 copy wave — 12 keys across `events.list.*`, `events.detail.*`, `dashboard.producer.quick_links.add_event.title`, `sweep_tail.event_new.submit`, `experiences.list.cross_link_events` (he+en) | mixed-voice set: `subtitle` `סדנאות, סיורים, ימים פתוחים וטעימות — ישר מהמקור`; feminine-singular `הוסיפי אירוע` / `הגישי חוויה` / `סנן לפי עיר` / `חפשי עיר...` / `טוענת אירועים...` / `טוענת חוויות...` / `טוענת את האירוע...` / `מחפשת… ראי את…`; masculine-imperative outliers `צור קשר עם בית העסק` / `הוסף אירוע` / `פרסם אירוע` | S10-aligned + ADR-014 neutralized: `subtitle` `מה קורה החודש — סוף שבוע אחרי סוף שבוע, ישר מהמקור` / `What's on this month — weekend after weekend, straight from the source` · `add_event` `הוסיפו אירוע` · `submit_experience` `הוסיפו חוויה` / `Add experience` (unified add verb) · `filter_city_label` `חיפוש לפי עיר` / `Search by city` · `filter_city_placeholder` `שם עיר או יישוב` / `City or town name` · `loading_events` `טוענים אירועים...` · `loading_experiences` `טוענים חוויות...` (ellipsis `...` preserved per file convention) · `events.detail.loading` `טוענים את האירוע...` · `events.detail.contact_producer` `יצירת קשר עם בית העסק` (noun phrase — drops masculine imperative) · `dashboard.producer.quick_links.add_event.title` `הוסיפו אירוע` · `sweep_tail.event_new.submit` `פרסמו אירוע` · `experiences.list.cross_link_events` `מחפשים גם אירועים בחוות? כל האירועים והחוויות ביחד ←` / `Also looking for farm events? All events and experiences together ←` (arrow `←` preserved) | ADR-014 HYBRID — UI chrome is gender-neutral. Aligns the /events surfaces to S10 design (MEH-134, Direction A "The Almanac") ahead of the visual port so it stays visual-only. Zero JSX. Zero copy-of-verification (not blocked by MEH-742). EN mirror updates only where HE meaning shifted (subtitle, submit_experience, filter_city_*, cross_link_events); other 7 EN strings already neutral. **Out of scope:** `events.list.empty_*` + eyebrow + per-tab H1 (JSX-dependent — land with MEH-134 port); rest of `sweep_tail.event_new.*` (~30 keys — needs separate extraction probe); `events.list.title` + tab keys + `events.categories.*` (untouched). |
| 2026-06-05 | MEH-752 | /login `auth.login.*` chrome neutralization — 10 keys (he+en) | feminine-singular set (`ברוכה הבאה`, `שמרי עסקים`, `דרגי`, `הוסיפי…`, `הזיני סיסמה`, `הציגי/הסתירי סיסמה`, `מתחברת...`, `נסי שוב`, `הצטרפי →`) + `welcome` was generic `Welcome` | neutralized + S9-aligned: `welcome` `טוב לראות אותך שוב` / `Good to see you again` · `value_save` `שמרו עסקים` · `value_rate` `כתבו ביקורות` / `Write reviews` · `value_publish` `הוסיפו את העסק שלך` (**supersedes MEH-751 row** — was `הוסיפי…` feminine, now neutral; EN unchanged `Add your business`) · `password_required` `הזינו סיסמה` · `password_show/hide` noun phrase `הצגת/הסתרת סיסמה` · `submitting` `רגע, נכנסים…` / `One moment, signing in…` · `generic_error` `…נסו שוב` · `register_cta` `הצטרפו →` (arrow preserved per Linear note — RTL forward convention in this file) | ADR-014 HYBRID — UI chrome is gender-neutral. Aligns /login to S9 design (MEH-131) ahead of the visual port so it stays visual-only. Zero JSX. Zero copy-of-verification (not blocked by MEH-742). EN mirror updates only where HE meaning shifted (welcome / value_rate / submitting); other EN strings were already neutral. |
| 2026-06-05 | MEH-752 | /login `auth.oauth.*` 3 keys (he+en) | `…נסי בעוד דקה` / `…נסי שוב` / `…היכנסי כדי לנהל אותו` | `…נסו בעוד דקה` / `…נסו שוב` / `…היכנסו כדי לנהל אותו` | Same ADR-014 sweep for the OAuth error/conflict strings that surface from `/login`. EN already neutral — no change. |
| 2026-06-05 | MEH-751 | /login `auth.login.value_publish` (he+en) | `פרסמי מטבח ביתי` / `Publish your home kitchen` | `הוסיפי את העסק שלך` / `Add your business` | DNA LOCK violation: "מטבח ביתי" = forbidden home-cook framing (legal-exposure family). Hotfix only; full feminine→neutral sweep of `auth.login.*` deferred to S9 copy wave (ADR-014). **🔁 Superseded 2026-06-05 by MEH-752 — HE value `הוסיפי…` → `הוסיפו…` (neutral plural); EN unchanged.** |
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

- ❌ `יצרן` / `יצרנית` — use "בית עסק" (ישות) / "בעלי עסקים" (גנרי) / "בעלת/בעל עסק" (ספציפיים), per ADR-024
- ❌ "marketplace" / "פלטפורמה" — we are a directory, not a marketplace  
- ❌ `שגיאה התרחשה` — use `משהו השתבש, נסו שוב`
- ❌ מגדר לפי surface (ADR-024): functional=רבים ניטרלי · narrative/warmth=נקבה. אסור: slash · פנייה זכרית לקוראת ("המשתמש שלך")
- ❌ `מוצרים` for food business pages — use `פריטים` or category-specific terms

---

## Customer-centric voice rule (MEH-579, May 14, 2026)

On narrative/warmth surfaces, feminine grammar is necessary but not sufficient. Every line of user-facing
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
messages, onboarding — anywhere a user reads about what Mehamakor offers
her.

**Does NOT apply to:** legal/privacy pages (must say "אנחנו אוספים"),
backoffice/admin tools (technical), first-person founder bio on /about
(intentional "I" voice), and **empty states** — per ADR-014 those follow
the plural / gender-neutral UI voice (גלו / שמרו), NOT the feminine
customer-subject ("she/את") rule. (MEH-872 reconcile — the prior
"empty states" entry in the Applies-to list conflicted with ADR-014.)

**Over-claim guard (also learned MEH-579):** Do not claim platform
authority that doesn't yet exist. ❌ "Verified by Mehamakor trust badge"
when there's no vetting infrastructure. ✅ "Pre-launch conversation with
every business" — what's actually true today.

**Anti-defensive framing:** Avoid answering questions customers don't ask.
"מה אם תיסגרו?" → reframe as "הלקוחות שיגיעו דרככם — שלכם או שלי?" The
answer is identical, but the question matches what's actually in her head.

---

<!-- MEH-872: the duplicate "Customer-centric voice rule" block (formerly here,
     "May 14 2026" no-comma copy) was deleted — it was a verbatim partial of the
     canonical block above. -->

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

## Section 7 — ADR-022 two-tier copy (מאומת / מוצהר)

> Source: MEH-758 (gate 1) · ADR-022 (PR #949 `ea42821`) · strings locked
> 2026-06-06 (S11 FINAL, Sapir). Consumer language is **מאומת / מוצהר only** —
> `מורשה`/`מורשים` is an anti-pattern (BRAND.md §7). Keys created in this PR;
> badge UI consumes them in the S6/S534 port (not rendered yet).

### Registration success — tier trust line
| Field | Value |
|---|---|
| **Current (he)** | `כל בית עסק במהמקור עובר היכרות אישית — זהות, סיפור ושיחה. תג 'מאומת' מתווסף כשמוגש מסמך רישוי או פטור רשמי, ואנחנו בודקות אותו.` |
| **en** | `Every business on Mehamakor goes through a personal introduction — identity, story, and a conversation. A 'Verified' badge is added when an official licensing or exemption document is submitted and we review it.` (⏳ en pending Sapir review) |
| **i18n key** | `auth.register.producer.success.tier_trust` |
| **Status** | 🕐 key-only — pending S7 register port (06A/06B) to render; Sapir closes after mobile smoke |
| **Why** | Replaces the pre-ADR-022 "checks every business" over-claim (which no longer existed verbatim in code). Per-tier honest framing: personal vetting for all; the מאומת badge is document-gated. Source MEH-758 / ADR-022 / S11-FINAL. |

### Verified badge tooltip — license
| Field | Value |
|---|---|
| **Current (he)** | `רישיון הוגש ונבדק בתאריך {date}` |
| **en** | `License submitted and reviewed on {date}` (⏳ en pending Sapir review) |
| **i18n key** | `producer.badge.verified_tooltip_license` |
| **Status** | 🕐 key-only — badge UI port consumes (`{date}` ICU param) |
| **Why** | Tier-1 מאומת evidence line; license variant. Source MEH-758 / ADR-022 / S11-FINAL. |

### Verified badge tooltip — exemption
| Field | Value |
|---|---|
| **Current (he)** | `אישור פטור הוגש ונבדק בתאריך {date}` |
| **en** | `Exemption approval submitted and reviewed on {date}` (⏳ en pending Sapir review) |
| **i18n key** | `producer.badge.verified_tooltip_exemption` |
| **Status** | 🕐 key-only — badge UI port consumes (`{date}` ICU param) |
| **Why** | Tier-1 מאומת evidence line; exemption variant (legally-exempt categories that still filed an official exemption/registration doc). Source MEH-758 / ADR-022 / S11-FINAL. |

### Declared-tier explainer (no badge)
| Field | Value |
|---|---|
| **Current (he)** | `אין תג 'מאומת'? זה לא אומר פחות. חלק מהקטגוריות פטורות מרישיון לפי החוק — אין מסמך להציג, פשוט כי הוא לא נדרש. העסק חתם על הצהרה מחייבת שהוא פועל כדין, ועבר את אותה היכרות אישית כמו כולם.` |
| **en** | `No 'Verified' badge? It doesn't mean less. Some categories are legally exempt from licensing — there's no document to show, simply because none is required. The business signed a binding declaration that it operates lawfully, and went through the same personal introduction as everyone else.` (⏳ en pending Sapir review) |
| **i18n key** | `producer.badge.declared_explainer` |
| **Status** | 🕐 key-only — badge UI port consumes |
| **Why** | template-05 research: absence of a badge needs a **positive** explanation, not silence (Yelp FAQ pattern; Saeedi et al. — relative effect is inherent, only mitigable). Affirms the מוצהר tier without negative labeling. Source MEH-758 / ADR-022 / S11-FINAL. |

### Gate 3 — /terms §5 two-tier (MEH-760)

> Legal surface — `מורשה`/`מורשים` anti-pattern does NOT apply here (ADR-022).
> All five strings: **v1 — pending lawyer (Brief Q1/Q3)**; a lawyer revision is a
> follow-up edit, launch is not blocked on it. en ⏳ pending Sapir review. Section
> heading `terms.sections.verified.title` = `5. אימות ושכבות הצגה` (was `5. עסקים מאומתים`).
> Operator block (`terms.sections.operator`, טופז שנפ / MEH-736) is byte-identical — untouched.

| Key | he | Status |
|---|---|---|
| `terms.sections.verified.intro` (5.1) | `כל בית עסק במהמקור עובר בדיקת קבלה ידנית … ואינה מהווה ערובה … לעמידת בית העסק בכל דין.` | 🕐 v1 — pending lawyer (Brief Q1/Q3) |
| `terms.sections.verified.verified_badge_title` (5.2 h) | `תג ״מאומת״` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.verified_badge_body` (5.2) | `בית עסק שהציג … מסמך רישוי או אישור פטור רשמי … יסומן בתג ״מאומת״ … התג ניתן ללא תשלום.` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.declared_title` (5.3 h) | `בית עסק ״מוצהר״` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.declared_body` (5.3) | `בית עסק הפועל בקטגוריה הפטורה לפי דין … על יסוד הצהרה מחייבת … האחריות … על בית העסק בלבד.` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.indemnity_title` (5.4 h) | `שיפוי` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.indemnity_body` (5.4) | `בית עסק ישפה את מפעילת האתר בגין כל נזק, הוצאה או דרישה … מבלי לגרוע מכל סעד אחר.` | 🕐 v1 — pending lawyer |
| `terms.sections.verified.no_supervision` (5.5) | `אין באמור בסעיף זה כדי להטיל על מפעילת האתר חובת פיקוח מתמשכת על בתי העסק.` | 🕐 v1 — pending lawyer |

**Why:** Brief §3 — the pre-ADR-022 §5 ("בדיקה ראשונית של קריטריוני הפלטפורמה") defined no
verification scope (Q3.1 over-broad representation) and didn't distinguish tiers (Q3.2).
v1 defines exact scope per tier (what IS / is NOT checked), a declaration-only disclaimer for
מוצהר, an indemnity clause (5.4) drafted narrowly to limit תנאי-מקפח exposure (חוק החוזים האחידים),
and a no-ongoing-supervision carve-out (5.5). Locked verbatim by Sapir 2026-06-06; lawyer opinion
outstanding. Source MEH-760 / ADR-022 / Brief Q1+Q3.

### Gate — /about/process page (MEH-534, S11 Direction D, 2026-06-10)

> Standalone editorial page `/about/process` ("תהליך הקבלה"). he = the S11
> copy-table draft locked by Sapir, ported **verbatim** into the `process.*`
> namespace. **en = ⏳ pending Sapir review** (design he-only; MEH-758
> precedent — every `process.*` en value is a draft translation). Tier words
> **מאומת / מוצהר only**. "בית עסק", never "יצרן". Voice ADR-014 hybrid
> (headings/CTA neutral plural; narrative feminine).

| Key | he | Status |
|---|---|---|
| `process.hero.h1` | `כל בית עסק כאן עובר דרכנו — היכרות אישית.` | ✅ **LOCKED verbatim** (gold `<em>` on `היכרות אישית`; stored with `<em>` rich-tag, visible text matches the lock char-for-char) |
| `process.closing.quote` | `אני רוצה לדעת ממי אני קונה. בניתי מקום שבו גם אתם יודעים.` | ✅ **LOCKED verbatim** |
| `process.closing.attrib` | `— ספיר` | ✅ **LOCKED verbatim** |
| `process.hero.eyebrow` / `.sub` | `תהליך הקבלה` / `לפני שעסק עולה לאתר…` | ⏳ draft (Sapir-as-drafted) |
| `process.steps.s1–4.*` + `badge_aside_*` | 4-step process + the "separate optional badge" aside | ⏳ draft (s4 MUST stay separate from badge) |
| `process.everyone.*` | `מה נבדק אצל כל בית עסק` + 3 cards (זהות · סיפור · שיחה) | ⏳ draft |
| `process.badge.oneliner` | `תג "מאומת" אומר דבר אחד… ואנחנו בדקנו אותו.` | ⏳ draft (gold `<em>` on closing clause) |
| `process.badge.absence_h3 / _body / _kicker` | `אין תג מאומת? זה לא אומר פחות` / explainer / `התג מסמן מסמך נוסף — לא אמון נוסף.` | ⏳ draft — **3 separate keys, NOT collapsed** |
| `process.matrix.*` (groupA/B + 16 cats + caveat) | published criteria matrix by category | ⏳ draft (honey = 3-license row; candles = `מוצהר`-only, no badge path) |
| `process.cta.*` | `יש לך בית עסק שמגיע לו בית?` + `ספרו לנו על העסק` → `/register/producer` | ⏳ draft |
| `process.tier.verified` / `.declared` | `מאומת` / `מוצהר` | ⏳ draft (tag labels, page-wide) |
| `process.crosslink_from_about` | `כך אנחנו מכירות כל בית עסק` (/about → /about/process link) | ⏳ draft |
| `nav.footer.process` | `תהליך הקבלה` (footer nav link — only non-`process.*` key added) | ⏳ draft |

**Reused (not recreated):** the illustrative badge tooltip uses the existing
`producer.badge.verified_tooltip_license` (`{date}` → literal `5.6.2026` here).

**Cross-ref:** `process.badge.absence_body` mirrors the tier-2 framing of
`producer.badge.declared_explainer` — **sync if the tier-2 wording changes
(lawyer/ADR-022).** Kept as a separate string (not a shared key) so the page's
editorial voice can diverge from the per-producer badge surface; the two must
stay semantically aligned on the "exempt ≠ less trustworthy" message.

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

---

## Section 8 — Testimonials (intake guardrail)

> **Source:** Template 10 (`docs/templates/10-testimonial-intake.md`). Process rule for converting a real message into an on-site testimonial — not copy strings, a guardrail every testimonial must pass.

### Hard rules (every testimonial, no exceptions)

1. **Only what actually happened** — zero invented or rounded numbers/stats.
2. **Quote stays verbatim** — trim for length only (mark cuts `[…]`); never reword, never fix grammar.
3. **Speaker approval** on final wording + name/business/city before publish. No approval → not published (`DRAFT`).
4. **Licensed-business framing only** — never imply home-cooking.

### Voice — ADR-024 HYBRID (refines ADR-014)

| Part | Rule |
| -- | -- |
| The quote | Exempt — verbatim, no voice rules applied |
| Editorial framing | Feminine allowed (reader-address) · brand-we plural |
| UI chrome (button/link) | gerund/plural, never feminine |
| Attribution noun (ADR-024) | `בית העסק` (entity) · `בעלת עסק` (woman) · `בעל עסק` (man) — never `יצרן`/`יצרנית` |

**Forbidden in any testimonial surface:** `יצרן`/`יצרנית` · `אוכל ביתי`/`שכנות מבשלות`/`מהמטבח של השכן` · `marketplace` · `מגזין`. **Zero emoji** in testimonial copy (Emoji LOCK v2).

### Status

🕐 Guardrail only — no testimonial copy locked yet. Each published testimonial gets its own row here (quote · attribution · i18n key · speaker-approval date) when it goes live.

---

## Section 9 — /join landing (MEH-995, positioning-FINAL)

> **Source:** MEH-995 §positioning-FINAL (locked in-ticket after 5 design rounds) + Sapir-approved drafts (session 2026-07-07). /join applies existing brand rules — no new brand decision (BRAND.md §8 untouched by design). All keys under `join.*` + `seo.join.*` (he + en twins, MEH-978/840).

### Hero
| Field | Value |
|---|---|
| **Eyebrow** | `לבתי עסק מקומיים` — aligned with the approved footer tagline; zero partial-category |
| **H1** | `העסק שלכם. עמוד משלו.` — why-first, editorial through what-you-get |
| **Subhead** | `עמוד עם התמונות והסיפור שלכם, כל עסק נבחר אישית, ופנייה ישירה ב-WhatsApp — לקוחות מקומיים פוגשים את הסיפור שלכם.` — carries the softened editorial line; the discovery variant ("לקוחות שמחפשים בדיוק מה שאתם מכינים") is **forbidden** (marketplace framing) |
| **CTA** | `מצטרפים` → `/register/producer` — the page's single CTA |
| **Trust hint** | `חינם להצטרף` — NOT "חינם לעולם"; zero premium mention anywhere on the page (MEH-617 model undecided) |
| **i18n keys** | `join.eyebrow` · `join.h1` · `join.subhead` · `join.cta` · `join.trust_hint` |
| **Status** | ⏳ MEH-995 |

### How it works (4 steps)
| Step | Title | Body | Derived from |
|---|---|---|---|
| 01 | `נרשמים` | `טופס קצר על העסק — סיפור, תמונות ופרטי קשר. בערך 10 דקות.` | MEH-994b locked duration |
| 02 | `שיחה אישית` | `הצוות שלנו יוצר קשר לשיחה קצרה — היכרות עם העסק והסיפור.` | MEH-994 after_body |
| 03 | `העמוד עולה` | `בדרך כלל תוך יום-יומיים העסק שלכם מופיע באתר.` | chat.py approval timeframe |
| 04 | `לקוחות פונים ישירות` | `כפתור WhatsApp בעמוד פותח שיחה ישירה אתכם. הקשר והתשלום — ביניכם ובין הלקוחות בלבד.` | MEH-1003 neutral no-fees copy (avoids forbidden "מתווכים") |

Keys: `join.how.*`. Link out: `לתהליך הקבלה המלא` → `/about/process`.

### Checklist / card / FAQ teaser
| Field | Value |
|---|---|
| **Checklist** | mirrors the MEH-994 pre-flight items verbatim (`join.prepare.*`) — keep the two surfaces in sync on any copy change |
| **Card title** | `כל בית עסק עובר שיחה אישית` — positive framing; definition-by-negation ("לא בירוקרטיה") is **forbidden** |
| **Card body** | `כל בית עסק במהמקור עובר היכרות אישית — זהות, סיפור ושיחה. כך כל עמוד באתר נשאר אמין ואישי.` — extends the approved `success.tier_trust` |
| **FAQ Q/A** | `כמה זה עולה?` → `חינם להצטרף ולהופיע. אין עמלות על עסקאות — לעולם.` — the no-fees LOCK lives HERE (Etsy pattern), never in the headline. Link: `לכל השאלות` → `/about/for-businesses` |
| **Status** | ⏳ MEH-995 |

### Testimonial slot — placeholder ONLY (Section 8 guardrail applies)
The slot renders a self-describing placeholder (`join.testimonial.*`): `כאן תופיע עדות אמיתית של בעלת עסק — מילה במילה, באישורה.` + eyebrow `בקרוב — עדות ראשונה`. **Do NOT replace with invented business copy** — the real quote arrives via Template 10 verbatim intake (MEH-931) pre-launch and gets its own Section-8 row.
