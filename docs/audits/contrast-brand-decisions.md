# Contrast-on-brand-color decisions — for Sapir

> Created by the overnight a11y fix-wave (MEH-230, Task 1, 2026-06-13).
> These are the **contrast findings from `docs/audits/2026-06-13-a11y.md`
> Vector 5** that the fix-wave **deliberately did NOT touch** — every one of
> them requires changing a **brand-locked color token**, which is a brand
> decision, not a mechanical a11y fix. Listed here so Sapir can triage in one
> place: darken the token, accept-risk (large-text-only usage), or restrict the
> token's usage to large text / decorative roles.

**Scope reminder:** the a11y audit found **0 CRITICAL / 0 SERIOUS**. All items
below are MODERATE color-contrast (WCAG 1.4.3). Nothing here blocks launch on
its own; the cluster is the warm `accent` / `honey` / `green-300` decorative
palette.

## Brand-token contrast pairs (all DEFERRED — brand decision)

| Foreground token | Background | Ratio | Normal 4.5 | Large 3.0 | Note |
|---|---|---|---|---|---|
| `text-accent` #8b6914 | `background` #f5f0e8 | 4.48 | FAIL (by 0.02) | PASS | A ~0.5% darken of `#8b6914` clears 4.5. Many sites — see below. |
| `text-honey` #c8821e | `surface` #ffffff | 3.15 | FAIL | PASS | honey accents/icons on white cards |
| `text-honey` #c8821e | `background` #f5f0e8 | 2.78 | FAIL | FAIL | honey on page bg — fails even large |
| `green-300` #6fa284 | `surface` #ffffff | 2.93 | FAIL | FAIL | green-300 as text |
| `green-300` #6fa284 | `background` #f5f0e8 | 2.58 | FAIL | FAIL | green-300 as text on page bg |
| white #ffffff | `green-300` #6fa284 | 2.93 | FAIL | FAIL | white text on bg-green-300 chips |
| `honey` #c8821e | `green-900` #143228 | 4.40 | FAIL | PASS | honey-on-dark accents |
| `accent` #8b6914 | `green-50` #eaf3de | 4.45 | FAIL | PASS | accent on light-green strips |
| white/40 (≈#72847e) | `green-900` #143228 | 3.51 | FAIL | PASS | Footer newsletter placeholder (`Footer.jsx:188`) |

### Highest-leverage single decision: `text-accent` #8b6914

At 4.48:1 it is a hair under 4.5. A tiny darken (~`#876412`) clears normal-text
AA at every confirmed site below — one token edit, broad win:

`components/ui/Link.jsx:28`, `components/ProducerCard.jsx:304,359`,
`components/ExperienceCard.jsx:93`,
`app/[locale]/about/process/AboutProcessClient.jsx:81,93,116,148,196,230,367`,
`app/[locale]/about/AboutClient.jsx:170,199`,
`app/[locale]/login/LoginClient.jsx:157,314`, `app/[locale]/page.js:102,107`.

### Options per token (Sapir picks)

1. **Darken token** to clear 4.5:1 (recommended for `text-accent` — visually
   near-identical, clears the most sites).
2. **Restrict usage to large text only** (`honey`, `green-300` pass at ≥3.0
   for ≥18.66px bold / ≥24px) — keep the hue, gate the size.
3. **Accept-risk** with a documented rationale (decorative-only, non-text).

## Out of fix-wave scope but NOT contrast (logged for the same triage pass)

These were in the a11y audit but were left by the fix-wave for non-contrast
reasons — recorded here so nothing is lost:

- **`MapClient.jsx:254` (map legend filter) — border-only focus.** Left because
  `MapClient.jsx` is a **central component** (`.claude/central-components.json`)
  — focus changes there need the central-component review path, not a blind
  mechanical sweep. Map-marker keyboard a11y is handled separately by MEH-765.
- **`ChatWidget.jsx:217` / `InstallPrompt.jsx:95` — `aria-modal="false"` on a
  `role="dialog"`.** Both are **deliberate non-blocking overlays** (audit Vector
  7 note). Flipping to `aria-modal="true"` without a real focus-trap would be
  worse, not better. Decision needed: keep non-modal (drop the dialog role, use
  `role="status"`/region) OR make them true blocking modals. Not mechanical.
- **`CategoryRequestModal.jsx` — no Tab focus-trap.** Already has
  `role="dialog"` + `aria-modal="true"` + ESC + `useFocusReturn` + `autoFocus`,
  so it meets the mechanical bar; a full Tab-cycle trap is a follow-up.
- **Border-only focus inputs** (settings/password ×8, `admin/ProducerForm.jsx:286`,
  `PhoneVerifyCard.jsx:114`, `producer/dashboard/page.js:786`). These already
  have a `focus:border-primary` affordance (a *weak* but present replacement),
  so they fall outside "outline-none with NO replacement". Upgrade to
  `focus-visible:ring-2` in a follow-up sweep if desired.
