# Mehamakor — Design System Brief (for Claude Design / Claude Code)

> **Read this ALONGSIDE `docs/DESIGN.md` + `frontend/tailwind.tokens.json`.**
> Those files carry the *tokenizable* layer. This brief carries everything the
> token exporter **cannot** — plus the governance rules that are not encodable
> as tokens. Importing tokens without this brief regenerates prohibited patterns
> (state-colors, Lucide icons, pure-white surfaces, physical RTL props).

**Authority:** this is a *convenience* layer, not source of truth. On any
conflict, the cited ADR / `docs/BRAND.md` / `docs/CONTEXT.md` / Drive `03-Brand-Hub`
wins. Brand decisions precede code — never the reverse.

---

## 1 · The system is two layers

**Layer A — importable (tokens).**
`docs/DESIGN.md` (front-matter = SoT) → `npm run design:export` →
`frontend/tailwind.tokens.json` → `tailwind.config.js` (via `require()` + spread).
A CI drift gate enforces `DESIGN.md ↔ tokens.json` sync.
→ **Change a token ONLY in `DESIGN.md` front-matter.** Never write `tokens.json`
or `tailwind.config.js` directly — it breaks the drift gate + two-owners rule.

**Layer B — NOT importable (`frontend/app/globals.css` utility layer).**
The exporter (`@google/design.md` v0.1.1) carries only **6-digit hex / spacing /
type**. It **drops**: `cubic-bezier`, `ms` durations, `rgba`/alpha, `transparent`,
`backdrop-filter`, gradients, masks. Everything in §2 lives in `globals.css` by
necessity and will be **silently missing** from any token-only import. Reuse the
existing classes — do not regenerate equivalents.

---

## 2 · Layer B inventory — reuse, don't regenerate

(Names + purpose; exact values live in `frontend/app/globals.css`.)

| Class | Purpose |
|---|---|
| `.duration-fast` / `-base` / `-slow` | Motion durations (180 / 420 / 640ms) |
| `.ease-quart` | Signature easing curve (cubic-bezier) — also used for Framer |
| `.focus-ring` | Accessible focus ring (primary-green alpha) |
| `.action-ghost` / `.action-ghost-on-dark` | Ghost-button primitives |
| `.nav-pill-glass` | Frosted "warm glass" floating-nav surface. **GUARDRAIL:** `backdrop-filter` is NEVER animated/transitioned; has an opaque `reduced-transparency` fallback |
| S14 texture / scrim primitives | Photography+Texture Hybrid — hero scrim, alpha overlays (see `globals.css` MEH-788 block) |
| `.btn-whatsapp` / `.btn-whatsapp-outline` / `.bg-whatsapp` | Single source for `#25D366`. Don't hard-code the hex |
| `.font-english` | **Cormorant Garamond** — explicitly NOT tokenized (`DESIGN.md:206`). Latin/numeric accents only |

---

## 3 · Governance rules — NOT tokens, must be obeyed

These are the rules that prevent "AI slop." None are importable.

- **ADR-019 — component state.** State = **opacity-on-cream + `fg-muted` only**.
  **No new state-color tokens. No semantic green/amber/red state palette.**
  (Validation red on `Input` is an *intentional* system signal per MEH-602 —
  don't "fix" it and don't extend the pattern elsewhere.)
- **ADR-013 — icons.** **Phosphor exclusively** for functional UI (tier 1).
  **Lucide is FORBIDDEN.** Category glyphs = hand-drawn SVG (tier 2); editorial =
  custom illustration (tier 3). Never swap in another icon set.
- **ADR-014 — voice (Hebrew hybrid).** UI chrome = gender-neutral plural/gerund
  (`גלו`, `הוסיפו עסק`). Brand narrative (`/about`) = feminine allowed.
  Forbidden words: `מתווכים`, `יצרן` (always `בית עסק`). `מגזין` is **banned from
  every UI surface**.
- **ADR-018 — hero.** Direction A is canonical. Direction B = campaign-only with
  3 preconditions (see ADR-018). Default to A.
- **Color discipline.** Background is warm cream `#F5F0E8` — **NEVER pure white.**
  Text is `#1C1A17` (not `#000` / `#1a1a1a`).
- **No emoji** in UI / editorial / brand surfaces (MEH-657 LOCK v2). Allowed only:
  WhatsApp outbound, share strings, email body.

---

## 4 · RTL — hard constraint

- Hebrew RTL. **Logical properties only:** `start-*` / `end-*` / `ms-*` / `me-*`.
  **Never** `left-*` / `right-*` / `ml-*` / `mr-*` for directional positioning.
- Documented exceptions only (add a comment): eye toggles, carousel arrows,
  centering idiom, `/map` geographic positions.
- Hebrew is **always upright**. Cormorant *italic* is reserved for Latin/numerals
  — never Hebrew.
- FRL-900 under negative letter-spacing produces a serif artifact at cream→gold
  color seams (reads as a geresh to Hebrew readers). Fix:
  `margin-inline-start: 0.14em` on the accent word.

---

## 5 · DNA locks — never generate copy/UI that violates

- "מגזין, לא marketplace" · no transaction fees ever · manual approval per
  business · licensed businesses only.
- Forbidden marketing premises: `שכנות מבשלות מהבית` / `אוכל ביתי` /
  `מהמטבח של השכן`.

---

## 6 · `/design-sync` rules

- **Pull** (design system → repo): fine.
- **Push** (canvas → repo): token changes must land in `docs/DESIGN.md`
  front-matter → then `design:export`. **NOT** directly into `tokens.json` /
  `tailwind.config.js` (CI drift gate + two-owners).
- Treat `tailwind.config.js`, `frontend/messages/he.json`, `main.py` as **RED-tier
  central**: chunk + review, never auto-merge.
- **Open question to verify before trusting push:** which file does `/design-sync`
  write tokens into? If it writes `tokens.json`/config directly, it breaks the
  drift gate — confirm first.

---

## 7 · Import now vs wait

- **Safe to import now:** color / type / spacing / radius tokens (stable, gated).
- **Wait:** atomic components (MEH-602, In Progress) and photography/motion
  (MEH-788, In Progress) — the system is mid-migration. Import after they settle,
  or you import drift.
