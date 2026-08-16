# Audit P2/8 — Security: frontend + supply chain

> **Read-only pass.** Reports exposures; changes nothing. Fixes are separate tickets after triage —
> XSS/dependency fixes are RED/YELLOW by surface and never auto-merge.
> No exploit payloads: vector description + `file:line` only.
>
> Framework mapping: **OWASP Top 10:2025** + **CWE Top 25**.

---

## 1 · Snapshot

| | |
|---|---|
| **Baseline SHA** | `114e4c847617495a71058e180007797dfc83533f` (`114e4c84`) |
| **Audit date** | 2026-07-28 |
| **Pass** | P2/8 — security frontend + supply chain (epic MEH-1721) |

```bash
git fetch origin
git checkout 114e4c847617495a71058e180007797dfc83533f
```

**Drift note — this differs from P1.** P1 could state that `backend/` was byte-identical at the
baseline and at `staging`. **That is not true here:** `git diff 114e4c84 origin/staging --
frontend/` shows **18 files changed, +1,267/-31**. This report describes the **baseline**, per the
epic's pinned-snapshot rule. Anything merged into `frontend/` after `114e4c84` is out of scope and
must be re-checked by whoever acts on this.

**Mount check (epic §2.7)** — no finding in this pass depends on backend route reachability, so the
graph resolution is not re-run here. The one backend surface touched (CORS, §4) is middleware,
which applies to every request regardless of routing.

---

## 2 · Findings summary

| Severity | Count |
|---|---:|
| 🔴 Critical | **0** |
| 🟠 High | **1** |
| 🟡 Low/Medium | **2** |
| ⚪ Info | **1** |
| **Total** | **4** |

| ID | Sev | Title | OWASP / CWE | Fix |
|---|---|---|---|---|
| **F-1** | 🟠 High | `next` — 9 high advisories on a **direct** production dependency | A06:2025 Vulnerable Components / CWE-1395 | S |
| **F-2** | 🟡 Med | CSP `script-src` carries `'unsafe-inline'` **and** `'unsafe-eval'` | A05:2025 Security Misconfiguration / CWE-1021 | M |
| **F-3** | 🟡 Low | 8 transitive high advisories (`undici`, `sharp`, `vite`, …) | A06:2025 / CWE-1395 | S–M |
| **F-4** | ⚪ Info | Two docs claim the CSP is "strict"; it is not | — | S |

**No XSS finding.** That is a result, not an omission — §3 shows the work.

---

## 3 · XSS — swept, nothing found

### 3.1 `dangerouslySetInnerHTML` — 7 real sites, all one pattern

9 grep hits; **2 are comments** (`lib/seo.js:52`, `lib/highlight.js:5`). The 7 real usages are
**all** JSON-LD injection, and all route through one helper:

| Site |
|---|
| `components/public/RecipeJsonLd.jsx:77` |
| `app/[locale]/[slug]/recipes/[recipe_id]/page.jsx:142` |
| `app/[locale]/[slug]/page.js:72` |
| `app/[locale]/page.js:81` |
| `app/[locale]/events/[id]/page.js:90` |
| `app/[locale]/producer/[id]/page.js:61` |
| `app/[locale]/about/for-businesses/page.js:129` |

The helper (`frontend/lib/seo.js:54-59`):

```js
export function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
```

This is the correct defence for the canonical JSON-LD vector — a `</script>` sequence inside a
string value breaking out of the `<script type="application/ld+json">` block. Escaping to
`<` keeps the JSON spec-valid (a parser decodes it back), so the emitted schema.org data is
semantically identical while the breakout bytes never reach the HTML parser.

**And it is test-locked, which is why this is a conclusion rather than a reading.**
`frontend/__tests__/seo-jsonld-escaper.test.js` (MEH-1069) asserts that a string value carrying a
closing-`script`-tag-plus-new-tag sequence is neutralized, and its header names
`serializeJsonLd` "the single owner of JSON-LD serialization for all 7 injection sites" — a count
that matches this sweep independently.

**Single choke point + a breakout test = no finding.** The risk to watch is a *future* eighth site
bypassing the helper; the test does not enforce exclusivity.

### 3.2 Other raw-HTML sinks — none

`grep -E "\.innerHTML\s*=|outerHTML\s*=|\beval\(|new Function\(|document\.write"` over
`frontend/**` returns **one** hit: `__tests__/CustomCursor.test.jsx:59`, a test teardown. No
application code.

### 3.3 Leaflet — no imperative popup HTML

`bindPopup` / `bindTooltip` / `setContent` / `L.popup` return **one** hit,
`app/[locale]/map/MapClient.jsx:213`, and it is a **comment** about Leaflet's keypress handling.
Popups are rendered as React children, so React's auto-escaping applies.

### 3.4 Outbound `href` — scheme risk closed, though partly by accident

`frontend/lib/contact-method.js:56,72,77` normalizes user-supplied URLs:

```js
return raw.startsWith("http") ? raw : `https://${raw}`;
```

A `javascript:` payload does **not** start with `http`, so it is rewritten to
`https://javascript:...` — inert. The vector is closed, but **as a side effect of a
normalizer, not by a scheme allowlist**, which is a fragile place for a security property to live.
Not raised as a finding because the backend also validates: `website` / `instagram` /
`facebook` / `external_order_form` carry `@field_validator`s at `schemas.py:656, 668, 1087, 1099,
1192, 1209, 1499, 1518`. Two layers, and the outer one is intentional.

> `lib/seo.js:274` records a prior incident in this exact area (HOT-017 / MEH-782 — a
> `startsWith("http")` check that let a typo through). The pattern has bitten before.

---

## 4 · CORS — no finding

`backend/app/middleware.py:213-223`:

| Setting | Value | Assessment |
|---|---|---|
| `allow_origins` | `settings.cors_origins_list()` — explicit list | ✅ no wildcard |
| `allow_credentials` | `True` | ✅ safe **because** origins are explicit |
| `allow_methods` | `["GET","POST","PUT","DELETE","OPTIONS"]` | ✅ enumerated, not `*` |
| `allow_headers` | 4 named headers | ✅ enumerated |

The dangerous combination is `allow_origins=["*"]` together with `allow_credentials=True`, which
browsers reject anyway and which frameworks sometimes paper over. It is not present.

`config.py:41-43` defaults `cors_origins` to localhost only, with the comment *"production MUST set
CORS_ORIGINS explicitly."* If production forgets, CORS **fails closed** (requests blocked), not
open. That is the correct failure direction.

---

## 5 · CSP + security headers

Headers are set in **two** places, which is correct rather than duplicated: the backend sets
API-response headers (`middleware.py:46-56` — `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, HSTS), and the frontend sets document headers including
CSP (`frontend/next.config.js:55-100`, applied to `/(.*)` at `:121-128`). CSP belongs on the HTML
response, so its absence from the backend list is not a gap.

### 5.1 The policy

`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `default-src 'self'`, enumerated
allowlists for `img-src` / `connect-src` / `frame-src` / `font-src`, `worker-src 'self' blob:`, and
a `report-uri` when a Sentry DSN parses. Vercel Live entries are gated to `VERCEL_ENV === "preview"`.

That is a well-built policy in every directive **except one** — see **F-2**.

---

## 6 · Supply chain

### 6.1 npm — measured

**Measured without installing**, via `npm audit --package-lock-only`, which resolves the lockfile
against the advisory database and needs no `node_modules`. This is why P2 has real dependency
numbers where P0 had to record "not measured".

```
low 1 · moderate 0 · high 9 · critical 0 · total 10
```

| Package | Severity | Direct? |
|---|---|---|
| **`next`** | high | **DIRECT** |
| `brace-expansion`, `fast-uri`, `form-data`, `js-yaml`, `postcss`, `sharp`, `undici`, `vite` | high | transitive |
| `@babel/core` | low | transitive |

**Every one reports `fixAvailable: true`.**

### 6.2 pip — not recounted, by instruction

Python dependencies are **not re-measured here**. MEH-1585 already measured **31 vulns across 9
packages** and is Urgent. Re-counting would produce a second number for one fact — the
two-owners-for-one-fact smell the repo already legislates against. P0 §9.2 separately recorded
that **17 of 25** exact-pinned backend deps are behind latest, which is the same debt seen from the
version axis rather than the advisory axis.

---

## 7 · Findings

### F-1 · 🟠 High — `next` carries 9 high advisories on a direct production dependency

- **File:** `frontend/package.json` → `"next": "^16.2.10"`; lockfile resolves **16.2.10**
- **OWASP:** A06:2025 Vulnerable and Outdated Components · **CWE-1395**
- **Vulnerable range:** `9.3.4-canary.0 – 16.3.0-preview.7` · **`fixAvailable: true`**
- **Fix size:** S · **Risk tier: YELLOW** (single-line dependency bump, but it is the framework)

The only **direct** vulnerable dependency, and it is the framework the entire frontend runs on.
Nine advisories, by class:

| Class | Advisories |
|---|---|
| **SSRF** | `GHSA-89xv-2m56-2m9x` (Server Actions on custom servers) · `GHSA-p9j2-gv94-2wf4` (rewrites via attacker-controlled destination hostname) |
| **Cache confusion** | `GHSA-68g3-v927-f742` · `GHSA-4633-3j49-mh5q` (request bodies, incl. invalid UTF-8) |
| **Information disclosure** | `GHSA-955p-x3mx-jcvp` (unauthenticated disclosure of internal Server Function endpoints) |
| **Auth/middleware bypass** | `GHSA-6gpp-xcg3-4w24` (App Router + Turbopack, single locale) |
| **DoS** | `GHSA-m99w-x7hq-7vfj` (Server Actions) · `GHSA-q8wf-6r8g-63ch` (Image Optimization via SVG) · `GHSA-4c39-4ccg-62r3` (unbounded Server Action payload, Edge) |

**Applicability is not assessed here and must not be assumed.** Several require Server Actions, a
custom server, or Turbopack — this pass did **not** determine which are configured. What is
certain: the installed version is inside the vulnerable range for all nine, and **P0 already
recorded `next` as outdated** (16.2.10 installed, 16.2.12 latest), so the remedy is a patch bump
already visible on the version axis.

The middleware-bypass advisory deserves the closest look during triage, because
`GHSA-6gpp-xcg3-4w24` is an **authorization** bypass and the app is locale-routed (`[locale]`).
Whether the "single locale" precondition holds here is **not determined**.

---

### F-2 · 🟡 Medium — CSP `script-src` carries `'unsafe-inline'` and `'unsafe-eval'`

- **File:** `frontend/next.config.js:83`
- **OWASP:** A05:2025 Security Misconfiguration · **CWE-1021**
- **Fix size:** M · **Risk tier: YELLOW**

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://appleid.cdn-apple.com
```

**With `'unsafe-inline'`, CSP provides essentially no protection against injected inline script** —
it is the directive the whole mechanism rests on. `'unsafe-eval'` additionally permits
`eval`/`new Function`, widening the gadget surface for anything that does reach the page.

This is **defence-in-depth only, and nothing currently exposes it**: §3 found no XSS vector, React
auto-escapes, and the one raw-HTML path is escaped and test-locked. So the practical impact today
is that the *second* line of defence is thin — not that the first has failed. That is why this is
Medium and not High.

The in-code rationale is honest and correct as far as it goes — Next.js inlines runtime code and
Tailwind injects styles, so a naive removal breaks the app. The industry-standard resolution is a
**nonce-based CSP** generated per request in middleware and threaded to the inline tags, which
Next.js supports directly; that removes `'unsafe-inline'` for scripts without losing the runtime.
`'unsafe-eval'` should be checked separately — it is often present only for a dev-mode path and may
be removable from the production policy on its own, which would be the cheaper half of the fix.

**Decision: not proposing the nonce migration inside this pass** — it is an architectural change to
the rendering path, which the over-engineering guard excludes from an audit. Recorded as the
standard remedy for triage.

---

### F-3 · 🟡 Low — 8 transitive high advisories

- **Files:** `frontend/package-lock.json` (transitive closure)
- **OWASP:** A06:2025 · **CWE-1395** · **Fix size:** S–M · **Risk tier: YELLOW**

`undici` (7 advisories — TLS validation bypass via SOCKS5, header injection via `Set-Cookie`
percent-decoding, response-queue poisoning, cross-user disclosure via shared cache),
`sharp` (inherited libvips CVEs), `vite` (`server.fs.deny` bypass; NTLM hash disclosure — both
Windows-specific), plus `brace-expansion`, `fast-uri`, `form-data`, `js-yaml`, `postcss`.

Lower than F-1 because these are transitive — reached only if a dependency exercises the vulnerable
path — and several are build-time (`vite`, `postcss`) rather than runtime, or Windows-only on a
Linux deploy target. **Which are actually reachable is not determined by this pass**; that requires
tracing each import path and is triage work. All report `fixAvailable: true`.

---

### F-4 · ⚪ Info — two documents claim the CSP is "strict"; it is not

- **Files:** `frontend/next.config.js:75` — *"Production CSP stays strict"* ·
  `.claude/rules/security.md` — *"CSP is strict"*
- **Fix size:** S

The production policy contains `'unsafe-inline'` **and** `'unsafe-eval'` unconditionally. Only the
Vercel Live entries are environment-gated, so "production stays strict" is true **only relative to
preview**, which is not how either sentence reads.

This matters beyond tidiness: **a reader auditing this repo from its rules would conclude the CSP
is a working XSS control and stop looking.** Same class as the P1 finding where
`.claude/rules/security.md` described a "24h TTL" for a 15-minute token — except that one
*understated* the posture and this one *overstates* it, which is the more dangerous direction.

Fix is wording, not policy: state that the CSP is strict on `object-src` / `base-uri` /
`form-action` / `default-src` and deliberately permissive on `script-src` / `style-src`, with the
reason and the nonce migration as the exit.

---

## 8 · Not measured

| Item | Reason |
|---|---|
| Whether each `next` advisory's preconditions hold here | Requires determining Server Actions / custom-server / Turbopack configuration. Triage work; **not** inferred. |
| Reachability of the 8 transitive advisories | Requires per-package import-path tracing. |
| Runtime CSP verification | No browser run against a deployed page; the policy is read from config, not observed on a response. |
| `pip-audit` current run | **By instruction** — MEH-1585 owns that number (31 vulns / 9 packages). Linked, not recounted. |
| Frontend drift after the baseline | 18 files / +1,267 lines changed between `114e4c84` and `staging` (§1). Out of scope by the pinned-snapshot rule. |

---

## 9 · Appendix — commands and raw output

### A1 · XSS sweep

```
$ grep -rn "dangerouslySetInnerHTML" frontend/ --include=*.js --include=*.jsx --include=*.ts --include=*.tsx
  → 9 hits; 7 real + 2 comments (lib/seo.js:52, lib/highlight.js:5). All 7 are JSON-LD.

$ grep -rnE "\.innerHTML\s*=|outerHTML\s*=|\beval\(|new Function\(|document\.write" frontend/
  frontend/__tests__/CustomCursor.test.jsx:59:    document.body.innerHTML = "";
  → only a test teardown

$ grep -rn "bindPopup\|bindTooltip\|\.setContent(\|L.popup" frontend/
  frontend/app/[locale]/map/MapClient.jsx:213   ← a COMMENT, not a call
```

```
$ sed -n '54,59p' frontend/lib/seo.js
export function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

$ head -6 frontend/__tests__/seo-jsonld-escaper.test.js
 * MEH-1069: JSON-LD `</script>` breakout escaper + builder coverage.
 * serializeJsonLd() is the single owner of JSON-LD serialization for all 7
 * `<script type="application/ld+json">` injection sites. These tests lock in:
 *   1. the security property — no literal `</script>` survives serialization,
```

### A2 · CORS

```
$ sed -n '213,223p' backend/app/middleware.py
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],

$ grep -n -A2 "cors_origins" backend/app/config.py
41-    # SECURITY FIX #7 (CORS). Default is dev hosts only — production MUST set CORS_ORIGINS.
43:    cors_origins: str = "http://localhost:3000,http://localhost:8000"
131:    def cors_origins_list(self) -> list[str]:
```

### A3 · Headers + CSP

```
$ grep -E "X-Content-Type|X-Frame|Referrer-Policy|Permissions-Policy|Strict-Transport" backend/app/middleware.py
46: X-Content-Type-Options = nosniff
47: X-Frame-Options = DENY
48: Referrer-Policy = strict-origin-when-cross-origin
49: Permissions-Policy = camera=(), microphone=(), geolocation=(self)
56: Strict-Transport-Security

$ sed -n '80,100p' frontend/next.config.js      # CSP, applied to /(.*) at :121-128
  default-src 'self'
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://appleid.cdn-apple.com
  style-src  'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com
  object-src 'none' · base-uri 'self' · form-action 'self' · worker-src 'self' blob:
```

### A4 · npm audit (lockfile-only — no install)

```
$ cd frontend && npm audit --package-lock-only --json
severity totals: {'info': 0, 'low': 1, 'moderate': 0, 'high': 9, 'critical': 0, 'total': 10}

HIGH (9):
   brace-expansion  [transitive]      next             [DIRECT]
   fast-uri         [transitive]      postcss          [transitive]
   form-data        [transitive]      sharp            [transitive]
   js-yaml          [transitive]      undici           [transitive]
                                      vite             [transitive]
LOW (1):
   @babel/core      [transitive]

--- next (direct=True) sev=high range=9.3.4-canary.0 - 16.3.0-preview.7  fixAvailable: True
    GHSA-6gpp-xcg3-4w24  Middleware / Proxy bypass in App Router (Turbopack, single locale)
    GHSA-m99w-x7hq-7vfj  DoS in App Router using Server Actions
    GHSA-89xv-2m56-2m9x  SSRF in Server Actions on custom servers
    GHSA-68g3-v927-f742  Cache confusion of response bodies for requests with bodies
    GHSA-4633-3j49-mh5q  Cache confusion — bodies with invalid UTF-8 sequences
    GHSA-4c39-4ccg-62r3  Unbounded Server Action payload in Edge runtime
    GHSA-p9j2-gv94-2wf4  SSRF in rewrites via attacker-controlled destination hostname
    GHSA-q8wf-6r8g-63ch  DoS in Image Optimization API using SVGs
    GHSA-955p-x3mx-jcvp  Unauthenticated disclosure of internal Server Function endpoints
```

### A5 · Baseline drift

```
$ git diff --stat 114e4c84 origin/staging -- frontend/ | tail -1
 18 files changed, 1267 insertions(+), 31 deletions(-)
```

---

*P2/8 — MEH-1725, epic MEH-1721. Read-only. Fixes are separate tickets after triage.*
