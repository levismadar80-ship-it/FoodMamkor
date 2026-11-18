# Security incident runbook (MEH-3309)

When to use it: a secret leaked (pushed to GitHub, pasted in a chat, in a log), an account was taken over (admin, a vendor console, a business owner), or personal data may have reached someone who should not have it.

The order follows NIST SP 800-61r3 (April 2025): **detect → contain → eradicate → recover → lessons.** In an incident, do the steps in order and write down the time of each one. That log is what you report from.

---

## 0. First 15 minutes

1. Open a Linear card titled `אירוע אבטחה <date>`, label `not-cc`. Every step below gets a timestamped line in it.
2. Decide what is exposed: a **secret**, an **account**, or **personal data** (any of: emails, phones, addresses, IPs, passwords hashes). More than one is common.
3. Do not delete evidence (logs, the leaking commit, the Sentry event) before you have copied it into the card. Rotating a secret is containment; deleting history is not.
4. Personal data involved → start the clock for §4 now, not after the fix. The Privacy Protection Authority's first Amendment 13 sanction (July 2026) was for reporting *after* the fix instead of when the incident was known.

---

## 1. Secret inventory — where each one sits and how to rotate it

"Breaks during rotation" is what users see between the old value dying and the new one being live everywhere.

| Secret | Where it lives | How to rotate | Breaks during rotation |
|---|---|---|---|
| `JWT_SECRET_KEY` (or `SECRET_KEY`) | Railway (staging, production) | New random 64+ chars in Railway → redeploy backend | **Every session, every user** is logged out (all access + refresh tokens fail signature). No partial rollover today — see §6. |
| `DATABASE_URL` | Railway (the Postgres plugin owns it) | Rotate the Postgres password in Railway → it re-injects the URL → redeploy | Backend down until redeploy finishes. |
| `STAGING_DATABASE_URL_READONLY` | GitHub Actions secret | New read-only role password in Railway staging → update the Actions secret | Only the CI probes that read it. |
| Google OAuth client (`GOOGLE_CLIENT_ID` + its secret in Google Cloud) | Railway + Vercel env, Google Cloud console | Google Cloud → Credentials → reset secret / new client → update env → redeploy both | «התחברות עם Google» fails until both are live. |
| Apple sign-in (`APPLE_CLIENT_ID`, key in Apple developer) | Railway, Apple developer console | Revoke the key, create a new one, update env | Apple sign-in fails until live. |
| `RESEND_API_KEY` | Railway | Resend → API keys → create new, update Railway, revoke old | Emails (verify, reset password) fail in between. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Railway | Cloudinary → Settings → API keys → new pair, update, delete old | Uploads fail in between; delivery of existing images is unaffected. |
| `BACKEND_SENTRY_DSN` + the frontend DSN | Railway, Vercel | Sentry → project → Client keys → new key, disable old | Error reporting only. A leaked DSN lets someone spam events, not read them. |
| `ANTHROPIC_API_KEY` | Railway | Anthropic console → new key, revoke old | AI fails open (moderation = APPROVED, chat = Hebrew offline). **Watch the moderation queue by hand** while it is off. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Railway, Meta business console | Meta → System users → regenerate token; app secret reset in the app dashboard; webhook verify token changed in both places | WhatsApp sends and the delivery webhook fail in between. |
| `GOOGLE_PLACES_API_KEY` | Railway | Google Cloud → new key with the same API + referrer restrictions | Address autocomplete. |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | Railway (+ public key in the frontend) | New pair, deploy both | **Every push subscription becomes invalid**; users must re-allow notifications. Rotate only if the private key leaked. |
| `ADMIN_PASSWORD` (seed) | Railway | Change it, and change the real admin account password in the app | — |
| Actions secrets: `RAILWAY_PRODUCTION_TOKEN`, `RAILWAY_STAGING_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `LINEAR_API_KEY`, `SMOKESHOW_AUTH_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `DEMO_*_PASSWORD`, `SMOKE_ADMIN_*` | GitHub → Settings → Secrets → Actions | Revoke at the issuing service, create new, paste into Actions | The workflow that uses it fails until updated. |

Order when several leaked at once: **database → JWT → OAuth → everything else.** The first two give direct access to user data; the rest give access to a vendor.

After rotating, prove the old value is dead (a request with it fails), not only that the new one works.

---

## 2. An admin account was taken over

1. **Lock the attacker out of every session:** the owner logs in and runs the log-out-everywhere action (`POST /auth/logout-all-devices`, `backend/app/routers/auth.py:1347`; the client call is `frontend/lib/auth-context.js:271`). It increments `token_version`; every other device gets 401 on its next request (`backend/app/auth.py:362`).
   - **Gap:** `_check_token_version` is fail-open for a token with **no** `tv` claim (`auth.py:363-366`, tokens issued before MEH-206). Access tokens live 15 minutes, so any such token is long dead, but if in doubt rotate `JWT_SECRET_KEY` (§1) — that kills every token regardless.
2. Change the password (this also invalidates tokens issued before the change).
3. If the attacker could not be locked out (owner cannot log in): rotate `JWT_SECRET_KEY`, then reset the password through the reset flow from the owner's mailbox.
4. If the role itself was changed (admin removed, attacker made admin): [admin-role-recovery.md](./admin-role-recovery.md).
5. **Review what they did.** There is no admin audit log yet (MEH-3306). Check, for the incident window: Railway HTTP logs for `/admin/*` and `/api/admin/*` from unknown IPs; recently changed rows (`updated_at`) in `producers`, `users`, `products`; Sentry breadcrumbs. Record what changed in the card.
6. Check the mailbox of the account: an attacker who held the email can re-take the account with a password reset.

For a vendor console (GitHub, Railway, Vercel, Cloudflare, Google, Resend, domain registrar): change the password, revoke all sessions and tokens in that console, re-check 2FA, then rotate every secret that console could read (§1).

---

## 3. Contain, eradicate, recover

- **Contain:** rotate, revoke sessions, and if data is still leaking through a route, take that route down (a hotfix branch that returns 503) rather than waiting for the real fix.
- **Eradicate:** find the root cause (how did the secret get out, how was the account entered) and fix it on a branch with a test, per the Bug Protocol in `.claude/rules/workflow.md`.
- **Recover:** redeploy staging, confirm, release to production through the normal `staging → main` flow (hotfix allowed). Back-merge to staging.
- A secret in git history: rotating is the fix. Rewriting history does not un-leak it (forks, caches, scanners) — and force-push is denied here anyway.

---

## 4. Reporting — Privacy Protection Authority and users

The legal basis: **Protection of Privacy Regulations (Data Security), 5777-2017, regulation 11**, and Amendment 13 to the Protection of Privacy Law (in force since 14/08/2025).

- **Who must report:** a database at the **medium** or **high** security level under the regulations. For medium, the duty applies when the unauthorised use or harm touched a **substantial part** of the database. Whether Mehamakor's user database is basic or medium is a legal question — confirm it with a lawyer once, and write the answer here.
- **What counts as a severe incident:** information from the database was used without authorisation or beyond the permission given, or its integrity was harmed. The Authority's examples include an intrusion into the network with a reasonable suspicion that the intruder reached the database.
- **When:** **immediately** — the duty starts once there is enough information that a severe incident happened, not when it is fixed. In July 2026 the Authority fined a health fund NIS 256,000 for reporting about two months late, after finishing tests and fixing the fault.
- **How:** the Authority's incident-report form on gov.il (search «דיווח על אירוע אבטחה חמור הרשות להגנת הפרטיות»). Report from the card's timeline (§0).
- **Users:** the Registrar may order notifying the people affected. Independently, tell affected users plainly what leaked and what to do (e.g. change a reused password). The wording is user-facing copy and needs the usual approval.

Sources: law-firm summaries of regulation 11 and the July 2026 enforcement notice (Shibolet, Gornitzky). **Check the primary text on gov.il / Nevo before relying on the details** — this section is a pointer, not legal advice.

---

## 5. Lessons

Within a week: a short write-up in the card (timeline, root cause, what made it possible, what would have caught it sooner), and a Linear card for each fix. A recurring pattern gets a line in `docs/BUG_PATTERNS.md`.

---

## 6. Recommendation — two JWT keys during rotation (not built)

Today `JWT_SECRET_KEY` is one value, so rotating it logs everyone out at once. The standard fix: sign with the new key and a `kid` header, accept both the current and the previous key for one refresh-token lifetime (14 days), then drop the old one. Worth a card if rotation without a mass logout matters; it touches `auth.py`, so it is HIGH-RISK and goes chunk by chunk.
