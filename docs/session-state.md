# Session state — 2026-09-01, drain יז' (session `0113JYkWvGYY…`)

**One line:** the brief changed twice mid-window; of the twelve items the work
briefs named, **eight were already done or empty**, and the labeling pass that
replaced them stopped after two writes when Sapir's edits began landing on the
same cards I was reading.

---

## STEP 0 — clean, and this time the instrument was verified first

```
git fetch --unshallow origin   →  shallow=false
bash scripts/wake-when.sh --self-test   →  17/17, all discriminating
bash scripts/wake-when.sh
  0 OPEN · 8 parked · 1 satisfied · 6 skipped · 1 unstarted · 0 void
  control: ok · currency: ok (origin/staging matches origin)
```

The currency control added yesterday reported `ok` — the first run where the
staleness half of STEP 0 was actually checked rather than assumed.

**T11 / OPEN work: none.**

---

## The refutation sweep — 8 of 12 briefed items

Every one measured with a single command before any card was read. **Not one
announced itself; each read as live work in the brief.**

| item | verdict | evidence |
|---|---|---|
| **MEH-2122** (OTP silent failure) | ❌ **refuted ×2** | Chunk A merged 18/08 — `b43b6176` (#3007), guard test `tests/test_meh2122_otp_failure_visibility.py` on staging. Card is now labelled **`post-launch`** = out of scope by the brief's own rule. Its own banner warns the orchestrator routed it by the stale title; that happened again. |
| **MEH-1754** (resolver → notFound) | ❌ **refuted** | Landed 02/08 (#2514) + 12/08 (#2832). Verified across **all seven** SSR entity routes: each has `status === 404` + a `throw`, **none returns a bare `null`**. Only item 5 (env fail-fast) is open. |
| **MEH-2192** (GEO foundation) | ❌ **refuted** | `llms.txt` exists · `buildOrganizationNode()` carries `description` + `sameAs` (#3199) · `/about` has `alternates` + `about.updated_at = "עודכן: אוגוסט 2026"` rendered at `AboutClient.jsx:242`. #3123 + #3199. The one AC left (`grep = 1` site-wide) the card itself proves impossible. |
| **MEH-2119** (3 × BaseHTTPMiddleware) | ❌ **refuted** | `grep -c "class.*BaseHTTPMiddleware" middleware.py` → **0**. MEH-1906 converted ours to pure ASGI. **Three → one**, and the one left is vendor code (`SlowAPIMiddleware`, `middleware.py:277`). |
| **MEH-2043** (fonts from gstatic) | ❌ **refuted** | PR 1 shipped: `StoryCardCanvas.jsx` has **no** gstatic reference; `next.config.js:90-105` documents the repoint. Only the CSP tightening remains — which waits for a go anyway. |
| **MEH-2231/2232** (duplicate) | ✅ **resolved, verified** | MEH-2232 is `Duplicate`, `canceledAt 2026-08-31T06:14:18Z`. Confirmed, not assumed. |
| **MEH-2239** (one-line PNG fix) | ❌ **not one line** | **Three** `page.screenshot` PNG calls in that one file (`:161`, `:176`, `:265`), across **two** directories, and **no spec in the repo compresses**. Left alone per instruction. |
| **T11** | — | 0 OPEN. |

**Premise held:** MEH-2079 (nothing prunes), MEH-2080 (no age field anywhere),
MEH-2184 (proven, below), MEH-2237 (no audit doc exists).

---

## The one real finding — MEH-2184 is worse than the card says

The qa-artifacts size cap uses a root-anchored pathspec, so it never matched
`frontend/qa-artifacts/`. Proven with git, not argued:

```
git ls-files -- qa-artifacts/           → 1620 files,  0 under frontend/
git ls-files -- frontend/qa-artifacts/  →  495 files
git ls-files -- ':(glob)**/qa-artifacts/**' → 2115   (= 1620 + 495, exact union)
```

**14,806,301 bytes (≈14.8 MB) already committed in the blind half — against a
2 MB per-PR cap.**

> **And it is not "a PR could evade the gate".** `e2e.yml` runs Playwright with
> `working-directory: frontend`, so a spec writing a relative path lands in the
> blind half. `28-register-success-state.spec.ts:265` writes
> `qa-artifacts/MEH-2138f/…` and that directory exists **only** at
> `frontend/qa-artifacts/MEH-2138f/`. **The blind half is the default output
> location of the thing the cap exists to measure.**

Patch for Sapir: `docs/ci/meh-2184-qa-artifacts-pathspec.patch.md`.

---

## Three cards were being tracked in the wrong shape

All three sat in wake-when's `SKIP` list — "an action outside the repo" — while
each one's gate is **a line in a file on this branch**. Now checked rows (#3263):

| card | gate | today |
|---|---|---|
| MEH-1754 item5 | `NEXT_PUBLIC_API_URL` in `pr-checks.yml` | `0` (e2e.yml has 9; the gating file has none) |
| MEH-2184 | cap pathspec globbed | `0` |
| MEH-2043 pr2 | `fonts.gstatic.com` out of `next.config.js` | `2` |

MEH-2237 became the second `UNSTART`.

---

## The labeling pass — started, stopped after two writes, and why

| card | label | the sentence that decided it |
|---|---|---|
| **MEH-1249** | `blocked-needs-sapir` | *"השאלה שמחכה להכרעה: האם ההמרה מכסה את 1,074 השורות שאושרו ב-05/08 … או שהמטריצה מתרעננת קודם?"* |
| **MEH-1976** | `post-launch` | *"📌 01/09 — הכרעת ספיר: post-launch … אין עבודת CC נותרת"* |

> **⚠️ MEH-1976 is a self-correction, and it is the reason the pass stopped.**
> I first wrote `blocked-needs-sapir` on it, from a body I had read earlier in
> this same window. Between that read and that write, **Sapir added a ruling
> banner to the card** moving it to `post-launch`. My label contradicted her
> ruling and was corrected within the minute.
>
> **The lesson is procedural, not incidental:** the cards are being edited live,
> so a body read thirty minutes ago is exactly the "stale artifact carrying
> inherited authority" this repo has a rule about. Continuing the pass from my
> earlier reads of MEH-2189 / MEH-2219 / MEH-1981 would have repeated the
> mistake three more times. **Each card needs a fresh read immediately before
> its write — that is a full window's work and it is where I stopped.**

**Not written, and why:** MEH-2189, MEH-2219, MEH-1981, MEH-1938, MEH-2210,
MEH-2167 (bodies read too early, or not read at all). **Confirmed correct with
no write:** MEH-2168, MEH-1904, MEH-1949, MEH-784, MEH-1517, MEH-1615, MEH-1244.
**Backlog (~60): not reached.**

### Counts, so far

`cc-queue 0 · needs-sapir 0 · blocked-needs-sapir 1 · not-cc 0 · post-launch 1 ·
already-done reported 8 · skipped/not-written 6 · confirmed-no-write 7 ·
Backlog not reached ~60`

---

## Next 3

1. **Sapir** — apply `docs/ci/meh-2184-qa-artifacts-pathspec.patch.md`. The gate
   has been reporting green on a diff it never looked at.
2. **CC, fresh window** — finish the labeling pass, re-reading each body
   immediately before its write. 13 Todo + ~60 Backlog remain.
3. **Sapir** — MEH-2219 chunk 2 still contradicts ADR-003 as specified (drain
   טז' finding, unchanged).

## PRs

| PR | What |
|---|---|
| #3263 | `scripts/wake-when.sh` — three gate rows + MEH-2237 `UNSTART` |
| (this) | the MEH-2184 patch for Sapir + STATE + logs |

## Guards

18 ran, **0 fail**, 4 warned — all four measured present on a clean
`origin/staging`; none is this window's.
