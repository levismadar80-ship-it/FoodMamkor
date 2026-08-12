# Frontend coverage baseline — MEH-1980

**Measured 2026-08-12** against `feature/meh-1980-coverage-ratchet` (`11269aed`),
via `npx vitest run --coverage` (v8 provider, `all: true`).

| | |
|---|---|
| **Global line coverage** | **66.77%** — 8,139 / 12,188 |
| Branches | 63.85% — 6,885 / 10,782 |
| Functions | 58.81% — 2,121 / 3,606 |
| Files measured | 339 |

The **line** figure is the one the ratchet gates on. Branch and function
coverage are recorded because they are free to capture and because they say
something the line number does not — 58.81% of functions means roughly two in
five are never called by a test at all, which is a harsher reading than 66.77%
suggests.

> **This is a measurement, not a target.** The ratchet
> (`scripts/checks/coverage-ratchet.mjs`) blocks a drop of more than **0.5pt**
> below this number. Nothing in this card asks anyone to raise it.

---

## Why the number is trustworthy — `all: true`

Without `all: true`, v8 reports only files that some test imported. Under that
setting, **deleting a module's last test makes its coverage "improve"** — the
file leaves the report entirely and the global percentage rises. That is the
worst failure mode available to a coverage ratchet, so the config measures every
source file under `app/`, `components/` and `lib/` whether or not a test touches
it.

The practical consequence: this 66.77% is lower than a naive measurement would
report, and it is the honest number.

---

## Per-directory, least-covered first

| Coverage | Lines | Files | Directory |
|---:|---:|---:|---|
| **56.6%** | 3,231 / 5,706 | 143 | `app/[locale]` |
| **59.4%** | 111 / 187 | 2 | `components/admin` |
| 64.5% | 40 / 62 | 3 | `app` |
| 73.0% | 2,984 / 4,087 | 94 | `components` |
| 74.2% | 72 / 97 | 4 | `components/public` |
| 81.5% | 1,519 / 1,863 | 82 | `lib` |
| **97.8%** | 182 / 186 | 11 | `components/ui` |

**The shape is the finding, more than any single number.** Coverage falls
almost monotonically as code moves from pure logic toward rendered pages:
`lib/` (pure functions) is 81.5%, the `ui/` primitives are 97.8%, and
`app/[locale]` — the routed pages, and the largest directory by a wide margin —
is 56.6%. That is the expected gradient for a repo whose unit tests are
strongest around helpers; it is worth stating because it means the global figure
is dominated by page-level code.

---

## The ten least-covered files

Every one of these is at **0.0%** — not thinly covered, but never executed by
any unit test.

| Lines | File | Risk note |
|---:|---|---|
| 0/91 | `app/[locale]/admin/settings/page.js` | Admin settings surface — writes that affect every producer. |
| 0/68 | `app/[locale]/admin/recipes/page.js` | Admin moderation queue for recipes. |
| 0/67 | `app/[locale]/admin/experiences/page.js` | Admin moderation queue for experiences. |
| 0/64 | `components/RecipeForm.jsx` | Owner-facing create/edit form; validation logic. |
| 0/58 | `components/HomepageMiniMap.jsx` | Renders on the home route; Leaflet init path. |
| 0/57 | `app/[locale]/admin/kashrut/page.js` | Kashrut verification — a **legally sensitive** surface (`labels.md`: kosher is admin-verified, חוק איסור הונאה בכשרות). |
| 0/54 | `components/ProducerOAuthButtons.jsx` | Auth entry point for producer registration. |
| 0/50 | `app/[locale]/reset-password/ResetPasswordClient.jsx` | Credential-changing flow. |
| 0/49 | `components/InstallPrompt.jsx` | PWA install affordance. |
| 0/43 | `components/PhoneVerifyCard.jsx` | OTP entry; pairs with the backend OTP path. |

### What stands out, and what I am *not* claiming

**Five of the ten are admin surfaces**, and `components/admin` is the
second-least-covered directory overall. That is a coherent gap rather than ten
unrelated files, and it lines up with an existing card: **MEH-217** (admin panel
end-to-end, six tabs) is in Backlog and labelled `[CC, tests-only]`. The unit-level
gap measured here and the E2E gap that card describes are the same hole seen from
two directions.

**Three of the ten touch auth or credentials** — `ProducerOAuthButtons`,
`ResetPasswordClient`, `PhoneVerifyCard`. Flagged because of what they are, not
because I found a defect in them: **0% coverage is an absence of evidence, not
evidence of a bug.** I have not read these files looking for faults, and nothing
here should be read as a claim that they are broken.

**A caveat on the 0% itself.** Some of these almost certainly *are* exercised —
by Playwright, which this measurement does not see. `RecipeForm`, the OAuth
buttons and the reset-password client are exactly the surfaces an E2E suite
would drive. So "0% unit coverage" is the accurate statement; "untested" is not,
and this report does not make that stronger claim.

---

## Scope: frontend only, deliberately

The card asked for frontend **and** backend. The backend already has both a
measurement and a gate — the PR-checks workflow runs pytest with
`--cov=backend/app … --cov-fail-under=70`, and the comment above that step
carries its own frozen baseline. Adding a second backend coverage mechanism
would put two owners on one job.

**Backend numbers are deliberately absent from this document.** They could not
be measured here (no postgres, no `backend/.venv` in the CC sandbox) and are
produced by CI on every backend-touching PR. The workflow's own comment records
*77% (5,529 statements)* as of whenever that gate landed — but MEH-1911's
stability proof measured *89% across 8,923 statements*, so **that comment is
very likely stale**. I have not established which is current, and rather than
copy a number I cannot stand behind, this file records the discrepancy and
stops. Re-derive it from the latest `Backend tests (pytest)` job before quoting
either figure.

---

## Reproducing

```bash
cd frontend && npx vitest run --coverage
node scripts/checks/coverage-ratchet.mjs                    # compare vs baseline
node scripts/checks/coverage-ratchet.mjs --update-baseline  # re-freeze (refuses a drop)
```

The instrumented run takes several minutes; `--coverage` is opt-in, so the
unit-test job that gates every PR is unaffected.
