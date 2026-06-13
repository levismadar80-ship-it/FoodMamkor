# Accessibility (a11y) — מהמקור

Distilled accessibility rules for the מהמקור frontend (Next.js, RTL Hebrew) +
how to run the axe regression net. Standard: **WCAG 2.1 AA**. RTL-first.

First full audit: [`docs/audits/2026-06-13-a11y.md`](./audits/2026-06-13-a11y.md)
(MEH-230). That file is the evidence log (file:line per finding); this file is
the standing ruleset.

---

## The rules (keep these green)

### 1. Icon-only controls need an accessible name
Any `<button>`/clickable whose only visible child is an icon (Phosphor, SVG,
emoji glyph) MUST have `aria-label` (or `aria-labelledby`). The icon itself
gets `aria-hidden="true"`. Pattern in repo: search/menu/close/carousel/share
buttons all do this.

### 2. Images: `alt` always present
Meaningful images: `alt={descriptive}`. Decorative images: `alt=""`
(explicit empty — never omit the attribute). Avatar-in-button → `alt=""`
because the button carries the name.

### 3. No `onClick` on non-interactive elements
Use `<button>` / `<a>`. If you must put a handler on a `div`/`span`, it needs
`role="button"` + `tabIndex={0}` + a matching `onKeyDown` (Enter/Space). The
repo prefers real `<button>` everywhere — keep it that way.

### 4. Every input has an accessible name
A `<label htmlFor>` (or wrapping `<label>`, or `sr-only` label), `aria-label`,
or `aria-labelledby`. **Placeholder is NOT a label.** sr-only labels are the
house pattern for search/chat inputs (`Footer.jsx:177`, `ChatWidget.jsx:280`).

### 5. Contrast ≥ 4.5:1 (normal text), ≥ 3:1 (large text ≥24px / ≥18.66px bold)
Compute against the token, not a guess. Tokens live in
`frontend/tailwind.tokens.json`. **Known sub-4.5 decoratives** (do not
introduce new uses as body text): `text-accent` (#8b6914, 4.48:1 on bg),
`text-honey` (#c8821e), `green-300` text/white-on-`green-300`. Safe for body
text: `text`, `muted`, `fg-muted`, `primary`, white-on-`primary`/`green-700`,
`gold-on-dark`-on-`green-900`.

### 6. Never remove focus without replacing it
`outline-none` / `focus:outline-none` / `ring-0` is only allowed when the SAME
element provides a visible replacement — use the repo's `focus-ring` utility or
`focus-visible:ring-2 focus-visible:ring-primary/40`. A `border-color`-only
change is NOT a sufficient focus indicator. (WCAG 2.4.7 / 2.4.11.)

### 7. Modals: dialog + ESC + focus-trap, all three
A blocking modal needs `role="dialog"` + `aria-modal="true"` + an Escape
handler + focus containment (trap on open, return focus on close). Canonical
implementations: `LocationModal`, `LoginPromptModal`, `AccountSheet`,
`Lightbox`. A non-blocking overlay may use `aria-modal="false"` but then should
NOT trap focus — pick one mode, don't half-implement.

### 8. RTL reading order — logical props by default
Use logical Tailwind utilities: `ms-/me-/ps-/pe-/start-/end-/text-start/
text-end`. Physical props (`ml-/mr-/left-/right-/pl-/pr-`) are only for the
**documented exceptions** in [`.claude/rules/rtl.md`](../.claude/rules/rtl.md)
— LTR content (phone numbers, latin text, password-eye toggles inside
`dir="ltr"`), map overlays pinned to physical screen corners, and the
horizontal-center idiom `left-1/2 -translate-x-1/2`. **Those exceptions stay.**
When you use a physical prop for one of these reasons, add a `// rtl-ok: <why>`
comment so the next audit doesn't re-flag it. Never reorder meaningful content
visually (`flex-row-reverse`, `order-`) without matching DOM order — it breaks
VoiceOver/TalkBack.

---

## How to run the axe regression net

The net lives at `frontend/e2e/flows/12-axe-a11y.spec.ts`. It loads 6 routes
(`/ /producers /producer/[id] /map /login /register`) and asserts **zero
`critical` / `serious`** axe violations (WCAG 2a/2aa/21a/21aa tags). `moderate`/
`minor` violations are logged to the console (for triage) but do NOT fail the
run — the standing MODERATE backlog is tracked in the audit doc, not gated.

### Local (against a local dev server)

```bash
cd frontend
npm install                      # first time — installs @axe-core/playwright
npx playwright install chromium  # first time — browser binary
npm run dev                      # terminal 1: starts localhost:3000

# terminal 2:
TEST_URL=http://localhost:3000 npx playwright test e2e/flows/12-axe-a11y.spec.ts
```

`baseURL` defaults to `http://localhost:3000` (see `playwright.config.ts`), so
`TEST_URL` is optional locally. Use `--project=desktop` or `--project=mobile`
to scope to one viewport.

### CI (Vercel preview)

The spec runs in `.github/workflows/e2e.yml` on the `deployment_status`
trigger, same as the other flows, with `TEST_URL` set to the Vercel preview and
the `x-vercel-protection-bypass` header injected by the config. No extra wiring
needed — a new `NN-*.spec.ts` under `e2e/flows/` is auto-discovered by
`testMatch` in `playwright.config.ts`.

> Note: `Playwright E2E (Vercel preview)` is **not** a required merge check (see
> [`.claude/rules/testing.md`](../.claude/rules/testing.md)). The axe net runs
> post-preview; treat a red axe run as a real a11y regression to fix, not a
> merge blocker by policy.

### What the gate ignores today (`GATE_IGNORE_RULES`)

axe rates `color-contrast` and `link-in-text-block` as **serious**, but these
are the site-wide contrast/brand-palette backlog the audit classifies MODERATE
and defers (Vector 5/6 — brand-color change out of scope). The footer's
low-contrast links/copy trip them on every route, so the spec lists both rule
IDs in `GATE_IGNORE_RULES`: they're still reported to the console, just not
gated. Without this the net would be red on day one and mask genuine new
critical/serious regressions.

### Tightening the gate later

Two levers, both in `12-axe-a11y.spec.ts`: (1) remove a rule from
`GATE_IGNORE_RULES` once its backlog (contrast palette + the 19 focus-indicator
removals) is burned down; (2) add `"moderate"` to `GATE_IMPACTS` to gate the
moderate tier. Do either only after the corresponding backlog in the audit doc
is cleared, or the routes will go red.

### Dependency

`@axe-core/playwright` (dev). Pinned to the 4.x line — `axe-core ~4.11`, which
matches the version already resolved transitively in the lockfile. No major
version bumps (peer: `playwright-core >= 1.0.0`, satisfied by the installed
`@playwright/test` 1.60.x).
