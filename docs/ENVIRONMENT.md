# מפת משתני הסביבה — כל משתנה שהקוד קורא

כל שורה היא משתנה סביבה אחד שהקוד קורא: בשרת (שדה ב-`Settings` או קריאה ישירה) ובאתר (`process.env`). הטבלאות **נוצרות מהקוד** (MEH-3598) ולא נכתבות ביד: `tests/test_meh3598_env_map.py` סורק את הקוד ונכשל כשהקוד והמפה לא תואמים.

**כשמוסיפים משתנה חדש:** הטסט יאדים. מחדשים את המפה בפקודה שבראש הטסט, קוראים את השורה החדשה, ו**רושמים את המשתנה לספיר לפני ה-merge** (כלל רגרסיה 8 ב-`.claude/rules/workflow.md`): משתנה שלא הוגדר ב-Railway או ב-Vercel לא קיים בסביבה, גם אם הקוד קורא אותו.

מה המפה לא אומרת: איזה ערך מוגדר בכל סביבה, ואיפה (Railway / Vercel / GitHub). זה נמצא ב-[DEPLOYMENT.md](./DEPLOYMENT.md). העמודה «ברירת מחדל» אומרת רק אם יש אחת בקוד, לעולם לא מה היא, כך שהמסמך לא יכול להכיל סוד.

מה הסורק לא רואה: שם משתנה שנבנה בזמן ריצה (`process.env[x]`, `os.getenv(name)`), פירוק (`const { X } = process.env`) ושדה ב-`Settings` עם alias. בשרת קובץ שקורא שם דינמי מופיע בשורה נפרדת; באתר לא. נכון ל-21/11/2026 אין בקוד פירוק או alias, ושלושת הקבצים שקוראים `process.env[...]` דינמי הם קובצי בדיקות.

<!-- BEGIN GENERATED: tests/test_meh3598_env_map.py -->

46 Settings fields · 14 direct backend reads · 25 frontend (site) · 27 frontend (tests and tooling).

### שרת: שדות `Settings` (`backend/app/config.py`)

| משתנה | טיפוס | ברירת מחדל | ההערה שמעל השדה |
|---|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | יש | MEH-326: short-TTL access token (15 min) paired with a 14-day refresh token delivered via HttpOnly cookie. |
| `ADMIN_EMAIL` | `str` | ריק | Admin account — used as the notification recipient AND as the initial admin user seeded on first boot (see seed_data.py). |
| `ADMIN_PASSWORD` | `str` | ריק | — |
| `ADMIN_WHATSAPP_TO` | `str` | ריק | — |
| `ALGORITHM` | `str` | יש | — |
| `ANTHROPIC_API_KEY` | `str` | ריק | Anthropic (home-product moderation) |
| `ANTHROPIC_MODEL` | `str` | יש | — |
| `APPLE_CLIENT_ID` | `str` | ריק | Apple Sign In |
| `CLOUDINARY_API_KEY` | `str` | ריק | — |
| `CLOUDINARY_API_SECRET` | `str` | ריק | — |
| `CLOUDINARY_CLOUD_NAME` | `str` | ריק | Cloudinary |
| `CONTACT_EMAIL` | `str` | ריק | Destination for public contact-form submissions (POST /contact). |
| `CORS_ORIGINS` | `str` | יש | SECURITY FIX #7 (CORS). |
| `DATABASE_URL` | `str` | יש | — |
| `DATABASE_URL_PRODUCTION` | `str` | ריק | MEH-408 Phase 3: environment-aware DB URL. |
| `DATABASE_URL_STAGING` | `str` | ריק | — |
| `EMAIL_FROM_ADDRESS` | `str` | יש | MEH-453: extracted from email.py module constant. |
| `ENV` | `str` | יש | Environment flag (dev\|staging\|production). |
| `FRONTEND_URL` | `str` | יש | App |
| `GOOGLE_CLIENT_ID` | `str` | ריק | Google OAuth |
| `GOOGLE_PLACES_API_KEY` | `str` | ריק | MEH-1490: server-side Google Maps Platform key for the quiet Google-rating trust line (Places API New, Enterprise SKU: rating/userRatingCount). |
| `OTP_TEST_CODE` | `str` | ריק | — |
| `OTP_TEST_NUMBERS` | `str` | ריק | MEH-2231: a fixed OTP code for a fixed allow-list of TEST phone numbers, so a harness can pass the `phone_verified` submission gate outside production. |
| `PAGE_FRESHNESS_ENABLED` | `bool` | יש | MEH-3393: monthly page-freshness email to owners + the Sunday admin digest of pages unconfirmed for 60 days. |
| `PRODUCT_ORDERS_ENABLED` | `bool` | יש | MEH-3296: on-site product ordering (stages 2a-4). |
| `RAILWAY_ENVIRONMENT` | `str` | ריק | Railway injects RAILWAY_ENVIRONMENT ("staging" / "production") into every service; declared here so the OTP test-mode gate reads it through Settings like eve... |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `int` | יש | — |
| `RESCUE_BAGS_CITIES` | `str` | ריק | — |
| `RESCUE_BAGS_ENABLED` | `bool` | יש | MEH-2644: rescue-bags pilot. |
| `RESEND_API_KEY` | `str` | ריק | Email — Resend HTTP API (replaces smtplib; Railway blocks SMTP ports) Sign up at resend.com, verify mehamakor.co.il domain, copy the API key. |
| `SECRET_KEY` | `str` | יש | — |
| `SUPER_ADMIN_EMAIL` | `str` | ריק | MEH-2890 (Sapir 10/11): the one account no admin can demote or delete. |
| `VAPID_PRIVATE_KEY` | `str` | ריק | MEH-54: VAPID keys for Web Push notifications. |
| `VAPID_PUBLIC_KEY` | `str` | ריק | — |
| `VAPID_SUBJECT` | `str` | יש | MEH-2123: .co.il, and `contact@` rather than `admin@` — the latter was never a real mailbox. |
| `WATCHDOG_ENABLED` | `bool` | יש | MEH-509 PR2b: after-hours watchdog feature flag. |
| `WEBAUTHN_ORIGIN` | `str` | ריק | — |
| `WEBAUTHN_RP_ID` | `str` | ריק | MEH-3305: admin passkeys (WebAuthn). |
| `WEEKLY_OWNER_SUMMARY_ENABLED` | `bool` | יש | — |
| `WHATSAPP_ACCESS_TOKEN` | `str` | ריק | — |
| `WHATSAPP_API_VERSION` | `str` | יש | — |
| `WHATSAPP_APP_SECRET` | `str` | ריק | MEH-509 PR2c — inbound webhook receiver (GET challenge + POST receive). |
| `WHATSAPP_BUSINESS_ID` | `str` | ריק | — |
| `WHATSAPP_COMMUNITY_INVITE_URL` | `str` | ריק | MEH-2134 — invite link to the "מהמקור · עדכונים לבתי עסק" WhatsApp community, offered in the producer-approval email only. |
| `WHATSAPP_PHONE_NUMBER_ID` | `str` | ריק | WhatsApp Cloud API (MEH-508 — direct Meta Graph, replaces Twilio). |
| `WHATSAPP_VERIFY_TOKEN` | `str` | ריק | — |

### שרת: קריאה ישירה מהסביבה (`os.getenv` / `os.environ`)

| משתנה | קבצים (`backend/app/`) |
|---|---|
| `ADMIN_EMAIL` | `startup.py` |
| `APP_VERSION` | `sentry.py` |
| `BACKEND_SENTRY_DSN` | `sentry.py` |
| `EDGE_PROXY_SECRET` | `rate_limit.py` |
| `ENV` | `logging_config.py`, `sentry.py`, `services/job_heartbeat.py` |
| `JWT_SECRET_KEY` | `config.py` |
| `LOG_FORMAT` | `logging_config.py` |
| `LOG_LEVEL` | `logging_config.py` |
| `MIGRATION_DATABASE_URL` | `database.py` |
| `PORT` | `startup.py` |
| `RAILWAY_ENVIRONMENT` | `services/job_heartbeat.py` |
| `RAILWAY_GIT_COMMIT_SHA` | `sentry.py` |
| `SECRET_KEY` | `config.py`, `startup.py` |
| `TRUSTED_PROXY` | `rate_limit.py` |

קבצים שקוראים שם שנקבע רק בזמן ריצה: `database.py`, `routers/health.py`, `startup.py`

### אתר: `process.env` בקוד שרץ (`frontend/`)

| משתנה | קבצים (`frontend/`) |
|---|---|
| `BACKEND_URL` | `next.config.js` |
| `EDGE_PROXY_SECRET` | `middleware.js` |
| `NEXT_PUBLIC_API_URL` | `lib/env.client.js`, `lib/env.server.js`, `middleware.js` +1 |
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_PUBLIC_APPLE_REDIRECT_URI` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `lib/env.client.js` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `lib/places.js` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `lib/analytics.js` |
| `NEXT_PUBLIC_POSTHOG_KEY` | `lib/analytics.js` |
| `NEXT_PUBLIC_RESCUE_BAGS_ENABLED` | `components/HomeWhatsOn.jsx`, `lib/listing-supply.js`, `lib/rescue.js` +1 |
| `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.js`, `next.config.js`, `sentry.edge.config.js` +1 |
| `NEXT_PUBLIC_SENTRY_ENV` | `instrumentation-client.js` |
| `NEXT_PUBLIC_SITE_URL` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_PUBLIC_SUPPORT_PHONE` | `lib/env.client.js`, `lib/env.server.js` |
| `NEXT_RUNTIME` | `instrumentation.js` |
| `NODE_ENV` | `app/[locale]/dev/components/page.jsx`, `app/[locale]/error.js`, `app/[locale]/map/state/useMapSync.js` +8 |
| `SENTRY_DSN` | `next.config.js`, `sentry.edge.config.js`, `sentry.server.config.js` |
| `SENTRY_ENV` | `sentry.edge.config.js`, `sentry.server.config.js` |
| `SENTRY_ORG` | `next.config.js` |
| `SENTRY_PROJECT` | `next.config.js` |
| `SKIP_ENV_VALIDATION` | `lib/env.client.js`, `lib/env.server.js` |
| `VERCEL_ENV` | `lib/env.client.js`, `next.config.js`, `sentry.edge.config.js` +1 |
| `VERCEL_GIT_COMMIT_REF` | `sentry.edge.config.js`, `sentry.server.config.js` |

### אתר: `process.env` בבדיקות ובכלים (`e2e/`, `__tests__/`, `scripts/`, `qa-*`, קובצי config)

| משתנה | קבצים (`frontend/`) |
|---|---|
| `CI` | `playwright.config.ts`, `qa-meh1754-recipe-error-state.mjs`, `scripts/static-routes-guard.mjs` |
| `DEMO_ADMIN_PASSWORD` | `e2e/flows/30-admin-panel-tabs.spec.ts`, `e2e/flows/33-admin-producers-tab.spec.ts`, `e2e/flows/37-outreach-prefill.spec.ts` +2 |
| `DEMO_CONSUMER_PASSWORD` | `e2e/_qa-archive/qa-meh1858-fingerprint-proof.mjs` |
| `DEMO_OWNER_PASSWORD` | `e2e/_qa-archive/qa-meh1858-login-probe.mjs`, `e2e/flows/25-role-reachability.spec.ts`, `e2e/marketing/join-screenshots.mjs` |
| `E2E_CLOUDINARY_COUNT` | `e2e/flows/_cloudinary-stub.ts` |
| `E2E_CLOUDINARY_STUB` | `e2e/flows/_cloudinary-stub.ts` |
| `EDGE_PROXY_SECRET` | `__tests__/MiddlewareApiEdgeIp.test.js` |
| `GITHUB_REPOSITORY` | `e2e/qa-meh1853-cls.mjs` |
| `GITHUB_SHA` | `e2e/qa-meh1853-cls.mjs` |
| `NEXT_PUBLIC_RESCUE_BAGS_ENABLED` | `__tests__/MEH3117RescueAlert.test.jsx` |
| `NEXT_PUBLIC_SENTRY_DSN` | `__tests__/ClaimTelemetryWiring.test.jsx` |
| `NODE_ENV` | `__tests__/ClaimTelemetryWiring.test.jsx` |
| `PLAYWRIGHT_BASE_URL` | `e2e/_qa-archive/qa-meh1814-cta-occlusion.mjs`, `e2e/_qa-archive/qa-meh1831-fonts-lenis.mjs`, `e2e/_qa-archive/qa-meh1831-glyph-probe.mjs` +11 |
| `PLAYWRIGHT_CHROMIUM_PATH` | `e2e/_qa-archive/qa-meh2249-experience-create-dashboard.mjs`, `e2e/_qa-archive/qa-meh2589-story-card.mjs`, `e2e/_qa-archive/qa-meh2915-draft-identity.mjs` +8 |
| `PORT` | `qa-meh2785-shots.mjs`, `qa-meh2793-print-probe.mjs` |
| `PW_WEBKIT` | `e2e/webkit-tls.ts`, `playwright.config.ts` |
| `QA_BASE_URL` | `e2e/_qa-archive/qa-meh2070-admin-mobile.mjs`, `e2e/_qa-archive/qa-meh2094-top-product.mjs`, `e2e/_qa-archive/qa-meh2100-draft-live.mjs` +25 |
| `SENTRY_DSN` | `__tests__/ClaimTelemetryWiring.test.jsx` |
| `SMOKE_ADMIN_EMAIL` | `e2e/flows/19-publish-approve-visible.spec.ts`, `e2e/flows/20-admin-recipes-queue.spec.ts`, `e2e/flows/22-register-personas.spec.ts` +1 |
| `SMOKE_ADMIN_PASSWORD` | `e2e/flows/19-publish-approve-visible.spec.ts`, `e2e/flows/20-admin-recipes-queue.spec.ts`, `e2e/flows/22-register-personas.spec.ts` +1 |
| `TEST_URL` | `e2e/_qa-archive/qa-meh1858-fingerprint-proof.mjs`, `e2e/_qa-archive/qa-meh1858-login-probe.mjs`, `e2e/_qa-archive/qa-meh1871-mobile.mjs` +11 |
| `TITLE_PATTERN_DUMP` | `__tests__/title-pattern.test.js` |
| `UPDATE_HAND_WRITTEN_BASELINE` | `__tests__/HandWrittenRatchet.test.js` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `e2e/_qa-archive/qa-meh1390-dead-tab.mjs`, `e2e/_qa-archive/qa-meh1836-delivery-chip.mjs`, `e2e/_qa-archive/qa-meh1836-proof.mjs` +23 |
| `VERCEL_BYPASS_SECRET` | `e2e/auth-fixture.ts`, `e2e/global-setup.ts`, `e2e/golden/session.ts` +2 |
| `VERCEL_ENV` | `scripts/static-routes-guard.mjs` |
| `WRITE_CHAT_KNOWLEDGE` | `__tests__/ChatKnowledgeSync.test.js` |

<!-- END GENERATED -->
