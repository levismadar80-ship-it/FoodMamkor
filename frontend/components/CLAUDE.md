# Directory: `frontend/components/`

## Purpose
Reusable React components for the Next.js 14 App Router frontend.
Hebrew RTL (`dir="rtl"` is set at the layout root). JavaScript with
JSDoc — no TypeScript.

## Canonical pattern
`frontend/components/Footer.jsx:1-40` — file-header docstring documenting
MEH-XX history, structure top→bottom, scope guarantees, and any
intentional a11y/contrast deviation with rationale. Mirror this header
shape on any new non-trivial component. For sticky/scroll-aware
behavior see `frontend/components/Header.jsx`.

## Conventions specific to this dir
- **Imports**: `useAuth` from `@/lib/auth-context`, `useLanguage` from
  `@/lib/language-context`, `api` from `@/lib/api`. Translations via
  `useTranslations` from `next-intl` (only for files already migrated;
  see Gotchas).
- **Icons**: `@phosphor-icons/react` exclusively — never Heroicons or
  lucide.
- **RTL**: never use `left-*` / `right-*` / `ml-*` / `mr-*` /
  `pl-*` / `pr-*`. Use logical equivalents (`start-*`, `end-*`, `ms-*`,
  `me-*`, `ps-*`, `pe-*`). Exceptions are documented in
  `.claude/rules/rtl.md` (eye-toggle inside `dir="ltr"`, horizontal
  center idiom, map controls).
- **Cloudinary**: image URLs flow through `lib/cloudinary.js` —
  `f_auto,q_auto` injected centrally (`.claude/rules/frontend.md`).
- **Toasts**: `showToast(message, "info" | "error" | "success", ms?)`
  from `@/lib/toast`.

## Gotchas
- **Central components require `/adversarial-review`** even on a green
  build — `MapClient.jsx`, `ProducerDetail.jsx`, `HomeProductForm.jsx`
  listed in `.claude/central-components.json` (workflow rule 20).
- **i18n migration mid-flight** (MEH-366): `lib/language-context.js` is
  the legacy homegrown provider; the codebase is migrating to
  `next-intl`. Some components use `useTranslations`, others still call
  `useLanguage().t(...)`. Match the pattern of the file you're editing
  — do not bulk-rewrite.
- **Zod before every map API call** (workflow rule 19) — `lib/schemas.js`
  `safeParse()`, then `showToast(error.issues[0].message, "info")`.
- **RTL hook + allowlist** (`.claude/hooks/check-rtl.sh`): physical
  classes are blocked unless within ±1 line of an `rtl-ok` marker, or
  the file is path-exempted in `.claude/hooks/rtl-allowlist.txt`.

## Cross-refs
- `.claude/central-components.json` — review-frequency tier list.
- `.claude/rules/rtl.md` + `.claude/rules/frontend.md` — full rules.
- `frontend/lib/auth-context.js`, `frontend/lib/api.js`,
  `frontend/messages/he.json` (translation keys).
