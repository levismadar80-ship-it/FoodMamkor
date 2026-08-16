# Sweep session log — sc-nlenpj (2026-08-09 evening, audit/tooling lane)

> As-of: 2026-08-09T19:1xZ. Every claim measured at that time; re-derive before
> acting on any of it.

**Three audits delivered with measurements (MEH-1982 · MEH-1981 · MEH-1979) ·
one code fix shipped · two probes caught reporting confident wrong answers
BEFORE their output was used · two card premises corrected.**

The through-line of this session is the same failure wearing three costumes: a
probe whose reassuring output is an artefact of how it was asked. It happened to
me twice in ninety minutes, on two unrelated tools, and both times the only
thing that caught it was running a case whose answer I already knew.

---

## 1 · MEH-1982 — deliverability. The card's premise was wrong, and the real gap is elsewhere.

Read-only, zero code changes. Full table + paste-ready records on the card.

**Provider identified from code, not guessed:** Resend (`email.py:141,143,161`),
sending as `noreply@mehamakor.online` (`config.py:81`).

**Measured on `mehamakor.online`:** DKIM ✅ · DMARC ✅ (`p=none`) · **apex SPF
absent** · **apex MX absent** · NS = `vercel-dns.com` · CAA ✅.

### The correction that matters

The card assumes *"בלעדיהם האימיילים … נוחתים בספאם"*. **The missing apex SPF is
probably not what would send mail to spam**, and saying so was worth more than
confirming the fear:

- SPF authenticates the **envelope MAIL FROM**, not the `From:` header
  (RFC 7208 §2.4). `send.mehamakor.online` carries
  `v=spf1 include:amazonses.com ~all` — Resend's custom MAIL FROM subdomain — so
  SPF **passes**.
- DMARC passes on SPF **or** DKIM alignment (RFC 7489). DKIM signs
  `d=mehamakor.online`, strict alignment with `From:`. **DMARC passes on DKIM
  alone.**

**What IS broken:** `rua=mailto:dmarc@mehamakor.online` with **no MX on the
apex**. RFC 5321 §5.1 falls back to the A record as an implicit MX, and that A
points at Vercel — a web server with no SMTP. So DMARC exists and produces
**zero visibility**, permanently, silently. Ordering follows from that: a
readable `rua` first, *then* hardening past `p=none` — hardening blind is worse
than not hardening.

**Side finding:** `mehamakor.co.il` has the *fuller* mail stack (apex SPF, MX via
Cloudflare, DKIM, deliverable DMARC) than the domain we actually send from. And
two SoT files disagree on which is production —
`.claude/rules/deployment.md:16` says `.co.il`, `docs/DEPLOYMENT.md:22,160,169`
says `.online`. Reported, **not fixed** (a finding is not self-authorised work).
The reconciliation supported by evidence: `.online` is production today,
`.co.il` is provisioned for the Phase-2 flip `config.py:80` describes.

### The probe caught itself — and this is the transferable part

`dig` is absent from the sandbox and both DoH hosts are proxy-denied, so I wrote
a raw resolver over UDP/53. **Its self-test failed on the first run**:
`google.com TXT` returned **0 records** — the identical output a domain with no
SPF produces. Cause: UDP truncation. Without the self-test I would have reported
"no SPF" from a broken probe, and the whole audit would have been a confident
lie.

Fix: EDNS0 with a 4096-byte buffer (TCP/53 is also blocked). After it,
`google.com` returns 15 records. **Every load-bearing negative was then
re-checked against three independent resolvers** (8.8.8.8 / 1.1.1.1 / 9.9.9.9),
all `NOERROR n=0`.

**Not verified, stated rather than simulated:** HTTPS chain + www→apex redirect
(egress to the apex is proxy-blocked, `CONNECT … 403`); whether Resend's custom
MAIL FROM toggle is actually on (dashboard = gate 2); auth results on a real
delivered message (needs an inbox).

---

## 2 · MEH-1981 — Amendment 13. Blocked on §0 by our own security control; the audit half is done.

### The blocker is not a bug and must not be routed around

The DoD demands *"the PPA's own published guidance (gov.il) — **not blog
summaries**"*. `.claude/hooks/check-webfetch-allowlist.sh` (MEH-397 layer 1)
blocks `gov.il`, `nevo.co.il`, `wikisource.org` and every law-firm domain. The
research agent **found the exact document URLs and did not attempt to bypass the
hook** — correct, per `security.md`'s opening line. So there is **not one
verbatim statutory quote** in the research output, which is precisely what the
DoD excluded.

Reported to Sapir with three options; recommended the cheapest (she downloads
two PDFs and attaches them). **§0 is not marked done and no blog synthesis was
dressed up as the official guidance.**

### Card premises, both checked

- *"registration duty probably doesn't apply"* → **CONFIRMED.** Post-13 it binds
  only public bodies and data brokers ≥10,000; a separate lighter notification
  duty at ≥100,000 with specially-sensitive data. We are neither.
- *"₪10,000 without proof of damage"* → **CONFIRMED, with a warning that must
  ride into any lawyer draft:** do not conflate it with the older §29A tort
  damages (~₪50,000, doubled for malice). Different conduct, different ceiling.
  One search synthesis contained an internal arithmetic error
  ("50,000 doubled = 120,000"), which is itself the signal that the number needs
  primary-source verification.

### The audit found the card's own premise too pessimistic — and a worse gap it never mentioned

**The privacy policy is already comprehensive** (11 sections, controller
identity, voluntariness + consequence-of-refusal, third parties, Amendment-13
rights, 30-day response) — MEH-1058 did that work. The card lists it as a gap.
Checked the repo, not just Linear (ORDERS §5).

**The real finding, which was in no card:** **terms/privacy consent is never
persisted.** Both registration forms show a correct opt-in checkbox, gate submit
on it, and then drop it — `agreedToTerms` is absent from the request body
(`RegisterClient.jsx:75`, `auth-context.js:135-141`) and there is no column:
`grep -niE "terms_accepted|privacy_accepted|marketing_consent"` over
`models.py` + `schemas.py` → **zero hits**. If a user claims she was never shown
the terms, **we have no evidence**. The correct pattern already exists two files
away — `Producer.declared_at` + `declaration_version` (`models.py:188-189`) — it
was simply never applied to the ToS.

Not built: it is a schema change, needs Alembic upgrade/downgrade tested against
a DB this sandbox does not have, and it is Sapir's call.

Other gaps: PostHog undisclosed (fixed, §3) · portability promised but no export
endpoint · 7 of 9 forms carry no collection notice · the producer-registration
draft auto-saves the whole form to `localStorage` on every keystroke with no
notice · `schemas.py:628` documents the wrong checkbox as feeding
`declaration_accepted`.

**Copy fixes were deliberately NOT pushed** — rule 22 and the card's own
`brand check לכל מחרוזת` make them Sapir's, so they go up as drafts.

---

## 3 · MEH-1981 G2 — shipped. PostHog was the ninth processor in an eight-item list.

`privacy/page.js:67` enumerates eight third parties. `grep -ric posthog` over
`he.json` · `en.json` · `privacy/page.js` → **0 · 0 · 0**, while
`lib/analytics.js:10` loads `posthog-js` and captures registration-funnel events.

**An enumeration that names eight and omits a live ninth is worse than a general
statement, because it presents itself as complete.** One array entry + two
strings.

Precision that changed the wording: PostHog only fires with
`NEXT_PUBLIC_POSTHOG_KEY` set, in production, after `cookieConsent === "all"`.
Env vars are gate 2, so **I cannot verify it is active today** — the disclosure
is still right (disclosing a processor you may use is harmless; omitting one you
do use is the risk), but the guard's docstring says explicitly that it asserts
*disclosure, not data flow*.

Guard: `frontend/__tests__/PrivacyThirdPartyDisclosure.test.js` — four
assertions (list parses non-trivially · every listed id has both locales · no
orphan string that is never rendered · every code-wired processor is disclosed).

---

## 4 · MEH-1979 — rate-limit audit. Full inventory on the card; implementation not started.

**173 routes · 128 authenticated · 45 public · 25 public+limited ·
20 public+UNLIMITED.** Per-endpoint verdicts with proposed numbers are on the
card.

### The second probe that lied, and the self-test that had no discrimination

My first inventory reported **74 public / 34 exposed**. Both wrong. The auth-
dependency list was **guessed** from common FastAPI naming and missed
`require_producer` / `require_verified_producer`, so every owner-dashboard route
(`/producers/me/analytics`, `/producers/me/products`, …) was labelled **"public,
unlimited"** — indistinguishable in a table from a real finding.

The fix was to ask the repo instead of my memory:
`grep -rhoE "Depends\((\w+)\)" backend/app/routers/*.py | sort | uniq -c` → seven
helpers, all now mapped. **45 public, 20 exposed.**

**The self-test passed on the broken parser.** It asserted "both public and
authenticated routes exist" — true either way, so it discriminated nothing. It
now pins `GET /producers/me` as *authenticated*, which the old parser got wrong,
plus the inverse (`GET /categories` must stay public) so the surface cannot
silently shrink to zero.

### Findings worth more than the table

- 🔴 **In-memory storage ⇒ limits multiply by worker count.**
  `rate_limit.py:140` has no `storage_uri`, so counters are per-process. With two
  workers, `login 5/minute` is really 10/minute per IP while the code still says
  5. **MEH-1835 proposes exactly `uvicorn --workers 2`** — it would silently
  double every number in this audit.
- 🟢 **No fail-open** (the class the card feared): `swallow_errors` unset →
  defaults to `False`; the key_func cannot return falsy (SEN-004/MEH-775 closed
  that with `NO_EMAIL_BUCKET`). Saying "checked and absent" out loud beats
  omitting it.
- 🟢 **`/health` must stay unlimited** — `railway.json:8` is
  `"healthcheckPath": "/health"`; a 429 there is a restart loop in production.
  A naive "protect every public endpoint" sweep breaks the platform, so the
  green rows are a reasoned decision with a citation, not an omission.
- 🟡 `rate_limit.py:5` says the limiter is registered in `main.py`. It is in
  `middleware.py:207-208,227`; `main.py` (16 lines) never mentions it.

---

## 5 · Process notes

**Three concurrent `npm ci` processes raced on `node_modules` → `ENOTEMPTY`.**
Mine, from launching background installs before checking the first had landed.
Same one-writer lesson as s3/s8, on a directory rather than a git tree: the rule
is not "one agent per working tree", it is **one writer per shared mutable
resource**, and `node_modules` is one.

**`npx vitest` fetched a foreign vitest** rather than the repo's — the exact
false-signal class MEH-1951 shipped a guard for. The repo's own
`scripts/vitest-guard.mjs` (via `npm test`) refused to run without
`node_modules`, which is the guard behaving correctly.

**The session's real theme:** two probes, two confident wrong answers, both
caught only by running a case whose answer was known in advance — a domain that
certainly has SPF, a route that certainly requires auth. Neither would have been
caught by reading the code, and both would have produced a table that looked
exactly like a correct one. The cheap check is not optional; it is the only
thing standing between an audit and a fiction.

---

## 3a · The review earned its keep — it found the same bug one level down

The different-model reviewer (Sonnet; the diff was Opus) returned **APPROVE WITH
FIXES**, and the SHOULD-FIX was real:

My disclosure string asserted EU data residency as fact. But
`analytics.js:14-15` is
`process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com"` — a
**runtime-configurable default, not an invariant**. Point that env var elsewhere
and the privacy page keeps asserting EU-only storage with nothing able to detect
the drift.

**That is the same failure class the PR exists to fix, one level down:** an
assertion claiming more than the code guarantees. I fixed an *omission* and was
about to ship an *over-claim* in the replacement text. Copy now says "by
default"; a comment at the env-var site couples the default to the policy string.

It also raised a NIT I documented rather than fixed: the `CODE_WIRED_PROCESSORS`
probe matches a literal token in one file, so a refactored import silently turns
the check into a no-op that reads as a pass. Left deliberately — the degraded
state is exactly the pre-guard status quo, never worse — but **named in the
docstring**, because an unnamed silent-degradation path is how a guard becomes
decoration.

**Process incident, third occurrence of the shared-tree class.** The reviewer
self-reported that it applied its rival construction to the **shared checkout**
rather than its own worktree, then restored it. I verified independently instead
of trusting the restore: `git diff HEAD --quiet -- frontend/` clean,
byte-identical to the commit. Isolation was requested and still did not hold; the
disclosure is what made the check cheap. **Verify the tree after any subagent
run, regardless of what the agent says it did.**

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit |
|---|---|---|---|---|
| **#2743** | MEH-1981 (gap G2) | 09/08 19:1xZ | open, non-draft, review cleared and findings addressed (`b79dbd5d`). **Auto-merge deliberately NOT armed** — CI still running at write time | on CI completion |
| this log | — | — | docs-only, separate branch (rule 31) | — |

**⚠️ Carry-forward on #2743:** merging it will auto-flip the Amendment-13 card to
Done via the branch-name link, even though it closes **one of six gaps** and §0 is
still blocked. **The card must be restored after merge and the restore verified by
re-reading it.** Written in the PR body too, so it survives this log.

## Not done, and named

- **MEH-1979 implementation** — 16 limits + 429 tests. Inventory published and
  numbers justified; no code written. This is the largest ready-to-build item.
- **MEH-1981 §0** — blocked on Sapir attaching the gov.il documents.
- **MEH-1981 G1/G3/G4/G5** — consent persistence (schema, needs a DB), data
  export, collection notices (copy → rule 22), draft-storage notice (copy).
- **MEH-1965 · MEH-1975 · MEH-1977 · MEH-1978 · MEH-1980** — not started.
- **MEH-1961** and **MEH-1983** were already **Done** when the sweep began —
  the anti-stale gate paid on the first query, again.
