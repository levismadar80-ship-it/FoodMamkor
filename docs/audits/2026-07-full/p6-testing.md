# P6/8 — Testing: critical-path coverage · quality · self-neutralizing tests

> Pass 6 of the **MEH-1721** audit epic. **Read-only** — this report maps test
> gaps and weaknesses. It writes no test and fixes none. Per the ticket's
> over-engineering guard, a finding is **a weakness and a location**.

---

## 1 · Snapshot

| | Files | LOC | Test units |
|---|---|---|---|
| Backend (`tests/`, pytest) | 165 | 34,927 | **1,898** test functions |
| Frontend (`__tests__/`, vitest) | 249 | 33,337 | **1,744** `it`/`test` blocks |
| E2E (`e2e/`, Playwright) | 32 specs | 5,028 | — |
| **Total** | **446** | **73,292** | |

**Audited tree:** `origin/staging` @ `11d36c1d` (P5 merge).

### What this pass found, in one line

**The unit suites are clean; the E2E suite is where the self-neutralizing
pattern lives.** Backend has **zero** genuinely hollow tests out of 1,898.
Frontend has **zero** blocks without an `expect()` out of 1,744. Every finding
below is in `e2e/`.

### A measurement caveat that shaped this report

**Four separate detectors I wrote produced false positives, and checking them
changed the answer every time.** That is recorded in §5 not as an aside but as
a finding in its own right — a test audit that reports its raw tool output
would have shipped four wrong claims here, including one that would have
condemned a correct suite.

---

## 2 · Findings summary

| ID | Sev | Finding | Fix | Tier |
|---|---|---|---|---|
| F-1 | 🟠 High | `e2e/rtl.spec.ts:57` reports **passed** with zero assertions executed | S | 🟢 |
| F-2 | 🟡 Med | 4 E2E specs skip on **their own subject** (MEH-1698 class, still live) | S each | 🟢 |
| F-3 | 🟡 Low | 15 dynamic `test.skip(true, …)` — a skipped spec reads green at suite level | M | 🟢 |
| F-4 | ⚪ Info | Endpoint-coverage metric **discarded** — 4 of 4 spot-checks falsified it | — | — |

**0 critical.** No security or correctness defect is in scope here; the risk is
**false confidence** — a green suite that did not exercise what its name claims.

---

## 3 · Self-neutralizing tests

The repo already knows this class: `.claude/rules/testing.md` devotes a section
to it, MEH-1698 fixed one instance, and MEH-1697 added CI gates. **The rule is
correct and it has not finished propagating.**

The rule's own review question is the one applied below:

> *if the element vanished entirely, does this test go red — or green?*

### F-1 🟠 High — `e2e/rtl.spec.ts:57-73` can never fail for its own subject

```ts
57  test("ProducerCard premium badge — at inline-start (physical right in RTL)", async ({ page }) => {
…
62    const count = await cards.count();
63    if (count === 0) return;                    // ← bare return, NOT test.skip
…
66    const badge = page.locator("article span:has-text('פרמיום')").first();
67    if (await badge.count() > 0) {              // ← the ONLY expect() is inside this
…
71      expect(badgeBox!.x + badgeBox!.width).toBeGreaterThan(cardBox!.x + cardBox!.width * 0.5);
72    }
73  });
```

**Two guards stacked, and the assertion sits behind both.** Trace the outcomes:

| State of the world | Result |
|---|---|
| No producers seeded | line 63 returns → **PASSED**, 0 assertions |
| Producers, but no premium badge anywhere | line 67 false → **PASSED**, 0 assertions |
| Premium badge deleted from `ProducerCard` entirely | → **PASSED**, 0 assertions |

The test's entire subject is *"premium badge at inline-start"*. Remove the badge
from the product and this test still reports green.

**This is strictly worse than the MEH-1698 case that motivated the rule.** That
one at least reported `skipped` — a status a human might notice in a run
summary. This one reports **passed**, which is indistinguishable from a real
assertion having run. `if (count === 0) return` is the `if (!el) return` form the
rule names explicitly, and line 67 is the same defect a second time: a guard
that consults its own subject and converts *"the thing is gone"* — the exact
condition worth failing on — into *"nothing to check"*.

**Fix S:** assert the badge's presence unconditionally (or gate on a fixture /
static project identity, per the rule's sanctioned forms) so its absence is a
failure. 🟢 GREEN — E2E only, no product code.

### F-2 🟡 Med — 4 specs skip on their own subject

Not all `count()===0` guards are equal, and conflating them would misreport
this. Two kinds are present:

**(a) Data-availability guards** — the subject is *seed data*, not the element
under test:

```
e2e/flows/03-view-producer-detail.spec.ts:33   "No producer cards found — staging DB may be empty"
e2e/flows/04-whatsapp-click.spec.ts:16          (same)
e2e/flows/06-lightbox.spec.ts:14                (same)
```

Defensible in shape. The cost is that a genuinely empty DB makes these report
skipped rather than red — including on **WhatsApp click**, which the ticket
names as a critical path.

**(b) Subject-consulting guards** — the defect proper. The guard reads the very
element the test exists to exercise:

| Spec | Guard | If the element were deleted from the product |
|---|---|---|
| `e2e/flows/06-lightbox.spec.ts:33` | gallery image button `count()===0` → skip | **skipped, exit 0** |
| `e2e/flows/04-whatsapp-click.spec.ts:45` | `primary-contact-button` `count()===0` → skip | **skipped, exit 0** |
| `e2e/flows/15-map-markers.spec.ts:41` | markers `count()===0` → skip | **skipped, exit 0** |
| `e2e/rtl.spec.ts:63,67` | see F-1 | **passed, exit 0** |

`04-whatsapp-click.spec.ts:45` is the one to weigh first: the primary contact
button is the WhatsApp critical path's whole subject, and its disappearance
would be reported as a skip.

**Worth noting the repo was already half-way here.** MEH-1550 added an
`#__next_error__` assertion to specs 04 and 06 *precisely because* a failed
navigation was skipping instead of failing — the comment at
`06-lightbox.spec.ts:22-25` says so in as many words. The navigation half of the
problem was fixed; the element half was not.

**Fix S each.** 🟢 GREEN.

### F-3 🟡 Low — 15 dynamic skips

`e2e/` carries **47** `test.skip` calls:

| Form | Count | Verdict |
|---|---|---|
| `test.skip(testInfo.project.name !== "…")` | 21 | ✅ **Sanctioned** — gates on a static project identity the product cannot move |
| `test.skip(true, "<runtime reason>")` | 15 | ⚠️ Runtime-conditional — F-2's class |
| other / multiline | 11 | mixed |

The 21 static-project skips are the form `.claude/rules/testing.md` explicitly
endorses (`parity.spec.ts:522` is cited in the rule as the model). They are not a
problem and are recorded so a future sweep does not "fix" them.

The systemic weakness is that **a skipped Playwright test does not fail a run**.
With 15 runtime-conditional skips, the suite can report green on a materially
smaller set of executed tests than it appears to run, with nothing surfacing the
shrinkage. **Fix M** — a suite-level assertion on minimum executed-test count, or
a skip budget. 🟢 GREEN.

### Not a finding — the one `test.fixme` is legitimate

`e2e/flows/14-language-toggle.spec.ts:92` is quarantined, and a naive sweep
would flag it. Reading it shows the opposite: the file was **rewritten by
MEH-1698** to remove exactly this anti-pattern, its header documents why the
`count()===0` skip was removed, and the remaining `fixme` carries an explicit
justification — quarantined on MEH-817's authority, covering a *different*
behaviour (the flip) from the one that broke (the control's existence), with a
note that its guard "cannot be disabled by the product regressing."

**That is what a correctly-quarantined test looks like**, and it is the model
the four specs in F-2 should follow.

---

## 4 · Critical-path coverage

The five paths the ticket names, each verified rather than grepped:

| Path | Coverage | Level |
|---|---|---|
| **Auth** | 8 files (`test_auth`, `test_expansion_auth_jwt`, `test_oauth_verify_4xx`, `test_producer_oauth`, `test_optional_auth_contract`, …), 20 matching test fns | ✅ Strong — includes the 401-not-503 fuzz family |
| **Manual approval flow** | `test_admin_approval_transitions.py` — a documented source-status × action matrix | ✅ Covered |
| **WhatsApp click token** | `test_analytics.py:164-178`, `test_rating_dispatch.py`, `test_reviews.py`, `test_meh997_e2e_journeys.py`; frontend `pingWhatsAppBeacon` in **7** test files, `markWhatsAppClickedLocal` in 5 | ✅ Covered both sides |
| **Reviews verification** | `test_reviews.py`, `test_meh1351_review_ready_ping.py`, plus the WhatsApp-gate suite at `test_api.py:2051+` | ✅ Covered |
| **Producer registration** | `test_register_personas.py` (15 test fns) + the `register_producer` paths in `test_auth`/`test_producer_oauth` | ✅ Covered |

> **The WhatsApp click-token row is the one that needed verifying.** A direct
> grep for `click_token` across `tests/` returns **zero**, which reads as an
> uncovered critical path. The mechanism is not called that: the app uses
> `rating_token` / `click_id` / `ProducerWhatsAppClick`, and those *are*
> tested. Per the ticket's calibration clause ("not covered = suspicion until
> verified there is no indirect test"), the suspicion did not survive contact
> with the code.

**All five critical paths are covered at the unit/integration level.** The gap
is not *whether* they are tested but the E2E layer's ability to go quiet on
them (F-2).

**E2E status — cross-referenced, not re-investigated** (per the ticket): 32
specs exist under `e2e/`, covering the flows numbered 03–24 plus visual parity,
RTL, and a mobile audit. Whether they *execute* on a given PR is
**MEH-1590**'s subject and is deliberately not re-derived here.
`.claude/rules/testing.md` records the current state: the `e2e.yml` paths-filter
does skip docs-only correctly, but the suite is not green (2 VRT `parity.spec.ts`
failures) and `E2E gate (required)` is therefore not yet in the ruleset.

---

## 5 · Suite health — and F-4, the measurements that did not survive

### Backend: 0 hollow tests out of 1,898

A first detector flagged **20** test functions with no assertion. A corrected
one flagged **12**. Reading all 12 gives **0**.

- The first pass over-counted because `tests/test_oauth_verify_4xx.py` asserts
  through a module-level helper named `_assert_4xx_not_503()` — my
  `startswith("assert")` check missed it on the **leading underscore**. Those
  tests carry two assertions each, including a named 503-regression guard.
- The remaining 12 are all the legitimate **"must not raise"** form, each with
  an explanatory comment: `validate_transition(…)` for permitted transitions
  (`test_availability_validation.py:68`), `_confirm_or_abort(…, "yes")` returning
  where every sibling asserts `SystemExit`
  (`test_cleanup_cloudinary_orphans.py:912`), `score_producer(uuid4())` for a
  deleted-producer no-op (`test_meh_509_pr3_risk_score.py:511`), and the
  `test_fail_open_never_raises` pair. **Absence of an exception is the
  assertion** in every one.

Also measured: **0** always-true asserts; **2** `except: pass` blocks
(`test_meh1000_…:219`, `test_meh1063_…:199`), both in fail-open notification
tests where swallowing is the behaviour under test.

### Frontend: 0 assert-less blocks out of 1,744

Every `it`/`test` block in `frontend/__tests__/` contains an `expect(`,
`toHaveNoViolations`, or `assert`. No exceptions found.

### F-4 ⚪ Info — the endpoint-coverage number is withdrawn

A detector compared all **175** routes on mounted routers against the text of
`tests/`, and reported **42 (24 %)** with no reference. **Spot-checking
falsified 4 of 4 samples:**

| "Uncovered" route | Reality |
|---|---|
| `POST /producers/{id}/whatsapp-click` | `test_analytics.py:170` posts to it directly |
| `GET/POST /producers/{id}/reviews` | `test_api.py:2070-2096` |
| `PATCH /{lead_id}` (outreach) | `test_expansion_admin_authz.py:40` — the router carries prefix `/admin/outreach` |
| `POST /admin/producers/{id}/toggle-status` | `test_admin_approval_transitions.py:37` |

Two mechanical causes: tests build URLs with **f-string interpolation**
(`f"/producers/{p.id}/whatsapp-click"`), so the literal-minus-params probe never
matches; and **router prefixes** mean a decorator path like `/{lead_id}` never
appears as written anywhere.

**With a 4-of-4 false-positive rate on the sample, the metric is not
reportable** and no "42 untested endpoints" figure appears in this report.
Endpoint coverage is recorded in §6 as **not measured**. Publishing the 24 %
would have manufactured a large, wrong finding out of a broken probe — the same
failure mode as P5's vulture output and P4's mount regex, three passes running.

---

## 6 · Not measured

- **Endpoint-level integration coverage.** The only probe built for it was
  falsified (F-4). Doing this properly needs `--cov` line data mapped to route
  handlers, or an app-level route-hit recorder — neither was run.
- **Coverage percentages.** `pytest --cov` was **not run**: no backend virtualenv
  exists in this sandbox (`backend/.venv` absent) and no DB is reachable, so the
  suite cannot execute. CI's gate is `--cov-fail-under=70`, with a baseline of
  77 % recorded in `pr-checks.yml:388` — quoted from the workflow, **not
  measured here**.
- **Whether the E2E suite runs on a given PR.** MEH-1590's subject; cross-linked
  per the ticket, deliberately not re-derived.
- **Mutation testing.** Nothing here establishes that a passing assertion would
  fail against broken code — the strongest form of the question this pass asks,
  and out of scope.
- **Test *flakiness*.** No repeat runs; a spec that passes intermittently is
  indistinguishable here from one that passes.
- **Frontend `__tests__` quality beyond assert-presence.** An `expect()` that
  asserts something trivial counts as present in §5's number.

---

## 7 · Appendix — commands and raw results

```
inventory
  tests/*.py                165 files · 34,927 LOC · 1,898 test functions
  frontend/__tests__        249 files · 33,337 LOC · 1,744 it/test blocks
  frontend/e2e              32 specs  ·  5,028 LOC

backend self-neutralizing sweep (AST)
  no-assert, naive detector            20
  no-assert, helper-aware detector     12   (0.63 %)
  no-assert, after reading all 12       0
  always-true asserts                   0
  except: pass                          2   (fail-open tests — behaviour under test)

frontend vitest
  it/test blocks                    1,744
  without expect()/assert               0

e2e quarantine markers
  test.skip total                      47
    static project gate (sanctioned)   21
    test.skip(true, …) dynamic         15
  test.fixme                            1 live (14-language-toggle.spec.ts:92 — justified)
  test.only                             0

e2e subject-consulting guards
  06-lightbox.spec.ts:33      gallery button count()===0 → skip
  04-whatsapp-click.spec.ts:45 primary-contact-button count()===0 → skip
  15-map-markers.spec.ts:41   markers count()===0 → skip
  rtl.spec.ts:63,67           bare return + conditional expect → PASSES

  (NOT this class: 24-producer-locations.spec.ts:199,276 use count()===0 as a
   for-loop poll condition, which is a wait, not a skip.)

endpoint probe — WITHDRAWN
  routes on mounted routers           175
  probe reported "no reference"        42 (24 %)
  spot-checks falsified               4 / 4  → metric discarded
```
