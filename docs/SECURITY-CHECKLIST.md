# 📋 Security Checklist (MEH-258)

> **Pre-merge checklist, not a reference doc.** The full threat model
> and header lists live in [SECURITY.md](./SECURITY.md); the narrative
> traps with full context live in
> [LOCKED_DECISIONS.md](./LOCKED_DECISIONS.md). This file is what you
> actually tick off before opening a PR that touches auth, uploads,
> rate limits, headers, or any mutation endpoint.
>
> **How to use:** for each category below, tick every box that applies
> to your PR. If a box describes a trap you don't understand, **stop
> and read the referenced file:line before continuing** — the trap is
> invisible until it costs a production incident.

---

## 1. Auth / JWT

- [ ] **Never hardcode a JWT secret.** Secret comes from
  `JWT_SECRET_KEY` (or `SECRET_KEY`) env var only.
  - **How to test:** run `ENV=production` locally with no
    `JWT_SECRET_KEY` set → app must refuse to start with
    `RuntimeError`.
  - **File:** `backend/app/config.py:14` (`_validate_production_secrets`)
- [ ] **Dev ephemeral secret is fine for dev, never for prod.** The
  `_DEV_SECRET_SENTINEL` path generates a per-process random secret
  and logs a loud warning. Tokens invalidate on restart.
  - **File:** `backend/app/config.py:15`
- [ ] **Token TTL stays at 24h.** Do not extend to 7 days without a
  refresh-token design first (v2 scope).
  - **File:** `backend/app/config.py` (`ACCESS_TOKEN_EXPIRE_MINUTES`)
- [ ] **`get_current_user_optional` must re-raise 403.** Blocked
  users must never be treated as anonymous (MEH-143 adversarial
  finding).

---

## 2. Rate limiting

- [ ] **Never use `get_remote_address` directly behind Railway.**
  Behind the Railway edge, `request.client.host` resolves to the
  proxy's own IP (`100.64.0.X` CGN range) — every user collapses
  into one rate-limit bucket.
  - **Use:** `get_real_client_ip` from `backend/app/rate_limit.py:54`
  - **File:** `backend/app/rate_limit.py:83` (limiter wiring)
- [ ] **`TRUSTED_PROXY=1` must be set on Railway staging + prod.**
  Without it, the key function falls through to
  `get_remote_address` and the bypass bug returns.
  - **How to test:** hit a rate-limited endpoint 10× from the same
    client → the 11th call must 429.
  - **File:** `backend/app/rate_limit.py:50` (`_trusted_proxy_enabled`)
- [ ] **Per-route limits defined in the router file, not inline.**
  Adversarial review flags inline limits as an anti-pattern.

---

## 3. IDOR (ownership checks on mutations)

- [ ] **Every PUT / PATCH / DELETE checks ownership.** Pattern:
  ```python
  is_owner = resource.owner_id == current_user.id
  is_admin = getattr(current_user, "role", None) == "admin"
  if not (is_owner or is_admin):
      raise HTTPException(403)
  ```
  - **Canonical examples:**
    - `backend/app/routers/events.py:272`
    - `backend/app/routers/experiences.py:189`
    - `backend/app/routers/producers.py:403`
    - `backend/app/routers/reviews.py:347`
- [ ] **Tested with a second user's token.** A 200 for the owner is
  not proof — write a test that uses User B's JWT to mutate User A's
  resource and asserts 403.
- [ ] **Guard tests send schema-valid payloads.** A 422 proves
  nothing about the guard (regression rule 6). Use
  `valid_*_payload()` fixtures from `tests/conftest.py`.

---

## 4. File upload

- [ ] **Magic-byte sniff, not MIME header.** `content_type` is
  client-supplied and spoofable. Read the first bytes and match
  against the allowed set (`\x89PNG`, `\xFF\xD8\xFF` for JPEG,
  `RIFF....WEBP`, `GIF8`).
  - **File:** `backend/app/routers/upload.py:33` (`_sniff_image_type`)
  - **File:** `backend/app/routers/upload.py:70` (sniff before accept)
- [ ] **`MAX_FILE_SIZE + 1` read guard.** Reading exactly
  `MAX_FILE_SIZE` hides files that are exactly at the limit + 1
  byte from the size check.
  - **File:** `backend/app/routers/upload.py:61`
- [ ] **Cloudinary upload, not local disk.** Never write user files
  to the app's filesystem — Railway's ephemeral FS loses them on
  redeploy and opens a traversal surface.

---

## 5. Headers / CSP

- [ ] **CSP allows Google GSI + Cloudinary explicitly.** Breaking
  either silently kills OAuth or image rendering.
  - **Full allowlist:** [SECURITY.md](./SECURITY.md) § "HTTP Security
    Headers"
- [ ] **COOP header is `same-origin-allow-popups`** for Google One
  Tap / FedCM (MEH-278). Do not revert to `same-origin`.
  - **File:** `next.config.js`
- [ ] **CORS is strict — no `*`.** Allowed origins are the canonical
  domain + preview subdomain only.

---

## 6. Secrets / config

- [ ] **`TRUSTED_PROXY=1`** — required for rate-limit correctness
  (see §2). Not set = bug returns.
- [ ] **`RESEND_API_KEY`** — unset = email fail-open (silent
  failure). Verify Railway env before shipping an email feature.
  - **File:** `backend/app/services/email.py`
- [ ] **`ANTHROPIC_API_KEY`** — unset = AI fail-open (moderation
  approves, chat returns Hebrew offline msg). Acceptable by design
  — never let this degrade auth.
- [ ] **No secrets in commits.** Grep before commit:
  `git diff --cached | grep -Ei "api[_-]?key|secret|password|token"`
- [ ] **No secrets in error messages / logs.** `print(exc)` on a
  5xx path can leak JWT tokens from request headers. Use structured
  logging with allowlisted fields only.

---

## 7. AI fail-open

- [ ] **AI failure never touches the auth path.** Missing
  `ANTHROPIC_API_KEY` degrades AI features (moderation → APPROVED,
  chat → offline msg) — it must **not** grant access or skip a
  permission check.
- [ ] **Anthropic client always gets `http_client=httpx.Client()`.**
  anthropic 0.39 calls `httpx.Client(proxies=...)` internally,
  which raises `TypeError` against httpx 0.28+. The fail-open path
  hides this — you won't see a 5xx.
  - **File:** `backend/app/routers/chat.py`
  - **File:** `backend/app/services/home_product_moderation.py`
  - **Full trap:** [LOCKED_DECISIONS.md](./LOCKED_DECISIONS.md) §
    "Anthropic client"
- [ ] **Moderation result logged even on fail-open.** If moderation
  returns APPROVED because the API key is missing, the log line
  must say so — otherwise a future incident looks like "moderation
  passed" when it never ran.

---

## When this checklist is required

Mandatory for any PR that touches:

- `backend/app/auth.py`
- `backend/app/routers/upload.py`
- `backend/app/rate_limit.py`
- `backend/app/config.py`
- `next.config.js` (CSP / COOP / CORS headers)
- Any new mutation endpoint (POST/PUT/PATCH/DELETE)

Optional (but recommended) for any PR that touches a `backend/app/routers/*`
file with existing auth decorators.

Workflow rule 5a already requires `/adversarial-review` for these
files. Use this checklist **before** adversarial review — it catches
the easy traps so adversarial can focus on logic.
