# MEH-1279 — AccountSheet language-row alignment · Local-stack QA

**Branch:** `feature/meh-1279-language-row-align` · **Pattern:** MEH-1242 local-stack
(built `next start`, Playwright, mobile 375×812 @2x, guest state, cookie banner dismissed).

## Screens

| File | State | What it shows |
|---|---|---|
| `accountsheet-before-375-sheet.webp` | BEFORE | Globe pushed ~8px **inward** (left) of the SignIn/Heart/Gear/Storefront icon column — the 36px `LanguageToggle` circle chip; taller row. |
| `accountsheet-after-375-sheet.webp` | AFTER | Globe (size 19, bare) **flush** on the same start line as siblings; row height matches. |
| `accountsheet-before-375-full.webp` | BEFORE | Full mobile viewport context. |
| `accountsheet-after-375-full.webp` | AFTER | Full mobile viewport context. |

## Result

- ✅ **Geometry fixed** — the language row's Globe now aligns to the same START (right-in-RTL)
  icon line as `כניסה` / `מועדפים` / `הגדרות` / `יש לך בית עסק?`, and the row is the same
  height (`rowCls` `min-h-[48px]`, shared with the SignOut tier).
- ✅ **Single full-row tap target** — the whole row is the `variant="bare"` toggle button
  (≥44px, WCAG).
- ✅ **Text** `עב / EN` at `text-[13.5px]`, `dir="ltr"` preserved, `aria-hidden` (button carries
  the `aria-label` switch action).
- ✅ **Locale flip verified** — clicking the Globe navigated `/` → `/en` (onToggle untouched).
- ✅ `npm run build` green; vitest AccountSheet + Header green (32 passed).

Guest state was used (favorites/settings visible as size-19 sibling references); the SignOut
row shares the exact same `rowCls` so parity holds by construction.
