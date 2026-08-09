# Sweep session log — s7-q4n8vz (2026-08-09 midday)

> As-of: 2026-08-09T10:40Z. Every claim is measured at that time; re-derive
> before acting on any of it.

**MEH-215 journey A shipped as a spec · MEH-217's park premise measured and
found FALSE · 1 card opened (consumer-registration discovery gap) · 1
convention settled (`covered-by-stub`).**

The headline is the correction: **MEH-217 was parked on a credential gate that
does not exist.** `DEMO_ADMIN_PASSWORD` has been exported into the E2E job
since 26/07. The park inferred the block from `global-setup`'s localhost
default and never checked whether the job supplies the secret — the same shape
as s6's own three retractions, one day later.

---

## 1 · MEH-215 journey A — `flows/29-register-journey-a.spec.ts`

7 tests × 2 projects (mobile Pixel 5, desktop 1440×900), **14/14 green**. No
storageState fixture, no `DEMO_*` secret → runs on the default CI target.

**The handoff in s6 §6 was accurate but describes a different surface.** It
documents the **producer** wizard (`/register/producer`, 5 steps, 12 field ids,
final button `הצטרפו ←`). MEH-215 journey A is the **consumer** form at
`/register`: a single page, three fields, a terms checkbox, ending on an
inbox-check screen. Nothing in the costed handoff transfers. The instruction to
"use it; do not re-derive it" could not be followed for journey A, and saying so
was cheaper than building the wrong surface. **The handoff is still valuable —
it is exactly what a future MEH-216 / producer-journey card needs.**

Journey A's real locators, now in the spec and in the DOM:
`register-heading` · `register-form` · `register-name` · `register-email` ·
`register-password` (+ `-toggle`) · `register-terms` · `register-submit` ·
`register-error` · `register-email-sent` (+ `-home`) · `register-login-link` ·
`login-register-link`.

### Three card expectations are pre-MEH-328 and no longer describe the product

Registration mints no token and does not redirect. The spec asserts today's
behaviour and annotates each divergence `superseded` rather than deleting the
checkbox. **A4 asserts the redirect does NOT happen** — that is the assertion
that discriminates the two eras instead of merely agreeing with the present one.

### `covered-by-stub` — settled

It had no defined form (s6 confirmed `grep` found nothing in any `*.md`).
Settled as a **Playwright annotation type**, one spelling, machine-readable in
`results.json`, defined in the spec header, with two siblings: `superseded` and
`not-applicable`. It is a **label, not a coverage claim**.

### Failing-by-construction, discriminating

Three breakages at once, each mapping to a distinct test:

| Construction | Red | Green stayed |
|---|---|---|
| heading copy changed | A2 only | A1, eye toggle, email error |
| terms dropped from `formIsValid` | A3 only, **at line 294** — after the empty / name-only / bad-email / short-password steps had all passed | — |
| `router.push()` restored in place of the inbox screen | A4 + A5 | — |

`4 failed · 3 passed`. The second row is the one that matters: it proves the
assertion isolates the terms rule rather than passing on "something is
disabled". Tree restored from backups and `git diff --stat` re-checked before
committing.

### The different-model review caught a false claim I wrote

`/adversarial-review` ran in **Sonnet** (maker ≠ checker), read-only, in its own
worktree. Verdict: **approve with one should-fix**, and the should-fix was real:

> the header said *"A1–A3 touch NO network at all"* — **false**. `PasswordInput`
> fires a debounced `POST /auth/check-password` (500 ms) whenever the value
> clears the 12-char floor, and two of those tests fill a valid password without
> mocking it. It stayed invisible across 14/14 green runs because
> `onValidityChange` flips optimistically on the **stale** empty `apiFailures`
> the instant `tooShort` goes false, so assertions resolve before the timer
> fires. On a slower tick the request goes out for real.

A green that passes for a reason unrelated to the thing asserted — the exact
class this repo keeps paying for, and I wrote it into a header that claims the
opposite. Fixed by stubbing `check-password` in the two tests and correcting the
sentence. Two nits also fixed: an unanchored `toHaveURL` regex in A5 (would have
accepted `/register/he`), and an `AccountSheet.jsx` citation off by two lines.

**The reviewer respected the read-only boundary** — no `git stash`, no
`checkout`; it reconstructed the diff by reading files. `git status` was clean
afterwards, checked rather than assumed.

### The mocking conflict, flagged not resolved

`frontend/e2e/CLAUDE.md` bans mocks in `e2e/flows/`. The merged
`flows/28-register-success-state` route-mocks three endpoints in that same
directory. A4/A5 mock exactly one (`POST /api/auth/register`); A1–A3 touch no
network. Followed the code precedent, wrote the reasoning into the spec header,
and put the doc/code disagreement in the PR body as a call for Sapir. **The same
CLAUDE.md also warns that real registrations burn the shared `/auth/register`
rate limit on every PR**, so the unmocked version is discouraged by the same
file that bans the mocked one.

---

## 2 · MEH-217 — the park premise is FALSE. Measured, posted to the card.

```
.github/workflows/e2e.yml:231-233   (step "Run E2E tests")
  DEMO_OWNER_PASSWORD / DEMO_CONSUMER_PASSWORD / DEMO_ADMIN_PASSWORD
```

s6 parked MEH-217 as *"PERMANENT for CC"*, reasoning that "registered in CI"
needs a repository secret **or** an `e2e.yml` edit, both Sapir's. **Both already
exist** — Sapir applied `docs/ci/e2e-auth-fixtures.patch.md` in `21ccecc` on
26/07, and `frontend/e2e/CLAUDE.md` states outright *"Authenticated coverage
runs on every PR"* with run `30220096957` as proof.

So an admin spec using `test.use({ storageState: "e2e/.auth/admin.json" })` plus
`skipUnlessProvisioned()` (`flows/25:78-88`) **runs in CI**. It does not skip.

**The blocker inverted rather than vanished: CI yes, local no.** This sandbox has
no backend — Railway egress is denied, and a local Postgres was blocked by the
sandbox this session. So the specs are writable and CI-valid but cannot be shown
green before push, and ORDERS §3 wants evidence, not "should pass". **No specs
written.** Full chunk plan + the remote-target run recipe posted to the card.

**Two sub-sections stay out of CI regardless** (2F delete producer, 3C
delete/promote-to-admin): the card's own reasoning — *"לא רוצים Playwright שירוץ
בCI בטעות על data אמיתי"* — was never reversed by the 08/08 ruling, which
changed **who** does QA, not **which** destructive actions may run unattended.

---

## 3 · Card opened — MEH-1964 (High)

**Consumer registration has no Header entry point at all.** Measured in a real
DOM, both viewports, `/` and `/producers`: `/register` links in header = **0**
everywhere. The only register link on those pages is `/register/producer`.

**The probe carries its own control, and that is the transferable part.** It
also counts `/login` links, whose answer is known before running (`LoginAccount`
is `hidden md:inline-flex` → desktop > 0, mobile = 0). Measured desktop 1 /
mobile 0 — matching the prediction, which is what licenses reading the
`/register` zeros as a real absence. Committed as
`frontend/e2e/qa-meh215-header-discovery.mjs` so the next reader can re-run it.

Filed for a **ruling, not a fix**: the Header CTA removal was deliberate
(MEH-907), so either §A1 of the registration card is stale, or the consumer side
needs a replacement — and if it does, it belongs in the Nav-registry card, not a
point edit to `Header.jsx`.

---

## 4 · Sandbox facts worth carrying forward

- **Playwright browser mismatch.** The image ships build `1194`; the repo pins
  `@playwright/test` 1.56.1, which wants `1234`, and the layout differs
  (`chrome-linux/headless_shell` → `chrome-headless-shell-linux64/chrome-headless-shell`).
  Fix without downloading: build a shim dir of symlinks and point
  `PLAYWRIGHT_BROWSERS_PATH` at it. Worked for the whole suite.
- **`global-setup` throws on a local target when `DEMO_*_PASSWORD` is set** and
  no backend answers — it is not a skip. For unauthenticated specs, run with
  `env -u DEMO_OWNER_PASSWORD -u DEMO_CONSUMER_PASSWORD -u DEMO_ADMIN_PASSWORD`.
- **The `he` locale prefix is stripped.** `/he/register` 307s to `/register`.
  Use unprefixed paths in specs — that is what most of `flows/` already does.
- **Local Postgres was denied** by the sandbox this session (s6 managed it, so
  this is not a standing property — retry rather than assume).

---

## In-flight ledger

| PR | Card | pushed | state | next revisit |
|---|---|---|---|---|
| (opening) | MEH-215 journey A | 09/08 10:2xZ | branch pushed, PR held for the adversarial review to return | on reviewer completion |
| this log | — | — | docs-only, separate branch | after the code PR opens |

**Branch-name warning, again:** merging the journey-A PR will flip **MEH-215 →
Done** even with no closing keyword — the branch name is the whole trigger, and
the Branch name gate requires `meh-<N>` in it, so no compliant name avoids it.
**The card must be restored to Backlog immediately after merge and the restore
verified by re-reading it.** It is chunk A of 4; B, C and D are unwritten.

## Not done, and named

- **Journeys B, C, D** — not started. Each needs its own spec + build + run
  cycle. Journey B (Google OAuth) additionally needs the mocked-callback
  convention; C and D need a session, so they need either the seeded fixtures or
  a real backend, i.e. the same constraint as MEH-217.
- **MEH-217 specs** — plan posted, no code, for the reason in §2.

## PARKED

See PARKED.md — MEH-217 re-parked with a **corrected** failure class
(local-evidence, not credential).
