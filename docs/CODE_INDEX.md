# אינדקס הקוד — שורה אחת לכל מודול

**לפני שכותבים helper, רכיב, כרטיס או service — מחפשים כאן.** כל שורה היא קובץ קוד אחד והשורה הראשונה מהכותרת שלו (שדה `Purpose:` של כותרת §14 ב-`.claude/rules/code-execution.md`, או המשפט הראשון של הכותרת). מחפשים במילה (`grep -i "date\|תאריך" docs/CODE_INDEX.md`), לא בשם קובץ משוער.

**הטבלאות נוצרות מהקוד ולא נכתבות ביד** (MEH-3604). ‏`tests/test_meh3604_code_index.py` נכשל כשנוסף, נמחק או שונה תיאור של מודול בלי לחדש, וכשקובץ חדש נכנס בלי כותרת. לחידוש:

```
UPDATE_CODE_INDEX=1 pytest tests/test_meh3604_code_index.py
```

**מה האינדקס לא אומר:** שהתיאור נכון. הוא מעתיק את מה שהקובץ אומר על עצמו; כותרת ישנה נשארת ישנה כאן. עמודים (`page`, `layout`, ‏`route`) לא כאן — הם ב-`docs/FEATURES.md` «route inventory». רכיבי `components/ui/` מופיעים כאן וגם בטבלת הבעלים ב-`frontend/components/CLAUDE.md`, שהיא שאומרת **איזה** מהם להשתמש. קבצים בלי כותרת היום רשומים ב-`scripts/checks/code-index-no-header-baseline.txt`, שרק מתקצר.

רשימת כל הרשימות בריפו (עמודים, API, טבלאות, סטטוסים, משתני סביבה, משימות, הודעות, רכיבים): `docs/ARCHITECTURE.md` §5.

<!-- BEGIN GENERATED: code-index (tests/test_meh3604_code_index.py) -->

### שרת — `backend/app`

| קובץ | מה הוא עושה (מהכותרת) |
|---|---|
| `allergens.py` | Product allergen codes (MEH-2662). |
| `auth.py` | — אין כותרת — |
| `body_limit.py` | No request body above MAX_BODY_BYTES enters the app. A declared Content-Length above the cap is answered 413 before a byte is read; … |
| `cloudinary_utils.py` | Cloudinary helpers for orphan-image cleanup (MEH-375). |
| `config.py` | — אין כותרת — |
| `constants.py` | Shared cross-cutting constants used by multiple services / routers. Single source of truth for category-name lists and format regexes that the frontend … |
| `data/cities.py` | Static Israeli city + neighborhood fallback list (~100 entries) used by GET /cities ONLY while the cities table is unseeded (MEH-1349 baseline, demoted to … |
| `data_ownership.py` | Machine-readable half of the data-ownership registry — the set of Producer fields whose OWNER write path was deliberately closed, so a later change cannot … |
| `database.py` | — אין כותרת — |
| `db_bulkhead.py` | Keep the server answering under a burst: at most N requests run inside the app at once; … |
| `limits.py` | The one place that says how much of each thing a business (or a request) may hold. … |
| `logging_config.py` | — אין כותרת — |
| `main.py` | — אין כותרת — |
| `middleware.py` | — אין כותרת — |
| `models/__init__.py` | — אין כותרת — |
| `models/admin_ops.py` | Rows the admin side runs on: outreach leads, phone OTP tokens, requests awaiting a decision (kashrut badge, category, name change), inbound and outbound … |
| `models/admin_passkeys.py` | Where an admin account's second factor lives: its registered passkeys (WebAuthn credentials) and its one-time recovery codes. |
| `models/analytics.py` | Counters and daily rollups: page views, contact and WhatsApp clicks, per-day analytics. |
| `models/billing.py` | The 'billable_events' table — one row per booking a business got through the site (ADR-042), kept so the count survives after the booking itself is purged or … |
| `models/catalog.py` | What a business sells and where: products, delivery areas, locations (branches and sale points) and offers. |
| `models/email_outbox.py` | One email the site owes someone, written in the same transaction as the thing that caused it (a business approved, a sign-up taken), so a deploy, a crash or a … |
| `models/engagement.py` | What visitors do with a business page: favourites, saved items, alerts, delivery waitlist, reviews, newsletter, contact messages, reports, search queries. |
| `models/events.py` | Events, workshops (experiences), their registrations and group buys. |
| `models/home_products.py` | Home-kitchen products posted by neighbours, their WhatsApp clicks and ratings. |
| `models/models.py` | The core tables every other model module points at: City, Producer, User, RetiredSlug, AdminSetting, StaticPage, Category, ProducerCategory. |
| `models/product_orders.py` | The tables behind on-site ordering («בקשת הזמנה»): a business's ordering settings, an order, its lines, and the log of its status changes. |
| `models/recipes.py` | Recipes a business publishes on its page, and their moderation state. |
| `models/rescue.py` | The rescue-bags pilot: offers, orders, reviews and the typical items a business lists for its bags. |
| `pricing.py` | The server's copy of the price list (ADR-042) and the two fee calculations the billing ledger needs. Money is in agorot, as ints. |
| `rate_limit.py` | Shared rate limiter instance used across all routers. |
| `router_registry.py` | — אין כותרת — |
| `routers/admin.py` | — אין כותרת — |
| `routers/admin_checklist.py` | MEH-1399 Phase 2 — the pre-approval review checklist as data. Serves the editable item list and records which items an admin ticked for a given producer, with … |
| `routers/admin_decisions.py` | The admin review decisions under /admin/producers: the pending queue, approve, reject (with presets), request changes, and the verified badge, plus the two … |
| `routers/admin_experiences.py` | Admin moderation routes for experiences (community workshops). |
| `routers/admin_extra.py` | Extended admin endpoints for the full dashboard: users management, content (categories + static pages), analytics, settings. |
| `routers/admin_kashrut.py` | MEH-51: Admin endpoints for kashrut badge review + ambassador toggle. |
| `routers/admin_outreach.py` | Admin outreach lead management (MEH-22). |
| `routers/admin_passkey.py` | An admin account's passkeys: add one, list them, remove one, new recovery codes, and the second step of signing in (a passkey, or a recovery code when the … |
| `routers/admin_producer_locations.py` | Admin CRUD for one business's locations (branch / pickup / market_stand) under /admin/producers/{producer_id}/locations, so an admin who builds a page on the … |
| `routers/admin_product_import.py` | The admin imports a business's catalog as DRAFTS, reviews them, and approves them (in the owner's place, Sapir 16.11) or deletes them. |
| `routers/admin_product_organize.py` | The admin sorts a business's products into groups and sets their order, drafts included, so a page built on the owner's behalf is complete before it is … |
| `routers/admin_recipes.py` | Admin moderation queue + three terminal actions for producer recipes (MEH-589 chunk 2/4). |
| `routers/admin_test_business.py` | The admin's «עסק בדיקה — מוסתר מהאתר» switch: marks a business as a seeded test row ('producers.is_test'), which hides it from every listing (list, search, … |
| `routers/admin_whatsapp.py` | Admin-only read view of outbound WhatsApp messages that did NOT reach the recipient — 'failed' (Meta-side error) and 'window_expired' (24h customer-service … |
| `routers/alerts.py` | MEH-54: Favorite alert preferences + push notification triggers. |
| `routers/auth.py` | — אין כותרת — |
| `routers/auth_google_code.py` | POST /auth/google/code — our own Google button's one server step: swap the code from Google's popup for a verified Google ID token. |
| `routers/auth_register_producer.py` | The two routes that create a business account: POST /auth/register/producer (email and password, or an upgrade of a signed-in consumer) and POST … |
| `routers/billing.py` | Read-only billing summaries (MEH-3181): a business sees what it got through the site this month; the admin sees who passed the results threshold. … |
| `routers/business_suggestions.py` | Let a visitor suggest a business that is not on Mehamakor yet, and turn that suggestion into an ordinary outreach lead the team works by hand. … |
| `routers/category_requests.py` | MEH-141: Category request flow — public submit + admin review. |
| `routers/chat.py` | Chat assistant router — answers questions about mehamakor.co.il via Claude. |
| `routers/cities.py` | MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table. … |
| `routers/events.py` | Events feature — sits on top of producers. |
| `routers/experiences.py` | Public + authenticated routes for the experiences (community workshops) feature. |
| `routers/favorites.py` | — אין כותרת — |
| `routers/form_fill.py` | One route for every «fill the form from text» box on the owner dashboard (MEH-3740): POST /producers/me/ai-fill/{form} returns a draft of that form. … |
| `routers/google_rating.py` | Serve the quiet public "Google rating" trust line for a producer — live star rating + review count fetched per-request from Google, only for producers an … |
| `routers/group_buy_capacity.py` | The MEH-3592 group-buy routes: a participant changes her quantity, a visitor joins or leaves the waitlist of a full group, and the business changes its caps … |
| `routers/group_buy_mine.py` | «הקבוצות שלי» (MEH-3609): the signed-in person's own group buys, so she can get back to one without the email link. |
| `routers/group_buys.py` | MEH-52: Group buy endpoints — commit counter + price unlock. |
| `routers/health.py` | Health endpoints — MEH-483. |
| `routers/holiday_mode.py` | — אין כותרת — |
| `routers/marketing.py` | Marketing-facing endpoints: homepage stats, newsletter signup, contact form. |
| `routers/menu_import.py` | The owner uploads a menu (photos or a PDF), gets product rows back to review, and publishes the rows she approved. MEH-3430. |
| `routers/organizers.py` | The public face of a markets / events organizer (kind='organizer', ADR-036): its page (/organizers/{slug}) and the slug list the sitemap reads. … |
| `routers/page_fill.py` | «ספרו לנו על העסק» (MEH-3483): the owner (or the admin, for a business) sends free text and gets a draft of the page fields back. |
| `routers/page_freshness.py` | POST /page-freshness/confirm — the «כן, הכול נכון» button behind the monthly email. … |
| `routers/producer_claim.py` | Owner-claim link — an admin prepares a DRAFT business with no owner, sends its owner a signed link, and she takes it over with her OWN account and her own … |
| `routers/producer_draft_preview.py` | The two steps between "the admin built a draft page for a business" and "the page is live because its owner said yes" (MEH-3377): a read-only preview link the … |
| `routers/producer_google_profile.py` | The owner's «הפרופיל שלכם בגוגל» tool (MEH-3641): see whether her business is linked to its Google profile, search for it, link or unlink it, and check that … |
| `routers/producer_me.py` | — אין כותרת — |
| `routers/producer_me_analytics.py` | The owner's own traffic numbers under /producers/me/analytics: views, WhatsApp clicks and favourites per window, measured on the Israel calendar day. |
| `routers/producer_me_locations.py` | The owner's branches and sale points under /producers/me/locations: list, add, edit (which also sets the primary), delete. |
| `routers/producer_me_review.py` | The steps that put an owner's page in front of an admin, under /producers/me: WhatsApp phone verification (OTP), the kashrut certificate request, the … |
| `routers/producer_me_weekly_summary.py` | Lets a business turn the weekly summary email back on after it was stopped (MEH-3212). … |
| `routers/producer_name_check.py` | Tell the registration form whether a LIVE business already carries the name being typed, so its owner asks for the existing page instead of opening a second … |
| `routers/producer_name_requests.py` | The re-moderated route for changing a business name — owner files a request, the public name holds still, an admin approves or rejects. |
| `routers/producer_owner_detach.py` | Admin «ניתוק בעלים» — unlink a business from its current owner's account so the business can be handed to a new owner (a sale, a change of who runs it). … |
| `routers/producer_owner_invite.py` | Owner invite — an admin builds a business's page end to end, after written consent from its owner, then hands it over: a one-time link on which the owner sets … |
| `routers/producer_owner_invite_existing.py` | Accept an owner invite on an account that ALREADY EXISTS (MEH-3256, grill retro D8). … |
| `routers/producer_recipes.py` | Producer-self CRUD + public read for producer-owned recipes (MEH-589 chunk 2/4 of the producer-recipes epic). |
| `routers/producers.py` | — אין כותרת — |
| `routers/product_describe.py` | «הצעת תיאור» (MEH-3479): Claude suggests a short description for one product; the owner (or the admin, in her place) edits it in the form and only the product … |
| `routers/product_order_business.py` | The business's side of on-site ordering: list the orders sent to it, and act on one — confirm, decline, propose a change, mark ready, hand over, report a … |
| `routers/product_order_buyer.py` | The buyer's side of on-site ordering: ask for a phone code, send an order, read its status, cancel it, accept a change the business proposed, and list one's … |
| `routers/product_order_offer.py` | What a business offers for on-site ordering: the owner sets her weekly windows and each product's ordering fields, and anyone can read the resulting order … |
| `routers/product_orders.py` | A business's on-site ordering settings: the owner reads and saves them, and an admin marks a business as licensed to sell alcohol. |
| `routers/product_organize.py` | The owner sets the order of her products and sorts them into groups (MEH-3055) — the two things the public page then shows as "her order" and as group chips. |
| `routers/product_variants.py` | The owner (or an admin) replaces one product's list of sizes or flavours, in the order the page shows them. |
| `routers/registrations.py` | MEH-2763 — on-site sign-ups for events and experiences («איך נרשמים?» = טופס הרשמה באתר). |
| `routers/report_info.py` | "מצאתן טעות בפרטים?" — let a visitor report wrong info on a producer page. v1 emails the admin; no DB row, no auth (MEH-1443). |
| `routers/reports.py` | — אין כותרת — |
| `routers/rescue.py` | The rescue-bags pilot API — a business publishes today's or tomorrow's bags (MEH-3702), a buyer reserves one and gets a 4-digit code, the business marks it … |
| `routers/rescue_pilot.py` | Tell the business, before the publish form, which of its pickup points are in a town the rescue-bags pilot is open in (MEH-2921 c). |
| `routers/review_reply_suggest.py` | «הצעת תשובה» (MEH-3480): Claude drafts a short reply from the business to one review; the owner edits it in the reply box and only her own «שמירה» sends it. |
| `routers/reviews.py` | Producer reviews (1-5 stars + optional body, 10-500 chars). |
| `routers/saved_items.py` | MEH-2557 — save recipes, events and experiences to «המועדפים שלי». |
| `routers/search.py` | Smart-search endpoint for the hero autocomplete + /search results page (MEH-13). |
| `routers/system.py` | — אין כותרת — |
| `routers/upload.py` | Image upload endpoint. |
| `routers/users_me.py` | User self-service endpoints (MEH-16). |
| `routers/whatsapp_webhook.py` | Meta WhatsApp Cloud API webhook receiver — GET verification challenge + POST inbound-message persistence + outbound-status reconciliation, all gated by … |
| `schemas/__init__.py` | Load schemas.py first: its sibling modules import the shared validators from it, and it re-exports them at its bottom (MEH-3270). |
| `schemas/admin_block.py` | Admin moderation switches on a user or a business. |
| `schemas/admin_passkey.py` | Request and response shapes of the admin passkey routes (MEH-3305). |
| `schemas/admin_review.py` | Admin review inputs and outputs: kashrut requests and reminders, checklist, review checks, approve / reject / request-changes bodies. |
| `schemas/billing.py` | Response shapes for the billing summary routes (MEH-3181). |
| `schemas/catalog.py` | Categories, cities, delivery areas, locations, offers and products as the API reads and writes them. |
| `schemas/community.py` | Users, favourites and reports. |
| `schemas/delivery_time.py` | One rule for «מגיע תוך 3–5 ימי עסקים» wherever it is stored (the business, a delivery zone — MEH-3511): whole business days within bounds, and the shorter end … |
| `schemas/events.py` | Events, organisers and the event filters. |
| `schemas/experiences.py` | Workshops (experiences) and their registrations. |
| `schemas/form_fill.py` | The shared «fill the form from text» route (MEH-3740): the owner's free text in, a draft of one dashboard form out. Nothing is saved. |
| `schemas/google_profile.py` | Response shapes for the owner's «הפרופיל שלכם בגוגל» tool (MEH-3641). |
| `schemas/group_buy_counts.py` | The public per-status count behind the /group-buys status tabs, so a tab with nothing in it is not drawn (MEH-3128). |
| `schemas/group_buy_mine.py` | «הקבוצות שלי» — one row per group buy the signed-in person joined (MEH-3609), enough to list it and open its page. |
| `schemas/group_buys_requests.py` | Group buys, category requests and business name-change requests. |
| `schemas/menu_import.py` | The menu reader's rows (what the owner reviews) and the publish body (what the owner approved). MEH-3430. |
| `schemas/order_cutoff.py` | One rule for «מזמינים עד יום X בשעה HH:MM» wherever a row carries its own cutoff (a pickup point, MEH-3512; … |
| `schemas/owner_detach.py` | Request body for the admin's «ניתוק בעלים» (MEH-3256, grill retro D9). |
| `schemas/owner_invite_existing.py` | Request bodies for accepting an owner invite on an account that already exists (MEH-3256, grill retro D8). |
| `schemas/page_fill.py` | «ספרו לנו על העסק» (MEH-3483): the owner's free text in, a draft of the business-page fields out. Nothing is saved by the read. |
| `schemas/password.py` | MEH-305 — Pydantic password field type. |
| `schemas/producer.py` | The business page, write side: create, admin create, owner update, admin update, plus AVAILABILITY_STATES and normalize_google_place_id, which services import. |
| `schemas/producer_out.py` | The business page, read side: list card, detail, admin and owner views, kashrut certificate ref, Google place id and rating. |
| `schemas/product_describe.py` | The request and answer of «הצעת תיאור» (MEH-3479). Every string is capped; nothing here is stored. |
| `schemas/product_order_buy.py` | Request/response shapes for an on-site order: asking for a phone code, sending the order, the buyer's status view, and what a business sends when it acts on … |
| `schemas/product_order_offer.py` | Request/response shapes for what a business offers for on-site ordering: its weekly windows, a product's ordering fields, and the public order menu. |
| `schemas/product_orders.py` | Request/response shapes for a business's on-site ordering settings. |
| `schemas/product_organize.py` | Request bodies for the owner's product order and product groups (MEH-3055). Every list is capped (MEH-3022) and every refusal is Hebrew. |
| `schemas/product_variants.py` | The shapes of a product's sizes or flavours: what the owner sends (the whole list, in her order) and what every read returns. |
| `schemas/recipes_outreach.py` | Business recipes, outreach leads and the public suggest-a- business form. |
| `schemas/registration.py` | Request and response shapes for sign-up, login, OAuth, password reset, the owner-claim link and the owner invite. |
| `schemas/rescue.py` | Request/response shapes for the rescue-bags pilot — what a business sends to publish a bag, what a buyer sends to reserve one, and what the three tables … |
| `schemas/review_reply_suggest.py` | The answer of POST /reviews/{id}/reply/suggest (MEH-3480). |
| `schemas/reviews.py` | Reviews, review invites, owner replies and listing removal. |
| `schemas/schemas.py` | — אין כותרת — |
| `schemas/site.py` | Everything else the site sends or receives: users admin, static pages, profile, search, alerts, chat, stats, newsletter, contact, click tracking, delivery … |
| `sentry.py` | MEH-500: backend Sentry SDK init. |
| `services/account_guards.py` | MEH-3248 — who may be deleted, and through which door. |
| `services/admin_audit.py` | One append-only row for every successful change an admin makes: who, what (method + route template), on what, when, from where. |
| `services/admin_dashboard.py` | The numbers behind the admin home ('GET /admin/dashboard') and the admin analytics page ('GET /admin/analytics'). |
| `services/admin_draft_missing.py` | For a draft its owner has claimed («נקלט, בהשלמה»), say what is still missing before she can send it for review, so the admin's follow-up call is about one … |
| `services/admin_passkey.py` | The second factor of an admin account: a passkey (WebAuthn) checked after the password or Google / Apple sign-in, and ten one-time recovery codes for a lost … |
| `services/admin_pending_reminder.py` | Once a morning, email the admin a list of the businesses that have waited for approval 2 business days or more. The owner was told «תשובה עד 3 ימי עסקים»; … |
| `services/admin_producer_emails.py` | Text and HTML bodies of the emails an admin decision sends to a business owner: approved, rejected, changes requested. |
| `services/admin_producer_reads.py` | What the admin business screens READ: the business list with its queue order and per-row enrichment, one business, the licence-expiry list and the … |
| `services/admin_settings.py` | Read and write the admin toggles kept in 'admin_settings' ('GET/PUT /admin/settings', 'GET/POST /admin/settings/vacation'). |
| `services/ai_budget.py` | One site-wide daily ceiling on paid AI calls, per model tier (MEH-3498). Above it every generation tool answers as if the key were missing: the chat gives its … |
| `services/ai_text.py` | One short plain-text answer from Claude, and the claim filter, for the owner-side suggestions: a product description (MEH-3479) and a review-reply draft … |
| `services/analytics.py` | Analytics tracking + metrics helpers for feature/producer-analytics. |
| `services/analytics_rollup.py` | Roll the raw producer analytics rows ('producer_page_views', 'producer_whatsapp_clicks') up into one anonymous row per (business, Israel day) in … |
| `services/approved_edit_moderation.py` | MEH-3261 — once a business is approved its public text and photos go live with no review. … |
| `services/auth_emails.py` | Email senders for the auth flows. |
| `services/auth_notifications.py` | WhatsApp + email notifications for the producer-registration flow, plus the admin-facing recipe-submission ping (MEH-1000) that reuses the same admin channel … |
| `services/auto_reply_watchdog.py` | Periodic scan of recent inbound WhatsApp messages; auto-replies when outside business hours or vacation mode is active. |
| `services/availability_validation.py` | Server-side guards shared by every availability_state write path — value membership, the allowed-transition matrix, and the vacation return-date rules … |
| `services/billing_ledger.py` | Write the billable-events ledger: one row when a business gets a booking through the site, and a void when that booking is cancelled in time. … |
| `services/billing_start_signal.py` | On the 1st of each month, read the month that just ended and email the admin «הגיע הזמן» when enough businesses were over the paid threshold enough months in … |
| `services/billing_summary.py` | Read the billable-events ledger: what one business got through the site in a month, and — for the admin — which businesses passed the results threshold and … |
| `services/bio_generator.py` | AI description writer for producer profiles (MEH-56; MEH-1173). |
| `services/booking_cancellations.py` | When bookings stop being real, cancel them and tell the people who made them (D1 of the 14/11 grill retro, MEH-3227): 1. … |
| `services/capabilities.py` | The one place that answers "what may this business do?" — so no route reads 'producer.plan' or a billing column on its own. … |
| `services/category_slug.py` | Produce the stable ASCII identity for a category row, server-side, so 'categories.slug' can be NOT NULL without any writer having to remember it. |
| `services/chat_business_context.py` | The facts the site chat answers from when a question names ONE business (MEH-3481). … |
| `services/chat_business_extras.py` | The business-page facts added after the chat first learned a business (MEH-3510): delivery zones with several days per city (MEH-3484), the next delivery date … |
| `services/chat_db_tools.py` | Four bounded, parametrized, read-only Postgres queries the site chat can run to answer live-data questions (counts, producers by category/city, site stats, … |
| `services/chat_feature_coverage.py` | For every tool in frontend/lib/business-features.js, say whether the site chat's knowledge covers it — so a new tool cannot ship while the chat still answers … |
| `services/chat_intent_router.py` | Decide, per user message, whether the site chat should answer from live data (one of four bounded DB tools) or from the fixed system-prompt knowledge. … |
| `services/chat_site_knowledge.py` | The prompt paragraph that tells the AI assistant which tools a business gets — built from the site's own tool registry, not written by hand, so a new tool … |
| `services/city_centroid.py` | Answer "where is this town?" from the seeded 'cities' table, so a business that gave only a town (no street address) still gets a usable, approximate map … |
| `services/content_notifications.py` | Email notifications for recipe and kashrut moderation, and for reviews. |
| `services/date_rules.py` | One rule for "an event or experience date may not be in the past" (D6 of the 14/11 grill retro, MEH-3224), read by both routers. |
| `services/delivery_validation.py` | Guard the MEH-1255 delivery-exclusion invariant on PATCH-style producer updates: an exclusion list ("לכל הארץ חוץ מ:") is only legal while delivery_nationwide … |
| `services/delivery_waitlist.py` | The one owner of the waitlist's two writes — adding an entry (POST /producers/{id}/delivery-waitlist, routers/producers.py) and the once-only email fan-out … |
| `services/delivery_zones.py` | Write a business's named delivery zones and copy each zone's days, minimum, fee and free-delivery threshold onto the delivery_areas rows of its cities. |
| `services/description_writer.py` | Suggest a short Hebrew description for one product from what the owner already typed (name, group, price, current description). … |
| `services/draft_preview.py` | The signed token behind a draft business's read-only preview link (MEH-3377): mint and decode, nothing else. |
| `services/email.py` | Email delivery via Resend HTTP API. |
| `services/email_branding.py` | The brand header shared by every HTML email (MEH-2834 PR 2). |
| `services/email_change_guard.py` | The password gate on an account-email change (PATCH /users/me): a per-ACCOUNT cap on wrong passwords, and the messages for an account that has no password at … |
| `services/email_layout.py` | The ONE branded frame every email is sent in (MEH-3587). Logo on the public origin, white card on the site's warm background, RTL, viewport, the green heading … |
| `services/email_outbox.py` | The durable email queue. A caller writes the email with 'enqueue_email' in the same transaction as the thing that caused it; … |
| `services/experience_moderation.py` | AI pre-moderation for community-submitted experiences. |
| `services/experience_notifications.py` | Email notifications for the experiences moderation flow. |
| `services/experience_sessions.py` | MEH-3441 (stage 2 of MEH-3264) — a recurring workshop's dates. An owner lists dates (date + time); … |
| `services/farmer_declaration.py` | Server-side gate + record for the grower declaration («גידלתי בחלקתי בלבד») at producer registration, apart from the licensing declaration (declared_at / … |
| `services/form_fill_windows.py` | The hand-over windows of an order-setup draft (MEH-3752): keep a window only when the text names its day and states its hours (a clock time, an hour number, … |
| `services/form_filler.py` | The shared «fill the form from text» engine (MEH-3740): an owner pastes free text and gets a DRAFT of one dashboard form back. … |
| `services/gallery_cap.py` | The free-plan cap on a business's GALLERY (3 photos), enforced where the gallery is written (PUT /producers/me 'images'). |
| `services/google_code_exchange.py` | Swap the one-time authorization code from our own Google button (GIS code client, popup, redirect_uri "postmessage") for a Google-signed ID token, and accept … |
| `services/google_profile.py` | The owner's «הפרופיל שלכם בגוגל» tool: search Google for her own profile, decide whether a picked profile is hers (name or phone matches the business), and … |
| `services/group_buy_capacity.py` | What a group buy may still take — people, units, an open/closed switch — and who is told when a place frees (MEH-3592). |
| `services/group_buy_delist.py` | When an admin takes a business off the site, cancel its live group buys and tell their participants (MEH-2498). |
| `services/group_buy_expiry.py` | Close every open group buy whose deadline passed below its minimum, and tell each participant it is not going ahead (MEH-3287). |
| `services/group_buy_goal_flap.py` | A funded group buy can drop below its minimum when someone leaves, and then cross it again. … |
| `services/group_buy_notifications.py` | Tell both sides that a group buy reached its goal — the business that it is funded and by how many participants, each participant that they should reach out … |
| `services/group_buy_pickup_place.py` | The branch a group buy is picked up from (MEH-3610): check that a chosen branch is the business's own, and render it as public as the business made it. |
| `services/group_buy_pickup_reminder.py` | The reminder before pickup (MEH-3610): once per funded group buy, the evening before its pickup window, each participant gets the time, the place and the notes. |
| `services/group_buy_pickup_text.py` | The pickup / delivery lines a group-buy email carries («מועד איסוף: יום שישי 4.12, 09:00–13:00»), in Israel time. |
| `services/group_suggester.py` | Suggest product groups for a business's ungrouped products with Claude, from their names. … |
| `services/hebrew_calendar.py` | The Israeli days of rest (Shabbat and the festival days) and the wall-clock windows around them, computed from the Hebrew calendar for any year, so nobody … |
| `services/image_ownership.py` | A user may store only Cloudinary photos SHE uploaded. Uploads land in a per-uploader folder ('mehamakor/u/<owner_key>/'); … |
| `services/image_refs.py` | Answer "does any row still use this Cloudinary asset?" so a cleanup never destroys a photo another business (or user) still shows. |
| `services/indexnow.py` | Tell Bing (and every IndexNow engine) within seconds that a public page on mehamakor.co.il appeared, changed or disappeared. … |
| `services/invite_gate.py` | An owner invite goes out only for a page that could have been approved: at least one photo. … |
| `services/job_heartbeat.py` | Give every APScheduler job a Sentry Crons heartbeat. When a job stops running (the scheduler did not start after a deploy, the thread died, a run hangs), … |
| `services/job_staleness.py` | Free replacement for the Sentry cron monitors the $0 plan does not allow. Every @heartbeat job records its last successful run; … |
| `services/kashrut_cert_proxy.py` | Decide which kashrut certificates a public page may show, and stream one of them from Cloudinary without ever handing out its address. |
| `services/license_validation.py` | Single source of truth for the conditional-required check on 'producer_license_number'. … |
| `services/menu_reader.py` | Read a business's menu / price list (photos or a PDF) with Claude and return product ROWS for the owner to review. Nothing is saved here. |
| `services/moderation_common.py` | The parts the AI pre-moderation services share: building the Anthropic client, reading the JSON verdict out of a reply, and the fast-model call with its … |
| `services/moderation_fail_open.py` | MEH-2352: make a moderation fail-open visible. |
| `services/moderation_prompt.py` | MEH-2350: wrap user-submitted text as data before it reaches a moderator. |
| `services/moderation_schemas.py` | MEH-2351: JSON schemas for the moderation calls' structured outputs. |
| `services/newsletter_sync.py` | Mirror newsletter subscribers into Resend Contacts (MEH-2611). |
| `services/oauth_verifiers.py` | OAuth provider verification + Google avatar re-host. |
| `services/onboarding_followup.py` | Daily-scheduler entry point for the 4 onboarding follow-up emails (Day 2 / 5 / 10 / 30 after producer registration). … |
| `services/ops_alert.py` | Send a technical alert (a job that stopped running, pages nobody confirmed) to Sentry as one tagged warning, where the daily Claude check reads it, instead of … |
| `services/outbound_guard.py` | Outside production, no message reaches a real person. Every channel that can reach a person asks this module first, so the protection comes from the … |
| `services/outreach_lead_registration.py` | Mark an outreach lead «registered» when its owner signs up through the lead's prefill link (MEH-3026 F11) — until now the pipeline status never moved, so the … |
| `services/owner_attention.py` | The «מה מחכה לך» card on the business dashboard home (MEH-3108): what is waiting for the owner right now — reviews with no reply, new sign-ups to her events / … |
| `services/owner_detach.py` | The one mail of the admin «ניתוק בעלים» action: tells the former owner that her account is no longer linked to the business and that the account itself stays. |
| `services/owner_invite_google.py` | Let a FRESH Google sign-in stand in for the email code when a signed-in account accepts an owner invite (MEH-3675, Sapir's choice 22/11: «כן, רק בכניסה טרייה»). |
| `services/owner_products.py` | The owner's own product rows: the lookup that keeps a draft (the admin import's until approved) and another business's product out, and the rules a product … |
| `services/page_filler.py` | Read what an owner wrote about her business and return a DRAFT of the page fields (MEH-3483). Nothing is saved here. |
| `services/page_freshness.py` | The monthly "is everything on your page still correct?" email to a live business's owner, and the signed link whose «כן, הכול נכון» stamps … |
| `services/page_freshness_digest.py` | Once a week (Sunday, Israel clock) report to Sentry (ops_alert, MEH-3705; email to the admin when Sentry is off) the live pages whose owner has not confirmed … |
| `services/password_policy.py` | MEH-305 — Password policy validation service. |
| `services/pending_nudge.py` | Daily-scheduler entry point for the nudge emails sent to a business that registered but has not reached the review queue. … |
| `services/phone_reverify.py` | A business that changes its WhatsApp number loses its phone verification, and any code sent to the old number stops working. |
| `services/pickup_schedule.py` | Keep a location's pickup schedule consistent after a write: a branch holds no pickup days or cutoff, and the stored cutoff is a day and a time together or … |
| `services/producer_approval.py` | What approving a business page does to its row: slug guard and minting, the approvable-state check, applying the approved state and persisting it with … |
| `services/producer_catalog.py` | The small public catalog reads (total count, one random business) and the request checks of GET /producers. |
| `services/producer_detail.py` | Load one public business page (by slug or by id) and build the ProducerDetailOut it answers with. |
| `services/producer_duplicates.py` | Tell the admin producers list, per row, whether ANOTHER business in any status shares its name or its phone, so «כפילות?» sees a draft's self-registered twin … |
| `services/producer_insights.py` | The counting rules behind the business dashboard's numbers — page views, search appearances, WhatsApp clicks, other contact clicks and new followers — in ONE … |
| `services/producer_listing.py` | Producer listing query builder. |
| `services/producer_me_writes.py` | The owner PUT /producers/me write helpers — delivery areas, the active offer, the second phone, the gallery rules, the per-producer advisory lock, the … |
| `services/producer_queries.py` | Producer query helpers — pure ORM utilities used by the producers router. |
| `services/producer_recipe_moderation.py` | Claude Haiku pre-check on producer-submitted recipes before they enter the admin queue (MEH-589 chunk 2/4). |
| `services/producer_risk.py` | Anthropic-Haiku-backed signup risk score (0-100) + one-sentence Hebrew reasoning, written to producers.risk_score / producers.risk_reasoning asynchronously … |
| `services/product_import.py` | Turn a list of rows from a business's existing store (first source: mypips) into DRAFT products for that business. … |
| `services/product_order_actions.py` | Everything that happens to an order after it was sent: the buyer cancels or accepts a proposed change; … |
| `services/product_order_clock.py` | The clock an order's timers run on: hours that are counted only outside Shabbat and the festivals (Sapir, 14/11: «שעון 24 השעות נעצר אז לכולם»), and the … |
| `services/product_order_create.py` | Write one buyer's order request: check that the business takes orders, that the slot, the products and the delivery are still real, price everything from the … |
| `services/product_order_customers.py` | «הלקוחות שלכם» — who ordered from a business through the site, one row per customer: the name on their latest order, the phone, how many orders and when the … |
| `services/product_order_delivery.py` | Decide whether a business delivers an order to a city, and what the delivery costs, from the delivery facts the business already keeps. |
| `services/product_order_guards.py` | Rules about orders that other parts of the app must respect. Today one: a business with an open order cannot be hard-deleted. |
| `services/product_order_menu.py` | The two reads that both the public order menu and the order route need: whether a business takes orders, and the slots it offers now. |
| `services/product_order_outbox.py` | The messages an order owes: written in the same transaction as the status move that causes them, and sent later by the dispatcher, with retries, so a message … |
| `services/product_order_phone.py` | Prove that a buyer holds the phone she orders with: issue a one-time code, count wrong tries, and consume the code when the order is written. |
| `services/product_order_privacy.py` | What happens to a buyer's orders when she deletes her account: the open ones are cancelled, and every one of them loses her name, phone, address, note and … |
| `services/product_order_quote.py` | The price of an order before it is sent: the goods at the price the order route will store, the delivery fee for the buyer's city, and the total — so the … |
| `services/product_order_slots.py` | Turn a business's weekly ordering windows into the concrete time slots a buyer can pick in the coming days. |
| `services/product_order_state.py` | The one place an on-site order changes status. It says which moves are allowed, who may make each one, and writes the log row for every move it makes. |
| `services/product_order_sweeper.py` | Close the requests nobody answered in time: a 'pending' or 'change_proposed' order past its 'expires_at' becomes 'expired', moved by the system, and the buyer … |
| `services/product_order_views.py` | Turn an order row into what its two readers may see: the buyer (opened with a token: phone masked, no street address, the pickup code only while it is usable) … |
| `services/product_organize.py` | One implementation of product groups and product order for a business, shared by the owner's routes (/producers/me/...) and the admin's … |
| `services/product_variants.py` | The rules every surface shares about a product's sizes or flavours: which variants can be ordered, what one unit of each costs, and which variant an order … |
| `services/product_weekdays.py` | Refuses an order whose slot falls, on the Israel clock, on a day one of its products is not made ('products.available_weekdays', the bitmask of … |
| `services/push.py` | MEH-54: Web Push notification sender (VAPID-based). |
| `services/registration_emails.py` | 1. to the visitor: her sign-up was taken, with date, time, place, who hosts it and the «ביטול ההרשמה» link; 2. … |
| `services/registration_reminders.py` | The evening before an event or a one-off workshop, each person who signed up on the site gets one reminder with the time, the place and her cancel link … |
| `services/registration_waitlist.py` | A full event or one-off workshop takes a waitlist through the same on-site form (MEH-3314). … |
| `services/registrations.py` | - registered_counts(): active on-site sign-ups per item, in ONE query for a whole list (the list routes would otherwise go N+1); … |
| `services/reply_writer.py` | Draft a short, polite Hebrew reply from a business owner to one customer review (MEH-3480). The owner edits it and sends it herself. |
| `services/report_notifications.py` | Tell the admin, by email, that a business was just reported (D12 of the 14/11 grill retro, MEH-3223). … |
| `services/rescue_business_emails.py` | The business hears about each surprise-bag reservation: one email to every owner login with the quantity, the pickup code and the window, so the counter knows … |
| `services/rescue_digest.py` | At pickup_start, send one WhatsApp message per rescue offer to the BUSINESS, listing the day's pickup codes and how many bags each one is for, so the counter … |
| `services/rescue_emails.py` | One email per reservation with the pickup code, what is paid at the counter, the pickup window and address, and the free-cancel cutoff. … |
| `services/rescue_no_show.py` | MEH-3226 (D4 of the 14/11 grill retro) — the buyer hears about every no-show the business marks, so a block never arrives as a surprise: the first mail says … |
| `services/rescue_reads.py` | What the surprise-bag (rescue) screens read: today's public list, the buyer's own reservations, the business's orders and bags of the day, the business's … |
| `services/rescue_reminders.py` | MEH-3702 — on the morning of the pickup day, remind every buyer who reserved a bag on an EARLIER day: the code, the window, the free cancel. … |
| `services/rescue_writes.py` | The state changes behind the rescue-bag write routes: cancel a whole offer, reserve, hand over, no-show, buyer cancel, review, clear a no-show block, record … |
| `services/resend_client.py` | One place that configures the Resend SDK: the API key, and a 10 s HTTP timeout instead of the SDK's 30 s default. … |
| `services/resend_verify_cap.py` | A per-ACCOUNT cap on POST /auth/resend-verify, on top of the route's per-IP limit, so rotating IPs cannot flood one inbox (MEH-2906). |
| `services/retention_purge.py` | Enforce the retention windows the privacy policy promises (Sapir's ruling 05/09, wording live via #3457): raw business-page views and WhatsApp clicks are kept … |
| `services/retired_slugs.py` | MEH-2528 — tombstones for public business URLs ('retired_slugs'). |
| `services/review_conflicts.py` | Keep a review out of the public list and the rating once its author has a conflict of interest with the business: she now owns it, or she owns a business … |
| `services/review_invite.py` | The one builder of a business's «request a review» URL — the verified-review link ('?rt=<30-day invite token>') that the owner shares from her dashboard and … |
| `services/review_reports.py` | «דיווח על ביקורת» (MEH-3260) — build the admin email for a visitor's report on one review, and drop a repeat of the same report. |
| `services/sanitization.py` | HTML sanitization helper — defense-in-depth per ASVS V13 (MEH-329). |
| `services/signup_fill_digest.py` | Once a week (Sunday, Israel clock) check what share of the businesses that signed up in the last 7 days have a referral source («מאיפה שמעתם») and a location, … |
| `services/staging_reset_job.py` | Once a week, put the STAGING database back to the seed recipe by running 'scripts/reset_staging.py --confirm', so E2E users and hand-made test rows stop … |
| `services/submission_confirmation.py` | Confirm in writing, to the business owner, that a profile reached the review queue — fixing the submission timestamp and the "עד 3 ימי עסקים" promise the SLA … |
| `services/submission_gate.py` | The single answer to "may this business be sent to the admin review queue, and if not, what is it missing?". … |
| `services/trust_tier.py` | MEH-51: real-time trust tier computation — never stored, always computed. |
| `services/user_deletion.py` | Hard-delete a user and everything that belongs to her. |
| `services/user_phone_verify.py` | the send / confirm logic behind POST /users/me/verify-phone and /verify-phone/confirm, plus the two state changes the decision names: a phone change clears … |
| `services/vacation_state.py` | Single source of truth for the AdminSetting-backed vacation mode state. Returns a 'tuple[bool, date \| None]' that both the admin-facing typed wrapper and the … |
| `services/verification_status.py` | MEH-2520 — is a business's public verification signal still true today? |
| `services/verify_session.py` | Build the reply of GET /auth/verify-email: the Hebrew ack, plus a session when the link is opened in the browser that registered. … |
| `services/weekly_owner_summary.py` | Once a week, each live business owner gets a short email with the last 7 days of her page: views, WhatsApp clicks, other contact clicks and new saves to … |
| `services/whatsapp.py` | WhatsApp Cloud API client (MEH-508). |
| `services/whatsapp_template_bodies.py` | The exact body text of each WhatsApp template as submitted to Meta, one entry per template name. … |
| `services/whatsapp_template_lint.py` | Check a WhatsApp template body against Meta's automatic rejection rules BEFORE it is submitted, so a rejection costs a test run and not a round trip through … |
| `services/whatsapp_templates.py` | One Pydantic class per Meta-approved WhatsApp template, so a param mismatch (missing / extra / wrong-count) is caught at construction + type-check time … |
| `site_pages.py` | The one list of site pages the AI assistants may point a visitor to — a path and the page's Hebrew name. … |
| `slug_utils.py` | Shared slug utilities used across admin, producer_me, and import service. |
| `startup.py` | — אין כותרת — |
| `utils/clock.py` | Asia/Jerusalem-aware "now"/"today" helpers so availability and vacation logic compare against Israel local time, not the server's UTC clock (Railway runs UTC). |
| `utils/hebrew_search.py` | Turn a raw Hebrew search string into per-token ILIKE patterns so a row matches when EVERY token hits at least one searchable field — instead of the whole … |
| `utils/money.py` | The agorot ↔ shekels conversions that order and rescue code shared as copies — one definition of each. |
| `utils/phone.py` | Canonicalize an Israeli mobile number to a single comparable form so a Meta webhook 'from' (international, no "+") can be matched against an unvalidated, … |
| `utils/pii.py` | PII masking helpers for log/error output. |
| `utils/sql.py` | SQL LIKE/ILIKE pattern hygiene — escape user input so '%'/'_' match literally instead of acting as wildcards. |
| `utils/weekdays.py` | A product's days as a bitmask (MEH-3618): Sunday = 1 … Saturday = 64, NULL = every day. … |
| `worker.py` | The outbox worker: a process of its own (a separate Railway service, 'python -u -m app.worker') that sends the queued emails and runs the on-site order tick, … |

### אתר — `frontend/lib`

| קובץ | מה הוא עושה (מהכותרת) |
|---|---|
| `admin-billing-export.js` | MEH-3189 — the monthly billing CSV for the bookkeeper: one row per business with a counted booking in the month, built from the SAME answer the /admin/billing … |
| `admin-producers-export.js` | CSV export for the admin producers table. |
| `admin-review-checklist.js` | The one copy helper of the pre-approval review checklist: which approve-confirm message to show (MEH-2175). |
| `allergens.js` | — אין כותרת — |
| `analytics.js` | MEH-435: PostHog is loaded lazily the first time a production event fires with a key configured, then reused. … |
| `api-responses.js` | The response schemas the app's non-map call sites parse with (workflow rule 19), taken from the GENERATED schemas in lib/generated/api.zod.js under the names … |
| `api.js` | — אין כותרת — |
| `attribute-labels.js` | MEH-1082 [T-C]: single source of truth for shared attribute chip labels. |
| `auth-context.js` | — אין כותרת — |
| `availability.js` | One enum-first read of a business's availability, so every surface answers "is this business on vacation" from the same rule instead of four hand-rolled … |
| `badges.js` | Badge system (MEH-18). Pure functions — no React, no DOM. |
| `brand-seeds.js` | The seed layer's one source: the logo's five pomegranate seeds — shape, colours (light + on-dark), order — and a stable colour per id for single-seed marks. |
| `bring-list.js` | The host writes «מה להביא» as free text. One item per line; a single line is split on commas («סינר, נעליים סגורות») — but not on a comma inside parentheses … |
| `business-chat-handoff.js` | The «ask the business» link under an answer in the business-page chat (MEH-3513). Yelp and Shopify both hand a question the assistant cannot settle to the … |
| `business-chat-prompts.js` | The suggested questions in the chat opened from a business page, built from THAT page's data (MEH-3505). … |
| `business-chat.js` | Open the site chat for ONE business from that business's page (MEH-3489). The page has no floating chat button (MEH-1168), so a button inside the page asks … |
| `business-features.js` | Single owner of the tools a business gets on mehamakor — what exists, which group it belongs to, and which file implements it. … |
| `card-image-priority.js` | How a grid card's photo loads, by its position in the grid. One owner, so /producers and the category/region landing grids agree. |
| `category-label.js` | The one place a category's shown name is chosen: the locale's 'category_names.<slug>' message when the category has a known slug, else the DB name. … |
| `category-registry.js` | Single source of truth for every category's presentation data — the map-PIN style (colour + pin glyph + the /map legend rows) AND the line-art glyph used on … |
| `category-taxonomy.js` | The ONE list of product categories the frontend knows: each category's stable slug, its Hebrew DB name and its department group (the 6 groups of the /map and … |
| `chat-knowledge.js` | Builds what the AI assistant knows about the tools a business gets, from the same registry and words /join renders — so a tool added to the site reaches the … |
| `chip-copy.js` | MEH-2748 — attach the words to a filter chip at render time. lib/filter-taxonomy.js (FILTER_AXES) and lib/map-chips.js (CATEGORY_CHIPS) hold keys and wiring … |
| `chip-gate.js` | The site rule for any chip row: a chip that would open on an empty result is not drawn (MEH-3128). … |
| `chip-icons.js` | MEH-1418 — leading Phosphor icons for the toggle/attribute filter chips (verified · delivery · kosher · diet · quality) across the three discovery surfaces … |
| `claim-token.js` | Keep bearer tokens that arrive in a URL out of every URL after the first one — the owner-claim token (MEH-2321) and, since MEH-2974, the owner-INVITE token. … |
| `client-messages.js` | MEH-2233: which message namespaces the ROOT client provider ships. |
| `clipboard.js` | The one way to copy text on the site. It tries the Clipboard API, then the old textarea + execCommand path, and always answers true/false. … |
| `closed-day-orders.js` | After the owner saves a vacation or a closed date, warn her about the orders she already accepted on those days, with the first few listed and a way to the … |
| `cloudinary.js` | Cloudinary URL helper — injects f_auto,q_auto so images ship as WebP/AVIF with automatic quality. Safe for non-Cloudinary URLs (returned unchanged). |
| `color-tokens.js` | MEH-3169: the design colour tokens as hex strings, for the JS places a Tailwind class cannot reach — canvas drawing, SVG attributes, Leaflet options and … |
| `constants.js` | — אין כותרת — |
| `contact-method.js` | Primary contact method helpers (MEH-17). Pure functions — no React. |
| `contact-topics.js` | The one whitelist of contact-form topics, and the ?topic= reader that falls back to the default for anything else. |
| `contact-tracking.js` | Analytics beacons for any /producer surface. |
| `cookie-consent.js` | Cookie-consent storage contract — the ONE place that knows the localStorage key, the accepted values and the event name (MEH-2394 reviewer note: the … |
| `css-url.js` | A quoted, escaped CSS 'url()' for an inline background-image. The picture can be an owner-supplied URL; … |
| `dashboard-edit-anchors.js` | The deep-link registry for the producer dashboard's edit page — which card a URL hash means, where to scroll, and which accordion group to open. |
| `dashboard-status-classes.js` | Dashboard status colours — one owner for the four "tools" spokes (MEH-1640). |
| `dates.js` | — אין כותרת — |
| `delivery-coverage.js` | The rule for whether a producer's public page shows the «מגיעים אלייך?» checker, and through it the coverage CTA. … |
| `delivery-days.js` | The canonical delivery-day vocabulary — bare Hebrew day names, the exact values the backend whitelist accepts on DeliveryArea writes. |
| `delivery-errors.js` | MEH-1943 chunk 3 — code→copy resolver for the two delivery 422s from backend/app/services/delivery_validation.py (owner PUT /producers/me and admin PUT … |
| `delivery-fee.js` | MEH-2602: the ONE reading of "what does delivery cost" for a business — shared by the discovery card and the business page's DeliveryBlock. |
| `delivery-groups.js` | Pivot a producer's delivery_areas by dispatch day (MEH-1305 A) so a shared "יוצאים בימי שישי" is stated ONCE instead of repeating on every city row (the … |
| `delivery-time.js` | Which «מגיע תוך … ימי עסקים» line a delivery time reads as (MEH-3511): a range «3–5», an upper bound only «עד 5», or one number. Returns an i18n key + values; … |
| `diet-pages.js` | Single owner of the six indexable diet landing pages (MEH-1935) — slug → attribute key → API filter param → page path. … |
| `distance.js` | Distance helpers (MEH-12). JS port of the Haversine formula that the backend uses in raw SQL on producers.lat/lng (see CLAUDE.md "no PostGIS" decision). … |
| `edit-accordion-chips.js` | Answer one question per edit-hub accordion card — does this card gate the submit button, or is it optional? The header chip («חובה» / «רשות») is rendered from … |
| `edit-auto-open.js` | Which card opens by itself when the owner taps a group tile in the «עריכה» hub — so she reaches a form in one tap instead of two (MEH-3762, part 2 of the … |
| `email-typo.js` | Suggest a fix for a mistyped email DOMAIN (gmial.com → gmail.com, gmail.con → gmail.com, walla.co.ill → walla.co.il) — the mailcheck pattern (MEH-3123, Sapir … |
| `entity-registry.js` | One list of the site's public entities (business, organizer, event, workshop, group buy, recipe, rescue bag) and, per entity, which shared building blocks its … |
| `env.client.js` | CLIENT-SAFE INVARIANT |
| `env.js` | MEH-465: env.js is now a shim. Real implementation lives in env.client.js (client-safe, NEXT_PUBLIC_* only) and env.server.js (server-only vars + import … |
| `env.server.js` | — אין כותרת — |
| `errors.js` | MEH-251 — Central mapper: axios/fetch error → Hebrew toast message. |
| `established-year.js` | Shared client-side bounds for the producer "שנת הקמה" (established_year) number input, so the field's min/max mirror the server validator (backend schemas.py … |
| `event-categories.js` | Single source of truth for the /events (4) and /experiences (7) category sets — previously duplicated across 5 call-sites in 4 files (EventsClient, the … |
| `event-category-gate.js` | Decide which category chips /events and /experiences show — only categories that have at least one result in the current city, so no chip leads to «לא נמצאו … |
| `event-date-filter.js` | MEH-3118 — the three date shortcuts on /events and /experiences («היום», «מחר», «סוף השבוע»), as Eventbrite and Meetup offer them. … |
| `event-draft.js` | Put a «יש לכם מודעה על האירוע?» draft (MEH-3751) into the event form's state: a field the draft fills replaces the form's value, a field it leaves empty keeps … |
| `event-entry.js` | toEventEntry — normalizes an event OR experience API row into the one shape EventEntryRow renders. … |
| `event-ics.js` | Turn one event into an iCalendar (RFC 5545) file the visitor can open in Google / Apple / Outlook calendar — the «הוספה ליומן» button on the event page. |
| `event-when.js` | How close an event's date is to today in Israel — the «היום» / «מחר» / «השבוע» chip beside the date, and whether the event is already over (MEH-2548). |
| `experience-format.js` | An experience's duration as a reader says it — «שעה וחצי», not «90 דקות» (MEH-2476). |
| `farmer-declaration.js` | MEH-759 Chunk C (ADR-022 gate 2): agricultural categories that trigger the conditional grower declaration ("תוצרת שגידלתי בחלקתי בלבד"). … |
| `favorites-cache.js` | In-memory cache of the current user's favorited producer IDs. |
| `featured-producer.js` | §10 "Meet a Producer" selector — extracted from use-home-page.js for unit testability (MEH-542). Reuses the existing is_recommended flag (no schema). |
| `filter-taxonomy.js` | MEH-2130 — THE single definition of every consumer filter axis. One object per axis carrying its key, consumer label, Label Scope Contract metadata (scope × … |
| `filter-url.js` | — אין כותרת — |
| `first-moments.js` | The once-only «רגע ראשון» cards on the dashboard home (MEH-3200 part 2, approved by Sapir 14/11): first review, first WhatsApp click, 100 page views, first … |
| `form-draft.js` | The one rule for putting a «fill the form from text» draft into a form's state (MEH-3751, rule of two): a text field the draft fills replaces the form's … |
| `format-date.js` | Locale-aware date formatting for event / experience surfaces. Single source replacing 4 duplicated formatDate helpers that hardcoded "he-IL" (so /en/* … |
| `format.js` | Locale-aware number formatting helpers shared across pages. |
| `friday-mode.js` | MEH-50: שוק שישי mode — Thu 18:00 → Fri 14:00 Israel time. Pure function, no async, no deps. Uses Intl for correct DST handling. |
| `fulfillment-tags.js` | — אין כותרת — |
| `generated/api.zod.js` | Generated by orval 🍺 Do not edit manually. מהמקור - MeHaMakor API OpenAPI spec version: 1.0.0 |
| `group-buy-pickup.js` | The group buy's pickup window as one line — «יום שישי, 5 בדצמבר, 09:00–13:00», or two dates when it spans days (MEH-3597). … |
| `group-buy-progress.js` | MEH-2540: progress toward the group price, for the list card and the page. |
| `group-buy-transitions.js` | MEH-2868 — which status a group buy may move to, from each status, as the server enforces it. … |
| `guest-to-login-inline.js` | Send a visitor with no stored session from a signed-in-only page to /login before the page's JavaScript loads, instead of after it hydrates and the auth check … |
| `guide-blocks.js` | MEH-3623: the three business guides each carried the same buildBlocks(): turn a page's block outline into the translated blocks GuideArticle renders. … |
| `guide-metadata.js` | MEH-3590: one generateMetadata for the three business guides — they were three copies, and the share image had to be added to each by hand. |
| `hebrew-holidays.js` | Computes the Israeli dates of the food holidays from the Hebrew calendar, for any year, so nobody has to type next year's table (MEH-3017). … |
| `highlight-match.js` | highlightMatch(text, query) — MEH-99 Enhancement 3. |
| `holidays.js` | MEH-55: Israel food holiday calendar. Holidays include advance window (7 days before) and active period. … |
| `home-categories.js` | Category card data for the homepage category grid. Pure module (no React imports) so it can be consumed by both the HomeCategoryGrid component … |
| `hours-serialize.js` | The inverse of lib/hours.parseHours — turn the structured 7-day opening-hours editor model into the canonical backend string ("Sun-Thu 09:00-18:00, Fri … |
| `hours.js` | Parse a producer's 'opening_hours' string and compute the current open/closed status in Asia/Jerusalem time. … |
| `hub-faq.js` | MEH-3737: which questions each hub list shows under it, in order. The keys name 'items.<key>' in the messages namespace of each list. … |
| `hub-landing.js` | MEH-2975 — where a link to the listing hub should land. The hub is four routes under one tab row (ListingHubTabs); … |
| `hub-layout.js` | MEH-3013: the content width every «מה קורה» hub tab uses below the shared head (components/HubShell.jsx) — the same width the tab row and hero text use. … |
| `i18n-seo.js` | Shared i18n SEO helpers — MEH-476 PR 3b2. |
| `inert-attr.js` | MEH-2253 — the prop value that makes the 'inert' attribute PRESENT depends on which React is rendering, and this repo runs two of them: |
| `israel-date.js` | One owner for "what calendar day is it in Israel" on the client, so a date the UI offers is a date the server will accept. |
| `keep-focused-chip-clear.js` | MEH-2537 (home) → shared with /producers by MEH-2569: a filter rail whose «סינון» trigger is sticky at its inline-start edge. … |
| `label-in-name.js` | WCAG 2.5.3 Label in Name (axe 'label-content-name-mismatch'). |
| `launch-cohort.js` | Tag launch-window (month-1) sessions in Sentry so launch users can be filtered apart from later/random traffic in Replay. |
| `legal-page-metadata.js` | MEH-3623: one generateMetadata for the three legal pages (privacy, terms, accessibility) — they were three copies of the same openGraph + twitter block. … |
| `license-required-categories.js` | MEH-530: client-side copy of backend/app/constants.py LICENSE_REQUIRED_CATEGORIES (Hebrew category NAMES). |
| `listing-supply.js` | — אין כותרת — |
| `map-chips.js` | Map filter chips (MEH-14). Category chips: all · meat · produce · dairy · bread (keys). … |
| `map-city-params.js` | /map's city → GET /producers param, in one place. |
| `map-pin-labels.js` | The business name next to its pin once the map is zoomed in close (Google Maps pattern) — so a pin can be read without tapping it. … |
| `map-ssr-producers.js` | Fetch a representative batch of businesses server-side, for the sr-only index /map renders so Googlebot can see the businesses the interactive map holds … |
| `map-view-state.js` | MEH-1414 — persist the /map camera (center + zoom) across navigation so back-navigation from a producer page lands on the spot the visitor left, not the … |
| `marker-glyph.js` | Stringify a Phosphor icon component to a white, fill-weight SVG for the Leaflet divIcon marker fallback on /map (MEH-936). |
| `menu-image.js` | Shrink a menu photo in the browser before it is sent (MEH-3430). A phone photo is 3–6 MB; … |
| `middleware-exists.js` | Existence checks the middleware runs so a missing recipe or an unservable category × region page answers a REAL 404 instead of a streamed 200 (their … |
| `money.js` | The one place that turns agorot (what the API stores) into shekels (what people read). Prices travel as whole agorot. |
| `nav-links.js` | The one place that builds "navigate there" links (Waze + Google Maps) — from a map point, or from a text address when there is no point. … |
| `nav-registry.js` | MEH-1703 chunk 1 — one declaration per navigation item, covering the four nav surfaces (desktop pill, desktop avatar dropdown, mobile bottom pill, mobile … |
| `next-delivery.js` | The date of a business's next delivery to a city — «המשלוח הבא: יום שלישי 24.11» (MEH-3485) — from the city's delivery days and the business's weekly order … |
| `oauth-terms-key.js` | The consent line under the Google/Apple buttons names only the providers actually rendered — each button is gated on its own NEXT_PUBLIC_*_CLIENT_ID, and a … |
| `official-registries.js` | Canonical URLs for the official government registries admins cross-check against when verifying producers (Tier-1 "מאומת"). … |
| `og-producer-card.js` | The branded link-preview image of a business page (1200×630): what WhatsApp and Facebook show when the page is pasted. … |
| `og-rtl.js` | Hebrew text for next/og (Satori), which has no bidi: it lays every string out LTR, so «מאפייה» comes out «הייפאמ». … |
| `og-site-image.js` | The one owner of the site's link-preview image path, per locale. A page that sets its own 'openGraph' replaces the layout's object (Next merges metadata … |
| `order-again.js` | «להזמין שוב»: carry a finished order's lines from its status page to the business page, where they fill the cart again — the items still on the menu are … |
| `order-cart.js` | What a buyer has picked on a business page before she sends an order request: the menu read, and the pure sums over her picks. |
| `order-customers.js` | «הלקוחות שלכם» — read the business's customers and turn them into a CSV the business can open in Excel or Google Sheets. |
| `order-setup-draft.js` | Put a «ספרו לנו איך אתם מקבלים הזמנות» draft (MEH-3752) into the three order-setup cards: the settings numbers, the weekly hand-over windows and the products … |
| `order-sheet.js` | What the order sheet needs that is not a screen: which ways of getting the order and which slots to offer, the cancel deadline, the request bodies, and the … |
| `order-status.js` | The buyer's side of one on-site order: read it, cancel it, accept the business's proposed change, and decide which approved sentences the status page shows … |
| `order-window-status.js` | Derive the CURRENT order-acceptance status from a producer's weekly 'order_window' (MEH-1543) — open / closing_soon / closed, plus when the window next … |
| `order-window.js` | Convert between the backend 'producers.order_window' JSONB shape ({"sunday": {open, close}, …}) and the 7-row editor model the dashboard renders, plus the … |
| `owner-preview.js` | One rule for "an owner or admin is opening an item that may not be public yet" (MEH-2977 follow-up). … |
| `page-fill.js` | «ספרו לנו על העסק» (MEH-3483): turn the server's draft of the page fields into preview rows, and the rows the owner kept into the writes that save them. |
| `pagination.js` | Pagination helpers (MEH-23). Pure functions — no React, no DOM. |
| `panel-position.js` | Viewport-fit geometry shared by every portaled, 'position: fixed' panel — the one owner of "does this panel fit below its trigger, and where does it go when … |
| `password-messages.js` | Failure-key → translation lookup for the MEH-306 password policy. |
| `payment-info.js` | The closed lists behind producers.payment_info and the one serializer the dashboard editor sends, so the dashboard and the public page agree on order and shape. |
| `pending-action.js` | One-shot "finish what the guest started" intent across the login round-trip (MEH-1334 revision-2 #7): a guest tap on שמירה/מעקב stores the intended action + … |
| `places.js` | Address-autocomplete provider abstraction for AddressSearch (MEH-1234). Two backends behind one normalized shape so the component stays provider-agnostic: • … |
| `post-auth-return.js` | Remember the page a customer was on when she signed up by email, so the verification link brings her back to it instead of "/". |
| `post-login-action.js` | Post-login action queue. Stores one pending action in sessionStorage so a guest tap on "save" can be replayed after authentication. |
| `prehydration-capture-inline.js` | MEH-3164: the first-byte half of the pre-hydration capture. |
| `prehydration-capture-key.js` | MEH-3164: the window property the <head> capture script (lib/prehydration-capture-inline.js) and the replay module (lib/replay-prehydration-input.js) share. … |
| `prehydration-flags-inline.js` | MEH-2233 — two facts that live only in localStorage, published on <html> before the first paint, so content that depends on them can be in the server HTML … |
| `prepare-upload.js` | Shrink a big phone photo in the browser before it is uploaded, so a business owner never meets «תמונה גדולה מדי» for an ordinary camera shot (3–8 MB). … |
| `preview-mode.js` | Tell the business-page tree that it is being rendered as the OWNER'S PREVIEW rather than as the live public page. |
| `pricing.js` | The one place the site reads its prices from — subscription, booking commissions (with and without a subscription), the results threshold and the notice … |
| `producer-completeness.js` | Single source of truth for the producer-completeness check used by the admin producers list. … |
| `producer-description-placeholders.js` | — אין כותרת — |
| `producer-filters.js` | The home + /producers filter config, DERIVED from lib/filter-taxonomy.js. |
| `producer-path.js` | The one path to a business page. |
| `producer-points.js` | Derive a producer's map-able points from its own data — the single answer to "where is this business on the map?", shared by the marker layer and the /map … |
| `producer-route.js` | Single source of truth for "is this the public producer detail page?" — BOTH surfaces that render it: the '/producer/[id]' leaf (excluding the … |
| `producer-status.js` | Producer status — render-only labels and color tokens. DB emits raw codes (draft / pending / approved / rejected / inactive — see … |
| `product-order.js` | The ONE place that decides the order products are shown in, for the public business page and the owner's dashboard alike (MEH-3055). … |
| `product-ordering.js` | The business's own products as the «הזמנות» tab switches them (open for ordering on the site, sold out), and the prep list of the «היום» tab. |
| `product-orders.js` | The one place on-site ordering's business-side fetches, list groups and money/time formatting live, so the dashboard screens never re-derive them. |
| `product-price.js` | What a product's price is per (MEH-2936): «80₪ לבקבוק», «35₪–60₪ לק״ג», and for 'unit' just the price, so a product that never chose a unit reads exactly as … |
| `product-variants.js` | The pure rules the business page and the order cart share about a product's sizes or flavours: the cart key of a line, the variant a line means, the «מ-X ₪» … |
| `product-weekdays.js` | The days a product is made (MEH-3618): 'available_weekdays' is a bitmask, Sunday = 1 … Saturday = 64, null = every day. … |
| `push.js` | MEH-54: Web Push subscription utility. Handles the browser-side push subscription flow. |
| `qr.js` | — אין כותרת — |
| `quick-answers.js` | Pure answer descriptors for the producer contact card's "Quick Answers" (MEH-1302) — turn the producer's already-public delivery and contact data into a small … |
| `rating-gate.js` | MEH-1864 — rating data gate. |
| `recently-viewed.js` | Recently-viewed producers — localStorage helpers (MEH-11). |
| `recipe-draft.js` | Put a «יש לכם מתכון כתוב?» draft (MEH-3740) into the recipe form's state: a field the draft fills replaces the form's value, a field it leaves empty keeps … |
| `recipe-lines.js` | MEH-2540: one recipe line-splitter for the page and its JSON-LD. |
| `recipe-scale.js` | Scale the amount at the start of a free-text ingredient line when the reader changes the number of servings (MEH-3121; NYT Cooking / Allrecipes do the same). |
| `region-pages.js` | Single owner of the category x region landing pages (MEH-2790) — the threshold, the path shape, and the region lookup. … |
| `register-draft.js` | Own the on-disk shape of the producer-registration draft — what is written, what counts as content worth resuming, and when a stored draft is too old to offer … |
| `register-route.js` | The ONE predicate for "is this pathname inside the registration flow", shared by every surface that has to stay out of its way. |
| `replay-prehydration-input.js` | MEH-2602: typing that lands before hydration must not be silently dropped. |
| `rescue.js` | The one place the rescue-bags pilot's flag, its fetches and its unit formatting live, so no component re-derives any of them. |
| `resolved-questions.js` | Resolve WHICH ready-made questions a producer's public page shows right now, and how each one is served (answered in-page vs opens a channel). … |
| `review-invite.js` | Keep the owner's "request a review" token ('?rt=' on the shared link) for the producer it was minted for, so ReviewsSection can unlock the form and forward it … |
| `route-memory.js` | Small facts about client-side navigation that the page components cannot learn on their own, and one use of them: 1. … |
| `safe-redirect.js` | Clamp a post-login '?redirect=' value to an internal, same-origin path so an attacker-supplied param can't bounce the user off-site. |
| `saved-cache.js` | In-memory set of the current user's saved recipes / events / experiences (MEH-2558), keyed "<type>:<id>". … |
| `schemas.js` | — אין כותרת — |
| `sentry-environment.js` | Label every Sentry event with where it really ran. NODE_ENV is "production" in every Vercel build, staging included, so staging events used to arrive as … |
| `sentry-replay-gate.js` | decide when the browser may record a Sentry error replay. Two conditions, both required: the visitor accepted ALL cookies (a replay is a session recording, … |
| `sentry-sampling.js` | MEH-2887 — one place that decides the Sentry traces sample rate, so staging and previews stop burning the span quota production shares with them (≈95% of it, … |
| `seo.js` | Shared SEO helpers for producer pages (both /producer/[id] and /[slug]). |
| `server-fetch.js` | — אין כותרת — |
| `server-first-json.js` | — אין כותרת — |
| `share-link.js` | One way for a business owner to share her public link: the phone's own share sheet when there is one (Instagram stories are reachable only there), else a copy … |
| `share-post.js` | The data behind the owner's ready-made feed post (MEH-3330): which products go on it, how a price reads, the tracked link, and the caption. … |
| `site-pages.js` | The paths the chat assistants may link to, and the function that splits an answer into text and links to exactly those paths. |
| `sitemap-static.js` | The fixed (non-data) pages the sitemap offers, in one list that app/sitemap.js emits and __tests__/PublicPageReachabilityGuard reads, so the guard tests the … |
| `slug.js` | Cheap slug-shape guard for the root catch-all route — reject bot probes (/wp-admin, /.env, /xmlrpc.php …) BEFORE any backend fetch. |
| `social-links.js` | ONE definition of "turn a stored instagram field into a link". |
| `special-hours.js` | Convert between the backend 'producers.special_hours' JSONB shape ({"YYYY-MM-DD": {ranges: [{open, close}], note?}}) and the date-row editor model the … |
| `ssr-entity-fetch.js` | The server-side fetch at the top of the four detail pages (producer, event, experience, group-buy): one request, one three-way answer, one way of reporting it. |
| `submission-gate.js` | Answer "may this business be sent for review, and if not, what is missing?" on the CLIENT, so the dashboard can disable the "שליחה לבדיקה" CTA and name the … |
| `time-format.js` | The single owner of how a time-of-day is SHOWN to a reader — "09:00" becomes "9:00". … |
| `time-range.js` | One owner for how an event's time reads: «09:30», or «09:30–15:00» when it has an end time (MEH-2469). |
| `toast.js` | Minimal toast store — module-level pub/sub, no context provider needed. |
| `upload-limits.js` | MEH-3399: upload size cap, in its own module so tests that mock "@/lib/api" (default export only) still get the real number. … |
| `use-account-prefill.js` | Fill a public form's empty contact fields from the signed-in visitor's own account (MEH-3112, Sapir 14/11 option א: prefilled, still editable — the Luma / … |
| `use-admin-action.js` | useAdminAction — double-submit protection for admin fire-and-reload handlers (UIS Pattern A, MEH-228). |
| `use-api.js` | The one way a client component reads from the backend (MEH-3536). A thin layer over SWR: every read goes through lib/api.js (axios, so the auth header, the … |
| `use-badge-copy.js` | useBadgeCopy — the one reader of a badge's words (MEH-2740, MEH-1687 phase 7b). |
| `use-catalog-snapshot.js` | — אין כותרת — |
| `use-chip-copy.js` | MEH-2748 — React hook over lib/chip-copy.js. Returns a stable 'withCopy(chip)' that adds 'label' / 'subtext' from messages to a registry chip (FILTER_AXES or … |
| `use-dashboard-title.js` | give every owner-dashboard screen its own <title> (WCAG 2.4.2): «<tab label> \| <brand>». … |
| `use-duplicate-source.js` | «שכפול» on the events / experiences list opens the create form at '?from=<id>'. This hook finds that row among the owner's own items and returns it as a … |
| `use-events-nav-gate.js` | MEH-2369 — decide whether the footer's "אירועים" link appears. It appears only when at least one upcoming public event exists, so a reader who follows it … |
| `use-experiences-nav-gate.js` | MEH-1918 — decide whether the "חוויות" link appears in the nav. It appears only once the surface has real supply, so a reader who follows it never lands on a … |
| `use-favorite-producers.js` | — אין כותרת — |
| `use-focus-return.js` | — אין כותרת — |
| `use-google-code-sign-in.js` | <reference path="../types/browser-globals.d.ts" /> |
| `use-google-sign-in.js` | <reference path="../types/browser-globals.d.ts" /> |
| `use-home-page.js` | — אין כותרת — |
| `use-hub-nav-gate.js` | MEH-2858 — decide whether the footer's «קבוצות רכישה» / «סלי הפתעה» links appear. Each appears only while its hub has at least one public item, so no list on … |
| `use-intent-prefetch.js` | Start loading a page the moment a reader shows intent to open it — a finger touches the link, the mouse enters it, or it takes focus — instead of waiting for … |
| `use-my-orders-nav-gate.js` | MEH-3525 — decide whether «ההזמנות שלי» appears in the account menus. It appears for a signed-in person while on-site ordering is switched on in the server … |
| `use-order-cart.js` | The buyer's picks on one business page, held by ProducerDetail so the product rows and the order bar read the same state. |
| `use-orders-tab.js` | Whether the dashboard shows the «הזמנות» tab, and its counter (orders waiting for an answer). |
| `use-rescue-reservation.js` | — אין כותרת — |
| `use-resend-verification.js` | Shared resend-verification-email action + status state, so both the global VerifyBanner nudge and the per-form unverified-email notice drive the same POST … |
| `use-test-business-ids.js` | — אין כותרת — |
| `use-user-city.js` | — אין כותרת — |
| `use-visual-viewport-box.js` | — אין כותרת — |
| `user-location.js` | User location — localStorage cache + cross-component sync hook. |
| `utils.js` | Frontend utility helpers — keep small, pure, and side-effect-free. More specialized utilities live in their own files (see 'validators.js' for form … |
| `validators.js` | Shared validators for form inputs across the site. Used in /register, /register/producer, and anywhere phone/password need client-side validation. |
| `watch-favorited.js` | MEH-3465: one business's saved state, now and on every change. FavoriteButton, ProducerUpdatesButton, ProducerHeader and ProducerCard each carried this … |
| `webauthn.js` | The browser half of an admin passkey (MEH-3305): turn the server's JSON options into what 'navigator.credentials' takes, and the credential it returns back … |
| `whats-new.js` | The «מה חדש» release list for business owners (MEH-3200): which versions have news for businesses, how many lines each has, and whether the owner has already … |
| `wizard-step-numbers.js` | Turn a wizard's STEP enum into the numbers a user actually SEES. A step that is conditionally absent makes the enum value and the visible position diverge, … |
| `zod-csp.js` | Turn off Zod's eval probe in the browser, so the CSP stops reporting «Blocked unsafe eval()» on every page that parses an API response. |

### אתר — `frontend/hooks`

| קובץ | מה הוא עושה (מהכותרת) |
|---|---|
| `useDialogFocus.js` | The focus half of a modal dialog's contract, in one place: focus moves into the dialog when it opens, Tab and Shift+Tab stay inside it, and focus returns to … |
| `useFirstMoment.js` | The «רגע ראשון» due on the dashboard home right now, if any (MEH-3200 part 2). Wraps lib/first-moments.js with storage. |
| `useScrollAffordance.js` | — אין כותרת — |
| `useTabsKeyboard.js` | The W3C APG Tabs keyboard layer, in one place, for every tablist on the site. Returns the 'onKeyDown' a 'role="tablist"' element wears. |
| `useUnsavedGuard.js` | Warns before an owner leaves a dashboard form with unsaved edits: the browser's own prompt on refresh / tab close, and a confirm on any in-app link that … |
| `useWhatsNew.js` | Two small client-only state holders for the dashboard home (MEH-3200): the newest «מה חדש» release the owner has not seen, and whether the one-time welcome … |

### אתר — `frontend/components`

| קובץ | מה הוא עושה (מהכותרת) |
|---|---|
| `AccountDeleteCard.jsx` | The «מחיקת חשבון» card on /settings → security. It proves the person asking owns the account before calling POST /auth/me/delete, and tells a business owner … |
| `AccountSheet.jsx` | MEH-2578: locale-aware Link — next/link dropped the /en prefix, and with localeDetection off an /en reader landed on the Hebrew page. |
| `AddressSearch.jsx` | — אין כותרת — |
| `AiTextSuggest.jsx` | One button that asks the server for a short AI text, shows it as an editable preview, and on «שימוש ב…» hands it to the caller's field. … |
| `AlertPrefsPanel.jsx` | MEH-54: Alert preference panel shown after a producer is favorited. Allows users to choose which notifications to receive and opt in to push. |
| `AllergenPicker.jsx` | The allergen chips a business ticks for what it sells: one toggle per code, in the canonical order. One picker for the rescue bag and the group buy (MEH-3610). |
| `AppleAuthButton.jsx` | <reference path="../types/browser-globals.d.ts" /> |
| `AreaTermsRow.jsx` | One row of the business page's delivery list: the towns that share the same terms (a zone shows its name, then its towns), and those terms once, on one muted … |
| `AuthUnreachableState.jsx` | What a signed-in area (/admin, /producer/dashboard) shows when a token is stored but /auth/me never answered: a network error with a retry, in place. … |
| `BackToTop.jsx` | — אין כותרת — |
| `BadgeRow.jsx` | — אין כותרת — |
| `BottomNav.jsx` | MEH-731: locale-stripping usePathname (returns "/" on /he and /en) so the home-tab match fires on the localized homepage. … |
| `BrandLoader.jsx` | BrandLoader — the site-wide "waiting for a whole page" indicator (MEH-2599). |
| `Breadcrumb.jsx` | — אין כותרת — |
| `BusinessChatAfterAnswer.jsx` | — אין כותרת — |
| `BusinessCtaLink.jsx` | — אין כותרת — |
| `BusinessLogo.jsx` | A business's logo in a white circle beside its name (MEH-3611). Renders nothing without a logo, so each caller keeps whatever it showed before (a letter … |
| `ButtonSpinner.jsx` | — אין כותרת — |
| `CalendarView.jsx` | — אין כותרת — |
| `CategoryIcons.jsx` | The single geometric icon set for every non-photo category surface (map pins, register selector, category-card glyph fallback). … |
| `CategoryRequestModal.jsx` | — אין כותרת — |
| `CategorySelector.jsx` | — אין כותרת — |
| `CategoryTag.jsx` | — אין כותרת — |
| `ChatMessageText.jsx` | — אין כותרת — |
| `ChatWidget.jsx` | — אין כותרת — |
| `ChatWidgetLazy.jsx` | — אין כותרת — |
| `ChipScrollRow.jsx` | — אין כותרת — |
| `CitiesAutocomplete.jsx` | — אין כותרת — |
| `CitySearch.jsx` | — אין כותרת — |
| `ClarityScript.jsx` | — אין כותרת — |
| `ClosingCtaBand.jsx` | The one full-green band that ends every page closing on a business call to action: inverted mark, cream heading, a line or three, the cream join button, an … |
| `CollectionNotice.jsx` | One short line at the point of input telling a person what happens to what they are about to type, plus a link to the privacy page. … |
| `ContactCtaVariants.jsx` | — אין כותרת — |
| `CookieBanner.jsx` | — אין כותרת — |
| `CookieSettingsButton.jsx` | — אין כותרת — |
| `CoverageRequestCta.jsx` | — אין כותרת — |
| `CustomCursor.jsx` | — אין כותרת — |
| `DashboardFooter.jsx` | MEH-2578: locale-aware Link — next/link dropped the /en prefix, and with localeDetection off an /en reader landed on the Hebrew page. |
| `DateTile.jsx` | The small month/day calendar tile that leads the date row of the event and experience details cards (Luma's date-row icon). … |
| `DeliveryBlock.jsx` | — אין כותרת — |
| `DeliveryChecker.jsx` | — אין כותרת — |
| `DeliveryDayRow.jsx` | — אין כותרת — |
| `DeliveryTerms.jsx` | The MEH-3511 delivery lines on the business page: «מגיע תוך 3–5 ימי עסקים», «מינימום 150₪», and a zone's own «מקבלים הזמנות עד יום שני 12:00». … |
| `DeliveryWaitlistForm.jsx` | — אין כותרת — |
| `DirectoryDisclaimer.jsx` | Directory-only disclaimer — required by Israeli consumer protection law. |
| `EditAccordionCard.jsx` | Accordion shell for the producer edit-tab cards (MEH-1116). The edit page was one long page with 6+ expanded cards; … |
| `EditHubCard.jsx` | Hub-view group tile for the producer edit tab (MEH-1408). The edit tab moved from one flat accordion list to hub-and-spoke: a hub of 4 group tiles, each … |
| `EditorialPhoto.jsx` | — אין כותרת — |
| `EmailLinkUnsubscribe.jsx` | — אין כותרת — |
| `EmailTypoHint.jsx` | «אולי התכוונו ל־noa@gmail.com?» under an email field whose domain looks mistyped (MEH-3123; copy approved by Sapir 14/11). … |
| `EnSearchNotice.jsx` | — אין כותרת — |
| `EntityCover.jsx` | The masthead of an entity detail page — the entity's photo, else a coloured band carrying its category icon (never an empty frame), and an actions corner (the … |
| `EventEntryRow.jsx` | EventEntryRow — the date-rail row for one event or experience (MEH-134 "The Almanac"). … |
| `EventForm.jsx` | Shared create/edit form for producer events. Owns the form state, image upload, and submit (POST /events on create, PUT /events/{id} on edit). … |
| `ExperienceForm.jsx` | Shared create/edit form for community experiences. Owns form state, the debounced live-moderation check, and submit (POST /experiences on create, PUT … |
| `ExperienceSessionsField.jsx` | MEH-3447 (stage 4 of MEH-3264) — the dates of a recurring workshop, inside the «החוויה חוזרת» block of the owner's form (placement option א of the MEH-3264 … |
| `FadeInSection.jsx` | — אין כותרת — |
| `FarmerDeclarationCheckbox.jsx` | The grower line («גידלתי בחלקתי בלבד») as a checkbox, for a business that moves into ירקות/פירות after registration. |
| `FavoriteButton.jsx` | — אין כותרת — |
| `FieldHelpLabel.jsx` | A form field's label with a small «?» beside it that opens a one-line explanation of the field under the label (MEH-3740). … |
| `FilterSheet.jsx` | — אין כותרת — |
| `Footer.jsx` | MEH-2578: locale-aware Link — next/link dropped the /en prefix, and with localeDetection off an /en reader landed on the Hebrew page. |
| `FooterSlot.jsx` | MEH-731: locale-stripping usePathname (returns "/map" on /he/map and en/map) so the '=== "/map"' check below fires under next-intl [locale] routing — … |
| `FormFillBox.jsx` | «יש לכם מתכון כתוב?» (MEH-3740): the owner pastes text she already has and the form fills itself as a draft. … |
| `FridayDeliveryStrip.jsx` | — אין כותרת — |
| `GalleryViewAllButton.jsx` | The «כל התמונות (n)» pill on a cover photo that opens the shared Lightbox at the first image. … |
| `GoogleAuthButton.jsx` | <reference path="../types/browser-globals.d.ts" /> |
| `GoogleRatingLine.jsx` | GoogleRatingLine — MEH-1490 |
| `GroupBuyProductPicker.jsx` | «מילוי ממוצר קיים» above the group-buy product name: picking one of the business's own products fills the name and the regular price, both still editable. … |
| `GuideArticle.jsx` | Shared shell for MEH-539 onboarding guide pages under /about/for-businesses/guides/{slug}. … |
| `Header.jsx` | — אין כותרת — |
| `HeroSearch.jsx` | — אין כותרת — |
| `HistoryBackLink.jsx` | MEH-2857 — «→ חזרה» on an item page (group buy, event, experience, recipe) that returns to the exact page the visitor came from, with its scroll and filters … |
| `HolidayBanner.jsx` | — אין כותרת — |
| `HolidayIcon.jsx` | — אין כותרת — |
| `HomeWhatsOn.jsx` | MEH-2859 — one home strip for everything date-bound at the businesses: events, experiences, group buys and surprise baskets. … |
| `HomepageMiniMap.jsx` | Lazy-loaded mini-map preview on the homepage — discovery prominence per MEH-538. Click anywhere → /map. |
| `HomepageMiniMapLazy.jsx` | Fetch the homepage mini-map (Leaflet + its tiles) only when the visitor scrolls near it. … |
| `HomepageMiniMapSkeleton.jsx` | SSR-able loading fallback for the HomepageMiniMap dynamic import on the homepage. Reserves height on first paint (before JS hydrates) so the above-the-fold … |
| `HoursText.jsx` | MEH-2604: free-text hours as the owner typed them («א׳–ה׳ 9:00–17:00»), rendered inside the RTL page with every time RANGE isolated left-to-right. |
| `HubAlertHint.jsx` | MEH-3117 — the way out of an empty hub tab (/rescue, /group-buys): one line saying how to hear about the next one (save a business, turn on its alert) and a … |
| `HubFaq.jsx` | A short «שאלות נפוצות» block at the bottom of a hub list (/group-buys, /rescue): closed <details> rows and the matching FAQPage JSON-LD, both built from the … |
| `HubShell.jsx` | MEH-3013 — the ONE head every «מה קורה» tab renders: the photo hero (eyebrow · H1 · subtitle) and, directly under it, the shared tab row. … |
| `ImageGallery.jsx` | — אין כותרת — |
| `ImageWithFallback.jsx` | — אין כותרת — |
| `InfoTooltip.jsx` | — אין כותרת — |
| `InstallPrompt.jsx` | <reference path="../types/browser-globals.d.ts" /> |
| `IosViewportPin.jsx` | — אין כותרת — |
| `KashrutBadgeStrip.jsx` | — אין כותרת — |
| `LanguageToggle.jsx` | — אין כותרת — |
| `Lightbox.jsx` | — אין כותרת — |
| `ListingHubTabs.jsx` | MEH-2859 — the one tab row for everything date-bound at the businesses: «אירועים» · «חוויות» · «קבוצות רכישה» · «סלי הפתעה». … |
| `LocationBanner.jsx` | — אין כותרת — |
| `LocationModal.jsx` | — אין כותרת — |
| `LoginPromptGoogle.jsx` | — אין כותרת — |
| `LoginPromptModal.jsx` | — אין כותרת — |
| `MapBottomSheet.jsx` | — אין כותרת — |
| `MapComponent.jsx` | <reference path="../types/browser-globals.d.ts" /> <reference path="../types/leaflet-plugins.d.ts" /> |
| `MapProducerCard.jsx` | — אין כותרת — |
| `MenuImport.jsx` | «העלו תפריט» on the products card (MEH-3430). The owner picks photos or a PDF of her menu, the server reads it with Claude and returns rows, she checks and … |
| `MenuReviewRow.jsx` | One product the menu reader found, editable before it is published (MEH-3430): name, description, price from/to, unit. … |
| `MiniMap.jsx` | <reference path="../types/leaflet-plugins.d.ts" /> |
| `NationwideZones.jsx` | Under «משלוחים לכל הארץ»: the areas on other terms (MEH-3511) — e.g. «גוש דן, אקספרס»: its cities, fee, minimum, delivery time, own order cutoff and next … |
| `NavAppGlyphs.jsx` | — אין כותרת — |
| `NextDeliveryLine.jsx` | «המשלוח הבא: יום שלישי 24.11» under a delivery day heading, and «המשלוח הבא לחיפה: …» under the «מגיעים אלייך?» answer (MEH-3485). |
| `OAuthTermsLine.jsx` | — אין כותרת — |
| `OfferBadge.jsx` | Render a business's single active offer: a 'line' under the status in the business-page header (MEH #2659; … |
| `OwnerRow.jsx` | OwnerRow — who runs an event or an experience, as one tappable row: initial avatar, the line, and a forward chevron (the Eventbrite «Organized by» / Airbnb … |
| `OwnerSectionEditLink.jsx` | Owner-only per-section edit affordance on the public business page (MEH-1306) — a calm muted pencil beside a mapped section that deep-links into the matching … |
| `PageFillPanel.jsx` | «ספרו לנו על העסק» (MEH-3483). The owner writes about her business in her own words; Claude drafts the page fields; … |
| `Pagination.jsx` | — אין כותרת — |
| `PasskeyRecoveryPanel.jsx` | PasskeyRecoveryPanel — the second sign-in step when the passkey did not answer (MEH-3305): the admin cancelled the device prompt, or the device is gone. … |
| `PasswordInput.jsx` | MEH-306 — reusable password input with live policy feedback. |
| `PasswordStrength.jsx` | — אין כותרת — |
| `PhoneVerifyCard.jsx` | — אין כותרת — |
| `PickupSchedule.jsx` | Under a pickup point on the business page: its pickup days («איסוף ביום שלישי»), its own order cutoff («מקבלים הזמנות עד יום רביעי 15:00») and the next pickup … |
| `PrehydrationInputReplay.jsx` | — אין כותרת — |
| `PrimaryContactButton.jsx` | — אין כותרת — |
| `ProducerCard.jsx` | — אין כותרת — |
| `ProducerOAuthButtons.jsx` | <reference path="../types/browser-globals.d.ts" /> |
| `ProducerUpdatesButton.jsx` | — אין כותרת — |
| `ProducersClient.jsx` | — אין כותרת — |
| `ProductDescriptionSuggest.jsx` | «הצעת תיאור» under a product's description field (MEH-3479): asks the server for a short description from what the form holds now, shows it as an editable … |
| `ProductGroupSuggest.jsx` | «הצעת קבוצות» inside the organizer (MEH-3478): asks the server for a group per product that has none, shows the suggestion as a preview the owner edits … |
| `ProductOrganizer.jsx` | Inside the dashboard's products card: the owner sets the order of her products (drag handle or arrows) and sorts them into groups (MEH-3055). … |
| `ProductPrice.jsx` | A product's numeric price with what it is per (MEH-2936): «80₪ לבקבוק». The price sits in its own dir="ltr" span (MEH-1140 bidi isolation); … |
| `ProductPriceUnitField.jsx` | The «לפי מה המחיר?» dropdown in the owner's product form (MEH-2936): unit / kg / 100g / bottle / box, with a line that says where the choice shows. |
| `ProductsSection.jsx` | Producer-self CRUD editor for their product catalog (name, price range, diet flags, image). Self-fetching card — no props. |
| `ProfileCompletenessCard.jsx` | — אין כותרת — |
| `PromotedServiceChips.jsx` | — אין כותרת — |
| `RecipeForm.jsx` | RecipeForm — MEH-590 chunk 3/4 of the producer-recipes epic. |
| `RecipeStatusBadge.jsx` | RecipeStatusBadge — MEH-590 chunk 3/4 of the producer-recipes epic. |
| `RegisterNameCheck.jsx` | Under the business-name field of the sign-up form: when a live business already carries the typed name, say so and point its owner at the existing page … |
| `RegistrationCta.jsx` | The sign-up block on a public event / workshop page, by the owner's «איך נרשמים?» choice (MEH-2768): site_form → «הרשמה לסדנה/לאירוע» opens the form below it, … |
| `RegistrationMethodField.jsx` | «איך נרשמים?» — the owner picks how visitors sign up to an event or an experience (MEH-2762 chunk 2): on-site form (default), WhatsApp, phone, or an external … |
| `RegistrationOverlays.jsx` | The two phone surfaces of the event / workshop sign-up (MEH-3043, Sapir 13/11 option ב): a sticky bar that keeps the sign-up action in reach while the inline … |
| `RegistrationSessionSelect.jsx` | MEH-3447 — «מועד», the first field of the sign-up form on a recurring workshop with dates (placement option א of the MEH-3264 study; … |
| `RegistrationsList.jsx` | The owner's list of on-site sign-ups for one event / workshop (MEH-2766), as a closed-by-default disclosure on the manage page. … |
| `ReportButton.jsx` | — אין כותרת — |
| `ReportInfoModal.jsx` | ReportInfoModal — "מצאתן טעות בפרטים?" (MEH-1443) |
| `ReviewCardCanvas.jsx` | MEH-1428 chunk B ("ערכת שיתוף") — turns one of the owner's visible reviews into a ready-to-post 1080×1920 story card: stars, the review text, her business … |
| `ReviewInviteCard.jsx` | — אין כותרת — |
| `ReviewReportMenu.jsx` | The ⋮ at the top-end of a review card, with one item «דיווח על הביקורת» that opens the report dialog (MEH-3260). … |
| `ReviewsSection.jsx` | — אין כותרת — |
| `SaveButton.jsx` | — אין כותרת — |
| `SearchCorrectionNote.jsx` | Tell the person that the hero search re-read their query on the other keyboard layout ("sca" -> «דבש»), and let them search for exactly what they typed … |
| `SectionAnchorNav.jsx` | — אין כותרת — |
| `ShareButton.jsx` | — אין כותרת — |
| `ShareSiteActions.jsx` | — אין כותרת — |
| `Skeleton.jsx` | — אין כותרת — |
| `SmoothScrollProvider.jsx` | — אין כותרת — |
| `SpeedInsightsRedacted.jsx` | — אין כותרת — |
| `StatusPage.jsx` | — אין כותרת — |
| `StoryCardCanvas.jsx` | <reference path="../types/browser-globals.d.ts" /> |
| `SupportContactSheet.jsx` | The one «צרו קשר» sheet for business owners: WhatsApp · email · form, in that order, wherever the dashboard offers to reach the team (help row, rejected / … |
| `Toaster.jsx` | — אין כותרת — |
| `TrustBadge.jsx` | — אין כותרת — |
| `UnverifiedEmailNotice.jsx` | Inline notice shown in a producer create form when the API rejects the publish with the verified-email 403 — the gate message plus a "שלחו שוב" resend CTA, so … |
| `VerifyBanner.jsx` | — אין כותרת — |
| `WhatsAppQuestionChips.jsx` | — אין כותרת — |
| `WhatsAppShareButton.jsx` | — אין כותרת — |
| `WhatsAppUpdatesPill.jsx` | — אין כותרת — |
| `WhatsThis.jsx` | Reusable tap-to-expand "מה זה?" disclosure (MEH-1115). Business owners hit domain terms ("ערוץ ראשי", "טופס הזמנות", "קבוצת רכש") with no explanation at the … |
| `admin/AdminAlcoholPanel.jsx` | — אין כותרת — |
| `admin/AdminDeliveryPaymentPanel.jsx` | Lets the admin fill a business's delivery (day + minimum per city), order window and payment info — the same three editors the owner uses on … |
| `admin/AdminFeedbackModal.jsx` | The «request changes» / «reject» dialog of the admin review queues: a title, the item line, a feedback textarea, cancel and send. … |
| `admin/AdminLicenceExpiry.jsx` | On /admin, the approved businesses whose producer licence runs out within 30 days, so the admin can chase it before it lapses. |
| `admin/AdminLinkPanel.jsx` | — אין כותרת — |
| `admin/AdminLoadError.jsx` | — אין כותרת — |
| `admin/AdminOwnerStoryFields.jsx` | The «מאחורי העסק» fields on the admin producer form — the owner's one-line bio and her photo — for a page an admin builds on the owner's behalf. |
| `admin/AdminPhotoGrid.jsx` | The admin business form's photo grid. Marks the first photo as the main one (it is the card photo everywhere on the site) and lets the admin promote any other … |
| `admin/AdminProductImageButton.jsx` | Next to one product on the admin edit page: its current photo (if any) and «העלאת תמונה» / «החלפת תמונה». … |
| `admin/AdminProductImagesPanel.jsx` | On the admin edit page of a page that is NOT a draft (live, pending, hidden), list its products with the photo button, so the admin can add the photos the … |
| `admin/AdminProductImport.jsx` | The admin imports a business's catalog from its existing store as DRAFTS, reviews them, and approves (in the owner's place, Sapir 16.11) or deletes them. … |
| `admin/AdminRescueMetrics.jsx` | On /admin/analytics, the rescue-bag pilot's numbers for the last 30 days: bags offered and reserved, no-shows, repeat buyers. |
| `admin/AdminReviewReply.jsx` | On /admin/reviews, show the business owner's reply under a review, its AI flag, and a «הסירי תגובה» action with a confirm. |
| `admin/AdminRowMenu.jsx` | — אין כותרת — |
| `admin/AdminVerifiedPanel.jsx` | — אין כותרת — |
| `admin/BillingCsvButton.jsx` | — אין כותרת — |
| `admin/BillingYearCard.jsx` | — אין כותרת — |
| `admin/BlockUserConfirm.jsx` | MEH-3375 — the confirm step before an admin blocks a user. Blocking the only owner of a live business hides it and cancels its open bookings, each mailed … |
| `admin/ClaimLinkPanel.jsx` | — אין כותרת — |
| `admin/DraftPreviewLinkPanel.jsx` | — אין כותרת — |
| `admin/DraftProductsPanel.jsx` | — אין כותרת — |
| `admin/OwnerDetachControl.jsx` | — אין כותרת — |
| `admin/OwnerInvitePanel.jsx` | — אין כותרת — |
| `admin/ProducerForm.jsx` | — אין כותרת — |
| `admin/PublishWithConsentPanel.jsx` | — אין כותרת — |
| `admin/TestBusinessTag.jsx` | — אין כותרת — |
| `admin/TestBusinessToggle.jsx` | — אין כותרת — |
| `admin/WhatsappBlockedSection.jsx` | Admin: WhatsApp messages the outbound guard dropped outside production (MEH-3402 follow-up). … |
| `auth/AuthSplitLayout.jsx` | — אין כותרת — |
| `brand/Seed.jsx` | Seed — one seed, as a brand element (MEH-2833). Unlike the logo, a single seed may be rotated, scaled and given any seed colour. … |
| `brand/SeedBurst.jsx` | The seed layer's success moment (MEH-2833, board 5 v2): the logo bloom and two rings of single seeds pointing outward, left open below the bloom (as on the … |
| `brand/SeedMark.jsx` | SeedMark — the full bloom (the logo's five seeds, in place), as decoration. MEH-2833: the logo is never rotated, recoloured or rearranged; … |
| `dashboard/CoverageCtaToggle.jsx` | The owner's on/off for the public «לא מגיעים אליך?» CTA on her page. Saves immediately (one field, no form), like the alert switches in AlertPrefsPanel. |
| `dashboard/ProductVariantsField.jsx` | The «אפשרויות» block of the owner's product editor: sizes or flavours of one product, each with a name, an optional price, an «במלאי» switch and its place in … |
| `dashboard/ProductWeekdaysField.jsx` | «ימים שהמוצר זמין» in the owner's product form (MEH-3618): «כל הימים» (the default) or some of the seven days, as chips. Holds the mask in the form; … |
| `dashboard/RescueTab.jsx` | — אין כותרת — |
| `dashboard/google-profile/GoogleProfileCheck.jsx` | Compare what Google shows with the business page, on request (MEH-3641): name, phone and website each get a verdict; … |
| `dashboard/google-profile/GoogleProfileGuide.jsx` | The three steps to open or fix a Google Business Profile, the business page's link to paste into it, and Google's rule on review incentives (MEH-3641). |
| `dashboard/google-profile/GoogleProfileHubTile.jsx` | The «הפרופיל בגוגל» tile in the edit tab's hub, after «קשר» (MEH-3723, Sapir's pick 22/11). … |
| `dashboard/google-profile/GoogleProfileLink.jsx` | Find the business's own Google profile and link it, or unlink it (MEH-3641). The server accepts a link only when the Google name or phone matches the … |
| `dashboard/google-profile/GoogleProfileTool.jsx` | The body of /producer/dashboard/google-profile (MEH-3641): reads whether the business is linked and whether Google can be asked, then shows the link half, the … |
| `dashboard/orders/OrderActions.jsx` | The buttons an order's status offers the business, and the one dialog a button opens. … |
| `dashboard/orders/OrderCard.jsx` | One on-site order as the business sees it: who, what, when, how much, and the actions its status allows. |
| `dashboard/orders/OrderCustomersCard.jsx` | «הלקוחות שלכם» in the «הזמנות» tab: who ordered through the site, how many times and when last, «לקוח חוזר» from two orders, and a CSV download so the … |
| `dashboard/orders/OrderDialogs.jsx` | The four forms an order action may need: a final price after weighing, a decline reason, a proposed change, a hand-over code, and a cancel note. … |
| `dashboard/orders/OrderPrepList.jsx` | «מה להכין» at the top of the «היום» list: today's confirmed orders summed by product, so the business prepares from one list instead of adding up the cards. |
| `dashboard/orders/OrderProductsCard.jsx` | The business's products with the two switches on-site ordering needs every day: «פתוח להזמנה באתר» and «אזל כרגע». |
| `dashboard/orders/OrderSettingsCard.jsx` | The business's on-site ordering settings: on/off, auto-confirm with its per-slot cap, the customers' cancel cutoff, Shabbat and festivals, minimum order, slot … |
| `dashboard/orders/OrderSetupChecklist.jsx` | «מה חסר כדי לקבל הזמנות» — the four things a business needs before customers can order, each with a ✓ once done, at the top of the «הזמנות» tab. … |
| `dashboard/orders/OrderWindowsCard.jsx` | The weekly hand-over windows: on which days and hours a customer can collect (or get a delivery). The order slots are cut from these. |
| `dashboard/orders/OrdersBoard.jsx` | The four order lists of the «הזמנות» tab — מחכות לטיפול / מאושרות / היום / הסתיימו — with a count on each tab, and the empty states: no order ever (approved … |
| `group-buy/GroupBuyCalendarButton.jsx` | MEH-3597 (Sapir 21/11, «תבדוק מה עוד חסר»): a member who joined can put the pickup in her calendar, as an event page allows (MEH-2468). … |
| `group-buy/GroupBuyLineTotal.jsx` | MEH-3592: under the quantity field — what is left (a units cap) and what the order comes to («3 ק"ג × 13₪ = 39₪»). … |
| `group-buy/GroupBuyMemberPanel.jsx` | MEH-3592: what a participant sees on the join card — her confirmation, a quantity she can change until the deadline (Kickstarter: a pledge can change until … |
| `group-buy/GroupBuyOwnerSettings.jsx` | MEH-3592: on the owner's group-buy card — change the caps (never below what already joined, the server refuses that) and stop / reopen joins. … |
| `group-buy/GroupBuyPickupWindowFields.jsx` | MEH-3597: the pickup window on the create form — a day + start time, and an end time that day. … |
| `group-buy/GroupBuySafetyFields.jsx` | Two things a participant needs to collect safely (MEH-3610): the branch she picks up from, and the allergens the business declares — the same two a rescue bag … |
| `group-buy/GroupBuyWaitlistPanel.jsx` | MEH-3592: a full group buy offers a waitlist instead of a dead end (Eventbrite: a released ticket emails the first in line). … |
| `i18n/MergeMessagesProvider.jsx` | — אין כותרת — |
| `i18n/RouteMessagesProvider.jsx` | — אין כותרת — |
| `join/FeatureTip.jsx` | — אין כותרת — |
| `join/JoinFeatures.jsx` | — אין כותרת — |
| `join/JoinStickyBar.jsx` | — אין כותרת — |
| `legal/LegalPage.jsx` | The shell of the three legal pages (privacy, terms, accessibility): the page heading, its date line(s), and one card per section with an h2. |
| `offer-detail/AllergenSection.jsx` | «אלרגנים» on an offer page: what THIS business declares, or — when it declared nothing — a line that says so and tells the buyer to ask. … |
| `offer-detail/HowSteps.jsx` | «איך זה עובד» as numbered steps, one look for every offer page (group buy, rescue bag). Airbnb draws stays and experiences from one set of listing sections; … |
| `offer-detail/PickupLine.jsx` | The pickup time as one line right under an offer's title (clock, bold label, the window): the first thing a buyer decides on, and on a phone the «where» … |
| `offer-detail/WhereSection.jsx` | «איפה ומתי מקבלים» for an offer page: icon rows (when, where, pickup, delivery), then the map with Waze / Google, or — when only a text address is known — the … |
| `producer/BusinessQrCard.jsx` | — אין כותרת — |
| `producer/DraftSubmitBanner.jsx` | — אין כותרת — |
| `producer/FeedPostCanvas.jsx` | MEH-3330 — the «פוסט מוכן לשיתוף» card in the owner's share kit. She picks a moment (this week · a new product · an upcoming holiday), sees the 4:5 post built … |
| `producer/FirstMomentCard.jsx` | A once-only «רגע ראשון» card at the top of the dashboard home — first review, first WhatsApp click, 100 views, first follower (MEH-3200 part 2; … |
| `producer/LinkEverywhere.jsx` | MEH-3331 — «הקישור שלך בכל מקום»: four places a business puts its page link once (Instagram bio, Facebook page button, Google profile, WhatsApp Business … |
| `producer/MonthValueLine.jsx` | One line on the dashboard home: what the business got through the site this month, as bookings and their value (MEH-3194 point 1 — the value is shown before … |
| `producer/NewToolPill.jsx` | The «חדש» pill on a «כלים» tile (or an «עריכה» hub tile, MEH-3723) whose tool arrived in a release of the last 14 days (MEH-3200 part 2, copy approved 14/11). … |
| `producer/OrdersIntroCard.jsx` | «חדש: הזמנות מראש מהעמוד שלכם» — tells a business that on-site ordering exists and takes it to the «הזמנות» tab. … |
| `producer/OwnerAttentionCard.jsx` | «מה מחכה לך» — the top of the dashboard home lists what is waiting for the owner right now, each row one tap from the tool that handles it (MEH-3108; … |
| `producer/OwnerWelcomeCard.jsx` | A one-time «ברוכים הבאים למהמקור» note from the founders (Sapir + Topaz, MEH-3323) at the top of the dashboard home for a new business (≤ 30 days old), closed … |
| `producer/RequestReviewCard.jsx` | — אין כותרת — |
| `producer/ShareKitSection.jsx` | — אין כותרת — |
| `producer/ShareVisitsLine.jsx` | MEH-3331 — one line on the insights page: how many visits came through links the owner shared (share kit, link-everywhere) in the last 30 days. … |
| `producer/ToolGroupCard.jsx` | One «כלים» card for a group of tools (MEH-3669): «אירועים» holds events + experiences, «הזדמנויות» group buys + surprise bags — the same split the bottom nav … |
| `producer/VanityLinkCard.jsx` | «הלינק שלי» — the business's short public link with «העתקה» and «שתפו» (the phone's own share sheet). |
| `producer/WeeklySummaryToggle.jsx` | The owner's on/off for the weekly summary email, at the bottom of «תובנות» (MEH-3212). … |
| `producer/WhatsNewCard.jsx` | «חדש במהמקור» — the top-of-home card that shows the newest release lines until the owner closes it or opens the archive (MEH-3200, placement א׳ chosen by … |
| `producer/WhatsNewRow.jsx` | The fixed «מה חדש במהמקור» row above «צריכים עזרה?» on the dashboard home — the permanent way into the release archive, with a dot while the newest release is … |
| `producer/feed-post-draw.js` | <reference path="../../types/browser-globals.d.ts" /> |
| `producer/print-kit/PrintKitLayouts.jsx` | The four things a business prints from /producer/dashboard/qr-card: the A6 card, an A4 poster, a folded table sign and a sheet of 12 round stickers. … |
| `public/NotAPartyLine.jsx` | One line under a buy / reserve / sign-up button that names who the customer is dealing with, and says Mehamakor is not the seller. |
| `public/OrderBar.jsx` | The bar at the bottom of a business page once the buyer picked at least one product: «להזמנה · {count} פריטים · {total} ₪», which opens the order sheet. … |
| `public/OrderSheet.jsx` | The order request itself, opened from the order bar: how she gets it, when, her name and phone (proved by a WhatsApp code, unless it is her verified account … |
| `public/OrderSheetChoices.jsx` | The tap-to-pick parts of the order sheet: pickup or delivery as two buttons, the time slots as buttons (four shown, «מועדים נוספים» for the rest), and the … |
| `public/OrderSheetDayConflict.jsx` | In the order sheet, when the products picked share no day with an offered slot (MEH-3618): names the product that limits it, with its days, and offers to … |
| `public/OrderSheetPhone.jsx` | The phone and its WhatsApp code inside the order sheet: the number, «שליחת קוד», then the six-digit code field. … |
| `public/OrderStepper.jsx` | The «הוספה» control at the inline end of one product row on a business page that takes orders: «הוספה» at zero, − n + after, «אזל להיום» when the business … |
| `public/ProductFacts.jsx` | What the owner declared about one product (ingredients, allergens, storage) on the public product sheet. |
| `public/ProductGroupChips.jsx` | The business page's product filter by the owner's own groups (MEH-3055) — «הכל», one chip per group that holds products, and «עוד מוצרים» for products in no … |
| `public/ProductSheet.jsx` | — אין כותרת — |
| `public/ProductVariantsBlock.jsx` | In the product sheet, the product's sizes or flavours, each with its price. When the business takes orders on the site, each one has its own «הוספה», so a … |
| `public/ProductWeekdaysLine.jsx` | «זמין בימי שישי» / «זמין בימים ה׳–ו׳» under a product's name, on the business page row and in the product sheet (MEH-3618). … |
| `public/RecipeCard.jsx` | RecipeCard — one recipe on the business page (MEH-591), linking to /[slug]/recipes/[recipe_id]. |
| `public/RecipeDetail.jsx` | RecipeDetail — MEH-591 chunk 4/4 of the producer-recipes epic. |
| `public/RecipeJsonLd.jsx` | RecipeJsonLd — MEH-591 chunk 4/4 of the producer-recipes epic. |
| `public/RowOrderControl.jsx` | What sits at the inline end of a product row on a business page that takes orders: the «הוספה» stepper, or — for a product with two or more sizes or flavours … |
| `rescue/BagRow.jsx` | — אין כותרת — |
| `rescue/RescueConfirmation.jsx` | — אין כותרת — |
| `rescue/RescueErrorLine.jsx` | — אין כותרת — |
| `rescue/RescueHomeModule.jsx` | — אין כותרת — |
| `rescue/RescueList.jsx` | — אין כותרת — |
| `rescue/RescueReview.jsx` | — אין כותרת — |
| `rescue/RescueSection.jsx` | — אין כותרת — |
| `ui/AddToCalendarButton.jsx` | «הוספה ליומן» for one timed slot — an order's pickup or delivery window today; a bag or group-buy pickup next. … |
| `ui/Avatar.jsx` | One circle for the signed-in person everywhere it shows (Header menu button, BottomNav, account sheet, settings): their photo when there is one, otherwise ONE … |
| `ui/BackLink.jsx` | MEH-2728: a client component so a SERVER page can render it too (rescue/page.js). Phosphor icons read React context, which a server component has no access to … |
| `ui/Badge.jsx` | — אין כותרת — |
| `ui/Button.jsx` | — אין כותרת — |
| `ui/Card.jsx` | — אין כותרת — |
| `ui/Dialog.jsx` | — אין כותרת — |
| `ui/EmptyState.jsx` | — אין כותרת — |
| `ui/FactLine.jsx` | The only way a fact line on the business page gets an icon, so every such icon has the same size, colour and spacing. … |
| `ui/GoogleButton.jsx` | Our own «להמשיך עם Google» button (MEH-3690). Drawn by us, so it is on screen with the page or the modal — Google's rendered button arrived about a second … |
| `ui/Heading.jsx` | Render h1-h4 with the project's font tokens so pages stop repeating inline 'font-headline-* text-* font-bold' triplets. Net-new atom. |
| `ui/InlineMessage.jsx` | The one look for a form-level or page-level message that appears in place: a submit error, «נשמר», a load error in a row. … |
| `ui/Input.jsx` | — אין כותרת — |
| `ui/Link.jsx` | — אין כותרת — |
| `ui/OfferCard.jsx` | — אין כותרת — |
| `ui/PasswordField.jsx` | — אין כותרת — |
| `ui/Popover.jsx` | — אין כותרת — |
| `ui/PreviewBanner.jsx` | The one green «you are looking at a preview» strip, with the eye, above a page shown as someone else would see it. |
| `ui/RatingCompact.jsx` | — אין כותרת — |
| `ui/SectionHeading.jsx` | A section's h2 takes its size from a named ROLE, never from classes written at the call site. … |
| `ui/SeedProgressMark.jsx` | — אין כותרת — |
| `ui/Select.jsx` | — אין כותרת — |
| `ui/ShowMore.jsx` | — אין כותרת — |
| `ui/StruckPrice.jsx` | The one way a crossed-out price is drawn: an <s>, left-to-right so ₪ and the digits keep their order inside RTL, muted, struck. … |
| `ui/Switch.jsx` | Every role="switch" draws the same track: 40×24, a 16px knob that sits at the inline-START when off and the inline-END when on (logical insets, so it moves … |
| `ui/Textarea.jsx` | — אין כותרת — |
| `ui/Tooltip.jsx` | — אין כותרת — |
| `ui/field.jsx` | One source for the look of a compact field (border, radius, focus ring, error border, disabled) and for the label + message wiring around it, so Input, Select … |
| `ui/index.js` | Barrel export for the atomic UI layer (MEH-602). |
| `ui/overlay-icon-button.js` | MEH-3115: one anatomy for every icon-only button that sits ON a photo — the business hero's heart / share / bell, the recipe, event and experience cover … |

### אתר — קבצים שאינם route תחת `frontend/app`

| קובץ | מה הוא עושה (מהכותרת) |
|---|---|
| `[locale]/[slug]/ProducerGone.jsx` | MEH-2534: what the URL of a DELETED business shows. The backend answers 410 for a slug held by an ownerless 'retired_slugs' tombstone (MEH-2528), so the … |
| `[locale]/about/AboutClient.jsx` | AboutClient — consumer /about page. S8 Direction D "Feature Standfirst": editorial cream longread — hero · founder story (portrait standfirst) · cream … |
| `[locale]/about/badges/BadgesExplainer.jsx` | BadgesExplainer — body of /about/badges (MEH-2701). |
| `[locale]/about/process/AboutProcessClient.jsx` | AboutProcessClient — consumer /about/process page. S11 "תהליך הקבלה" Direction D "Criteria in the Open": editorial cream surface — hero · 4-step personal … |
| `[locale]/account-deleted/AccountDeletedClient.jsx` | MEH-3248 (B3): the confirmation after an account deletion. Replaces the settings-page «grace» panel, which promised a 30-day undo that never existed (deletion … |
| `[locale]/admin/AdminLayoutClient.jsx` | — אין כותרת — |
| `[locale]/admin/copy/CopyScreenClient.jsx` | MEH-3672 (item 6 of MEH-3652). Every string in he.json, one collapsible block per group, each saying which screens read it. … |
| `[locale]/admin/copy/copy-filter.js` | MEH-3672. The pure half of /admin/copy: flatten he.json into rows, and pick the groups and rows that match a search and a screen. … |
| `[locale]/admin/dashboard-data.js` | — אין כותרת — |
| `[locale]/admin/help/topics.js` | MEH-2591 — the ordered list of «איך עושים…» help topics on /admin/help. Each topic is one task, answered in a few steps and closed by a link to the screen … |
| `[locale]/admin/producers/AdminDraftClaimActions.jsx` | — אין כותרת — |
| `[locale]/admin/producers/AdminDraftLinkAge.jsx` | — אין כותרת — |
| `[locale]/admin/producers/AdminDraftMissing.jsx` | — אין כותרת — |
| `[locale]/admin/producers/AdminProducersTable.jsx` | — אין כותרת — |
| `[locale]/admin/producers/AdminProducersToolbar.jsx` | — אין כותרת — |
| `[locale]/admin/producers/AdminReviewChecklist.jsx` | AdminReviewChecklist — the pre-approval review checklist for a pending producer, rendered as a sub-row in AdminProducersTable. |
| `[locale]/admin/producers/GooglePlaceLink.jsx` | GooglePlaceLink — MEH-2582 |
| `[locale]/admin/producers/ProducerDecisionModal.jsx` | ONE admin decision composer for a business awaiting review. The chosen REASON decides the outcome, not the button the admin happened to click: a fixable … |
| `[locale]/admin/producers/QueueSlaSummary.jsx` | One line above the admin producers table — how many businesses are waiting for review, and how long the oldest has waited. … |
| `[locale]/admin/producers/ReviewEvidence.jsx` | ReviewEvidence — MEH-1399 chunk 4, the «תיק בדיקה»: the links an admin needs while working a business, gathered next to the checklist instead of hunted for in … |
| `[locale]/admin/producers/sla-statuses.js` | The one answer to "is this row waiting on the admin, and therefore accruing the «עד 3 ימי עסקים» clock". … |
| `[locale]/admin/producers/use-admin-producers.js` | — אין כותרת — |
| `[locale]/admin/producers/use-reject-flow.js` | Controller for the admin decision composer — fetches the canonical reason labels, holds the modal's state, and routes the submit to ONE of two existing … |
| `[locale]/admin/producers/use-review-checklist.js` | State for the pre-approval review checklist. MEH-1399 Phase 2 switched the source from a frozen constant to the API and made the ticks PERSIST per producer, … |
| `[locale]/admin/queues.js` | — אין כותרת — |
| `[locale]/admin/settings/ChecklistSettings.jsx` | ChecklistSettings — MEH-1399 chunk 2. Edit the pre-approval review checklist without a deploy: reword an item, change its hint, reorder, retire, add. |
| `[locale]/admin/settings/PasskeySettings.jsx` | PasskeySettings — the signed-in admin's own passkeys (MEH-3305). |
| `[locale]/claim/ClaimClient.jsx` | — אין כותרת — |
| `[locale]/claim/claim-metadata.js` | — אין כותרת — |
| `[locale]/contact/ContactClient.jsx` | — אין כותרת — |
| `[locale]/delivery-waitlist/host-confirm/HostConfirmClient.jsx` | — אין כותרת — |
| `[locale]/delivery-waitlist/unsubscribe/UnsubscribeClient.jsx` | — אין כותרת — |
| `[locale]/draft-preview/[token]/DraftPreviewClient.jsx` | — אין כותרת — |
| `[locale]/events/EventsClient.jsx` | — אין כותרת — |
| `[locale]/events/[id]/EventDetailClient.jsx` | — אין כותרת — |
| `[locale]/experiences/[id]/ExperienceDetailClient.jsx` | — אין כותרת — |
| `[locale]/favorites/FavoritesClient.jsx` | — אין כותרת — |
| `[locale]/favorites/savedItems.js` | savedItems — the non-React half of /favorites' recipes / events / experiences (MEH-2560, chunk 5/5 of MEH-2555): load and parse the GET /users/me/saved … |
| `[locale]/forgot-password/ForgotPasswordClient.jsx` | — אין כותרת — |
| `[locale]/freshness/confirm/ConfirmClient.jsx` | — אין כותרת — |
| `[locale]/group-buys/GroupBuysClient.jsx` | — אין כותרת — |
| `[locale]/group-buys/[id]/GroupBuyDetailClient.jsx` | — אין כותרת — |
| `[locale]/home/ActiveFilterChip.jsx` | — אין כותרת — |
| `[locale]/home/HomeCategoryGrid.jsx` | — אין כותרת — |
| `[locale]/home/HomeClient.jsx` | — אין כותרת — |
| `[locale]/home/HomeHero.jsx` | — אין כותרת — |
| `[locale]/home/HomeProducersGrid.jsx` | — אין כותרת — |
| `[locale]/home/HomeSeasonalNow.jsx` | The "עכשיו בעונה" homepage module — an editorially curated strip of businesses whose seasonal mark has not expired. … |
| `[locale]/home/HomeStaticBlocks.jsx` | — אין כותרת — |
| `[locale]/login/LoginClient.jsx` | — אין כותרת — |
| `[locale]/map/MapClient.jsx` | — אין כותרת — |
| `[locale]/map/components/CityPickerModal.jsx` | — אין כותרת — |
| `[locale]/map/components/DeliveryContextBanner.jsx` | — אין כותרת — |
| `[locale]/map/components/FilterChipsBar.jsx` | — אין כותרת — |
| `[locale]/map/components/MapCardList.jsx` | — אין כותרת — |
| `[locale]/map/components/MapKey.jsx` | — אין כותרת — |
| `[locale]/map/components/MapPane.jsx` | — אין כותרת — |
| `[locale]/map/components/MapPickupPointPanel.jsx` | MEH-3756 — under the picked-business card on the phone map, when the tapped pin is a pickup point or a market stand: when and how to collect there (its hours, … |
| `[locale]/map/components/MobileSheetSelectedCard.jsx` | — אין כותרת — |
| `[locale]/map/components/NearMePill.jsx` | — אין כותרת — |
| `[locale]/map/components/ServiceChipRow.jsx` | — אין כותרת — |
| `[locale]/map/state/useFirstVisitHints.js` | — אין כותרת — |
| `[locale]/map/state/useMapFilters.js` | — אין כותרת — |
| `[locale]/map/state/useMapSync.js` | — אין כותרת — |
| `[locale]/map/state/useProducersFeed.js` | — אין כותרת — |
| `[locale]/my-group-buys/MyGroupBuysClient.jsx` | «הקבוצות שלי»: the group buys the signed-in person joined, so she can get back to one without the email link. Running ones first. |
| `[locale]/my-orders/MyOrdersClient.jsx` | «ההזמנות שלי»: the signed-in buyer's on-site orders, newest first. Each row opens the order's existing status page. |
| `[locale]/newsletter/confirm/ConfirmClient.jsx` | — אין כותרת — |
| `[locale]/newsletter/unsubscribe/UnsubscribeClient.jsx` | — אין כותרת — |
| `[locale]/order/[id]/OrderBusinessLinks.jsx` | MEH-3755 — on the buyer's order page: the business's name as a link to its page, its contact button (the channel it chose), and Waze / Google Maps for the … |
| `[locale]/order/[id]/OrderStatusClient.jsx` | The buyer's status page for one on-site order: where it stands, when and where to collect it, the pickup code, what to pay, and the two things she can do — … |
| `[locale]/owner-invite/OwnerInviteClient.jsx` | — אין כותרת — |
| `[locale]/owner-invite/OwnerInviteConsents.jsx` | — אין כותרת — |
| `[locale]/owner-invite/OwnerInviteExistingAccount.jsx` | — אין כותרת — |
| `[locale]/owner-invite/owner-invite-metadata.js` | — אין כותרת — |
| `[locale]/owner-invite/useFreshGoogleCredential.js` | — אין כותרת — |
| `[locale]/producer/[id]/ProducerDetail.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/BusinessChatPrompt.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ContactCard.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ContactSidebar.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/OrderWindowStrip.jsx` | The headed, contained Info block that lists WHEN this business accepts orders — days and hours, read from 'order_window'. |
| `[locale]/producer/[id]/components/OtherBusinesses.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/OwnerCard.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/OwnerEditBar.jsx` | Owner-only affordance on the public business page — the page the owner opens to see how her business looks. … |
| `[locale]/producer/[id]/components/ProducerActivities.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ProducerHeader.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ProducerSections.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ReservistBadgeLine.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/ReviewExcerpt.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/components/StickyContactBar.jsx` | — אין כותרת — |
| `[locale]/producer/[id]/hooks/useLazyReviews.js` | — אין כותרת — |
| `[locale]/producer/[id]/hooks/useProducerData.js` | — אין כותרת — |
| `[locale]/producer/[id]/hooks/useStickyBar.js` | — אין כותרת — |
| `[locale]/producer/[id]/lib/order-status.js` | Pure mapper + formatters behind the producer page's SINGLE status element — resolves which of the five precedence branches wins and formats the Israel-local … |
| `[locale]/producer/[id]/lib/producer-format.js` | Display-format helpers for ProducerDetail. |
| `[locale]/producer/[id]/lib/section-nav.js` | — אין כותרת — |
| `[locale]/producer/dashboard/ChangesRequestedBanner.jsx` | Surface the admin's completion request ("נשאר להשלים") to the owner when a request-changes was sent (MEH-1011) so she knows exactly what to fix before … |
| `[locale]/producer/dashboard/DashboardLayoutClient.jsx` | Shared shell for the producer dashboard hub (MEH-964 Phase 1). Hosts the ONE UX auth gate for the whole /producer/dashboard/* subtree + the persistent tab nav … |
| `[locale]/producer/dashboard/RejectedBanner.jsx` | The rejected → resubmit loop, owner side (MEH-2210 chunk B). Shows WHAT did not pass, keyed on the admin's structured reason code, with a deep link to the … |
| `[locale]/producer/dashboard/edit/LocationHoursField.jsx` | The opening-hours picker of one location in the owner's LocationsEditor: seven day rows (א׳–ש׳), each with an open toggle and up to three time ranges. … |
| `[locale]/producer/dashboard/edit/LocationsEditor.jsx` | Owner CRUD for producer_locations (branch / pickup / market_stand) in the dashboard — the write UI for the map's per-location pins. … |
| `[locale]/producer/dashboard/edit/OrderCutoffPicker.jsx` | «מקבלים הזמנות עד»: a weekday select + a time input, for a row that has its own order cutoff — a pickup point (MEH-3512) or a delivery zone (MEH-3511). … |
| `[locale]/producer/dashboard/edit/OrderWindowEditor.jsx` | Weekly ORDER-acceptance window editor for the producer dashboard — 7 day rows (א׳–ש׳), a per-day toggle plus open/close time inputs, and a "clear all" action … |
| `[locale]/producer/dashboard/edit/OrganizerCityCard.jsx` | An organizer changes the city shown on her public page. |
| `[locale]/producer/dashboard/edit/PaymentInfoEditor.jsx` | «איך משלמים לך?» — the owner picks how customers pay (five tiles with icons + a «בחירת הכל» switch), when they pay (one of three, clearable), and one optional … |
| `[locale]/producer/dashboard/edit/PickupScheduleField.jsx` | In the location editor, for a pickup point or a market stand: which weekdays it is open for pickup, and (optionally) its own order cutoff — «מקבלים הזמנות עד … |
| `[locale]/producer/dashboard/edit/ReservistOwnedCard.jsx` | — אין כותרת — |
| `[locale]/producer/dashboard/edit/SpecialHoursEditor.jsx` | Per-date overrides ABOVE the weekly order window — "ערב ראש השנה 09:00–13:00", "כיפור: סגור" — for the producer dashboard. … |
| `[locale]/producer/dashboard/edit/TagsCard.jsx` | — אין כותרת — |
| `[locale]/producer/dashboard/edit/cards.jsx` | The self-service editor cards for the producer edit tab — categories, gallery images, map location, and the description card (hero description + tagline + AI … |
| `[locale]/producer/dashboard/edit/cards/BusinessNameCard.jsx` | Business-name change REQUEST form (admin approves; not a direct save). |
| `[locale]/producer/dashboard/edit/cards/CategoriesCard.jsx` | Owner-facing categories editor (saves category_ids via PUT /producers/me). |
| `[locale]/producer/dashboard/edit/cards/ContactChannelsCard.jsx` | Owner-facing contact channels editor (primary method + the value fields), saved via PUT /producers/me. |
| `[locale]/producer/dashboard/edit/cards/CustomQuestionsCard.jsx` | Owner's custom WhatsApp question chips, shown under the live list the public page serves. |
| `[locale]/producer/dashboard/edit/cards/DeliveryBulkDay.jsx` | «אותו יום לכמה ערים» — tick several delivery cities, pick one day, apply it to all of them at once. … |
| `[locale]/producer/dashboard/edit/cards/DeliveryCard.jsx` | Location mode + delivery areas editor. |
| `[locale]/producer/dashboard/edit/cards/DeliveryDefaultTerms.jsx` | The business-wide «מינימום הזמנה למשלוח» and «זמן משלוח (ימי עסקים)» in DeliveryCard's default block (MEH-3511). … |
| `[locale]/producer/dashboard/edit/cards/DeliveryTimeFields.jsx` | «זמן משלוח (ימי עסקים)»: from–to business days (MEH-3511), for the whole business (DeliveryCard default block) and for a zone (DeliveryZonesEditor). … |
| `[locale]/producer/dashboard/edit/cards/DeliveryZonesEditor.jsx` | «אזורי משלוח» — group several delivery cities into a named zone with its own days (several), minimum, fee and free-delivery threshold, instead of setting each … |
| `[locale]/producer/dashboard/edit/cards/DescriptionCard.jsx` | Hero description + tagline editor with the AI writing assist. |
| `[locale]/producer/dashboard/edit/cards/ImagesCard.jsx` | Owner-facing gallery images editor (upload, remove, reorder, free-plan cap). |
| `[locale]/producer/dashboard/edit/cards/KashrutCard.jsx` | Kashrut certificate requests: approved badges, own requests, request form. |
| `[locale]/producer/dashboard/edit/cards/LicenseCard.jsx` | Owner-facing producer licence number editor. |
| `[locale]/producer/dashboard/edit/cards/LogoCard.jsx` | The business's logo (MEH-3611): upload, replace, remove. It shows beside the business name on the business page and the bag page. |
| `[locale]/producer/dashboard/edit/cards/OffersCard.jsx` | Owner-facing offer (deal) editor. |
| `[locale]/producer/dashboard/edit/cards/OwnerStoryCard.jsx` | Owner story editor: bio text and owner photo. |
| `[locale]/producer/dashboard/edit/cards/PricingCard.jsx` | Price editor for the top product. |
| `[locale]/producer/dashboard/edit/cards/ViewOnPageLink.jsx` | The «view on page» back-link shown inside an expanded edit card. |
| `[locale]/producer/dashboard/orders/preview/OrderPreviewClient.jsx` | The owner's business page inside the dashboard, in preview mode, with her own order menu: she picks products and opens the order form to see what a buyer sees. |
| `[locale]/producer/dashboard/preview/PreviewClient.jsx` | — אין כותרת — |
| `[locale]/recommend/RecommendClient.jsx` | The public form a visitor uses to recommend a business that is not on Mehamakor yet. … |
| `[locale]/register/RegisterClient.jsx` | — אין כותרת — |
| `[locale]/register/producer/RegisterProducerClient.jsx` | — אין כותרת — |
| `[locale]/register/producer/registerProducerShared.js` | Constants and pure helpers of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx so the wizard and its step files … |
| `[locale]/register/producer/steps/AccountStep.jsx` | AccountStep — one frame of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx; … |
| `[locale]/register/producer/steps/CategoryStep.jsx` | CategoryStep — one frame of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx; … |
| `[locale]/register/producer/steps/ConfirmInboxStep.jsx` | ConfirmInboxStep — one frame of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx; … |
| `[locale]/register/producer/steps/ConfirmUpgradedStep.jsx` | ConfirmUpgradedStep — one frame of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx; … |
| `[locale]/register/producer/steps/ConsentSubmit.jsx` | ConsentSubmit — the consent checkboxes, the collection notice and the «הצטרפו» button that end the business registration wizard. … |
| `[locale]/register/producer/steps/DetailsStep.jsx` | guard-ok: moved verbatim out of RegisterProducerClient.jsx (MEH-3294), which was never type-checked; … |
| `[locale]/register/producer/steps/ReferralSourceField.jsx` | ReferralSourceField — «מאיפה שמעתם עלינו?» (MEH-1471), optional since MEH-2183. Moved verbatim out of StoryStep.jsx (MEH-3697) so the business path, which … |
| `[locale]/register/producer/steps/StoryStep.jsx` | StoryStep — one frame of the business registration wizard. MEH-3294: moved verbatim out of RegisterProducerClient.jsx; … |
| `[locale]/registration/[token]/CancelRegistrationClient.jsx` | MEH-2768 — «ביטול הרשמה ל-"{title}"». Loads what the token points at (GET /registrations/{token}) and cancels on one explicit tap (POST … |
| `[locale]/rescue/[offerId]/RescueOfferAction.jsx` | — אין כותרת — |
| `[locale]/rescue/[offerId]/RescueOfferDetails.jsx` | — אין כותרת — |
| `[locale]/rescue/[offerId]/RescueOfferPage.jsx` | — אין כותרת — |
| `[locale]/reset-password/ResetPasswordClient.jsx` | — אין כותרת — |
| `[locale]/share/ShareClient.jsx` | — אין כותרת — |
| `[locale]/unsubscribe/weekly/UnsubscribeClient.jsx` | — אין כותרת — |
| `[locale]/verify-email/VerifyEmailClient.jsx` | — אין כותרת — |
| `fonts.js` | The four brand typefaces, self-hosted from files committed in this repo. |
| `global-not-found.js` | App Router global 404 boundary (Next 16 experimental.globalNotFound, enabled in next.config.js). … |

<!-- END GENERATED -->
