---
paths:
  - "frontend/**/*.jsx"
  - "frontend/**/*.js"
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
  - "frontend/**/*.css"
  - "frontend/**/*.html"
  - "frontend/**/*.scss"
---

# RTL rules

Hebrew is RTL. Every positional class, every map layer, every password
input has to be thought through — physical left/right don't mean what
they look like on an RTL page.

---

## Logical properties — never use physical directional classes

Use logical properties:

- `start-*` / `end-*` instead of `left-*` / `right-*`
- `ms-*` / `me-*` instead of `ml-*` / `mr-*`
- `ps-*` / `pe-*` instead of `pl-*` / `pr-*`

When adding ANY positional class, ask: **is this directional?** If yes,
use the logical equivalent.

### Intentional physical-property exceptions (keep as-is, add `// rtl-ok` comment)

- Eye-toggle buttons inside `dir="ltr"` password inputs (`right-3`)
- Carousel prev/next arrows
- `left-1/2 -translate-x-1/2` horizontal-center idiom
- `pr-11 pl-4` password-input padding pair
- Map geographic controls (zoom, locate)

Each exception exists because the surrounding element is `dir="ltr"` or
the property is logically symmetric (horizontal center). Outside these
cases, always use logical properties.

---

## Map z-index tokens (do not use arbitrary values on `/map`)

```
tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 →
legend:800 → controls/zoom/search:1000 → chat:9999 → cookie:9998
```

Bottom sheets must ALWAYS sit below map controls. See `globals.css` for
CSS overrides and `MapClient.jsx` for the Tailwind classes that reference
these tokens.

---

## Known RTL bug patterns (cross-ref [docs/BUG_PATTERNS.md](../../docs/BUG_PATTERNS.md))

- **RTL eye toggle** — password inputs use `dir="ltr"`; toggle must be
  `right-3` (physical), never `left-3`. Live in `/login` + `/register`.
- **Leaflet tooltip z-index** — must be `500` (between markers:400 and
  bottom-sheet:600). See Map z-index tokens above.

---

## RTL allowlist — single source of truth (MEH-365)

`.claude/hooks/rtl-allowlist.txt` is the **single source of truth** for RTL
exceptions. Both enforcement tools read from it:

- `check-rtl.sh` (PreToolUse hook) — blocks edits to non-allowlisted files
  containing physical RTL classes unless annotated
- `verify-frontend` agent — static scan reports violations not covered by
  the allowlist

### Two sections in the allowlist

```
# ============ PATH EXCEPTIONS ============
# Files where physical properties are justified (entire file exempt).
frontend/app/map/MapClient.jsx
...

# ============ CONTENT PATTERNS ============
# Inline annotation markers (suppress individual violations).
rtl-ok
```

### Inline `// rtl-ok` annotation

Add `// rtl-ok` on the same line as a physical class, or either adjacent
line (±1), to suppress a single violation without exempting the whole file:

```jsx
{/* rtl-ok */}
<div className="left-1/2 -translate-x-1/2">   {/* horizontal center — direction-neutral */}
```

Both tools enforce the same ±1 adjacency window. Adding a new physical
exception that isn't direction-neutral → add the file to PATH EXCEPTIONS
in the allowlist (not an inline annotation).
