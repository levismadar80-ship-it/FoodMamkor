# Remediation log — audit epic MEH-1721

One line per finding acted on, newest first. Required by **ADR-017 / MEH-1741 §5**: every fix
lands with its log line in the same PR, and every judgment call carries a `Decision:` in the PR
body.

Status vocabulary: **fixed** (merged, exploit-proving test green) · **stopped** (hard stop, card
filed, moved on) · **false positive** (verified against code, no defect) · **corrected** (a
previous report's claim was wrong and has been amended).

| Date | Finding | Report | Status | PR | Note |
|---|---|---|---|---|---|
| 2026-07-28 | **MEH-1657 follow-up** — two owner/consumer strings still advertised `סדנה`/`סיור` as events after the enum went 6 → 4 | MEH-1539 | **fixed** | #2396 | The event-form title placeholder (`למשל: סדנת גבינה`) and all four `seo.events.*` keys. Deliberately deferred from #2394 rather than guessed: both are user-facing copy, and workflow rule 22 requires Sapir-approved wording — she supplied it verbatim on 28/07. Copy-only, no logic. ⚠️ The approved `title` carries no `\| מהמקור` suffix and `events/page.js:17` uses `title: { absolute: … }`, which bypasses the layout's `%s \| BRAND` template — flagged for confirmation, not silently "corrected". |
| 2026-07-28 | **MEH-1657** — event/experience axis undefined for owners; `סדנה`+`סיור` offered as *event* categories | MEH-1539 | **fixed** | #2394 | Locked axis (one-time vs sign-up) written into the owner copy; event enum 6 → 4 across backend, frontend registry, both locales and the form default; experiences keep both words deliberately. Also fixed the **demo seed**, which published a workshop as an event — the confusion hard-coded into the demo — and the `Experience` docstring, which still claimed the axis was *who hosts*. That stale docstring is not a footnote: it is what misled the 28/07 analysis into proposing a merge of the two entities. Proof: test-only commit `ab820dcc` RED, fix commit GREEN. |
| 2026-07-28 | **P1 F-4** — public prefill lookup returns lead PII with no rate limit | p1 §11 | **fixed** | #2382 | `@limiter.limit("30/hour")` on `GET /register/producer/prefill/{token}` (`admin_outreach.py:203-210`). The one P1 finding that is actually reachable (`prefill_router` mounted at `router_registry.py:82`). Defence-in-depth, not the primary control — the 256-bit token is what stops enumeration — which is exactly why it carries a test: nothing else would notice the decorator being dropped. Proof: test-only commit `1a4d29bd` RED, fix commit GREEN. |
| 2026-07-28 | **P1 F-1** — rating aggregate + auto-hide manipulable by one account | p1 §11 | **stopped** — MEH-1743 | — | `home_products` router unmounted per brand LOCK (`router_registry.py:61`, MEH-1406) → all routes 404 → not exploitable. ADR-017 §3.1 exploit-proving test is impossible against a 404, and mounting the router to enable one is hard stop §4.1 (LOCK). Severity corrected 🟠 High → ⚪ latent. |
| 2026-07-28 | **P1 F-2** — click endpoint skips the MEH-386 BOLA gate, discloses seller phone | p1 §11 | **stopped** — MEH-1743 | — | Same root cause and same block as F-1. Severity corrected 🟠 High → ⚪ latent. |
| 2026-07-28 | **P1 F-3** — unauthenticated unrate-limited public write | p1 §11 | **stopped** — MEH-1743 | — | Same root cause. Also invalidates the report's claim that this was "the only unauthenticated, unrate-limited, state-mutating route" — among *reachable* routes there is none. Severity corrected 🟡 Low → ⚪ latent. |
| 2026-07-28 | **P1 report** — F-1/F-2/F-3 described as "live on `main`" | p1 §2, §4.1a | **corrected** | #2381 | Code identity (`git diff` vs `main` empty) was mistaken for reachability. The authz matrix read `@router.<verb>` decorators and never consulted `router_registry.py`. Added §4.1a (mounted vs declared) and a mandatory mount check for P2–P8. **Its route figures were themselves wrong — superseded by the row below.** |
| 2026-07-28 | **The mount check itself** — flat grep produced a false negative | p1 §4.1a, §4.1b | **corrected** | #2388 | The first check grepped only `app.include_router(...)` in `router_registry.py`, so it missed **nested composition** and wrongly called `producer_follows` unmounted. It is mounted transitively (`producers.py:57`, under `producers.router`). Corrected: **191 declared · 181 reachable · 10 unmounted (`home_products` only)** — was 177/14/2. Rule upgraded to resolve the mount **graph** to a fixed point. Caught from the coverage table of the F-4 control run (`producer_follows` 44% vs `home_products` 0%) — a module with coverage is being exercised. |
| 2026-07-28 | **`.claude/rules/security.md`** — JWT invariant said "24h TTL" | p1 §5 | **corrected** | #2379 | Stale by 96×: the code does a **15-minute** access TTL (`config.py:35`) + 14-day refresh, plus `token_version`, password-change invalidation and fingerprint binding. The rule understated the real posture; corrected from measured values. No code change — the code was already right. |

---

## Method notes carried forward

**Reachability caps severity.** A `@router.<verb>` decorator proves a handler exists, not that it
is served. `backend/app/router_registry.py` is the authority. Every audit pass from P2 onward must
join its route inventory against that file before assigning any severity — this blind spot
produced two false 🟠 High ratings in P1 and it will recur silently otherwise.

**Code identity ≠ reachability.** `git diff <baseline> origin/main -- <file>` being empty proves
the file is the same in production. It proves nothing about whether production routes to it. The
two questions need two checks.
