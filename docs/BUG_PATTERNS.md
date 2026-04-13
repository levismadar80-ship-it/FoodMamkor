# מהמקור — Known Bug Patterns

> Every time a bug is found and fixed, Claude must: (1) identify the root cause pattern, (2) search the entire codebase for the same pattern, (3) fix ALL instances in the same PR, (4) add an entry here. See CLAUDE.md rule 14.

---

### Pattern 1: RTL icon positioning
- **Bug:** Password eye toggle appeared on the LEFT side of input fields. In RTL Hebrew layout, positioned elements inside inputs should be on the RIGHT (leading/start) side.
- **Root cause:** Used `left-3` (physical left) instead of `right-3` for the eye icon. In RTL, the leading side is RIGHT.
- **Rule:** In RTL context, use `right-3` for icons inside inputs (the start/leading side). For LTR-only contexts (e.g., map popups, code editors), `left-3` is fine. When in doubt, use Tailwind logical properties (`start-3` / `end-3`) which auto-flip.
- **Grep check:** `grep -rn 'absolute.*left-3' frontend/app --include='*.jsx'` — verify each hit is intentional (badges on images are fine; icons inside RTL inputs should be `right-3`).
- **Files fixed:** `login/page.js`, `register/page.js` — eye toggle `left-3` → `right-3`, input padding `pl-11` → `pr-11`.

### Pattern 2: Empty optional fields showing blank space
- **Bug:** When optional data (website, phone, instagram, category) was null/undefined, empty `<div>` containers still rendered with `mt-2`, `mb-2`, or `gap` padding — visible as blank vertical space.
- **Root cause:** Wrapping `<div>` rendered unconditionally even when all children inside were `{x && ...}` conditional.
- **Rule:** ALWAYS wrap the container div in a conditional too: `{(a || b || c) && <div>...</div>}`. Never render an empty container that only has conditional children.
- **Grep check:** `grep -rn 'flex flex-wrap.*gap\|flex flex-wrap.*mb' frontend/components --include='*.jsx'` — each wrapper must have a parent conditional if all children are optional.
- **Files fixed:** `ProducerCard.jsx` (badge row, city line), `HomeProductCard.jsx` (badge row, location+price row), `EventCard.jsx` (category badge, producer·city separator), `ExperienceCard.jsx` (footer category).

### Pattern 3: Grid with hardcoded optional positions
- **Bug:** 2-column grid (`grid-cols-2`) had hardcoded positions for optional items (phone, instagram, website, copy-link). When a producer had no website, the grid rendered `<div />` placeholder leaving an ugly empty cell.
- **Root cause:** Grid positions were hardcoded: "row 1 = phone + instagram, row 2 = website + copy-link". When website was missing, the empty placeholder consumed half the row.
- **Rule:** Build a dynamic array of available items first, then render them in rows. When the count is odd, make the last item full-width. Never hardcode grid positions for optional content.
- **Grep check:** `grep -rn 'grid-cols-2' frontend/app --include='*.jsx'` — verify each 2-col grid handles missing items gracefully.
- **Files fixed:** `ProducerDetail.jsx` — ContactButtons refactored to dynamic array with odd-item full-width.

### Pattern 4: Content cut off by BottomNav
- **Bug:** Last content item hidden behind the 56px BottomNav. The body had `pb-16` (64px) which barely cleared the nav, and any sticky bottom bar (WhatsApp CTA) made it worse.
- **Root cause:** `pb-16` (64px) was too tight for the 56px BottomNav + any additional sticky bars.
- **Rule:** Body must have `pb-20` (80px) minimum on mobile (`md:pb-0` on desktop). Pages with sticky bottom bars need their own `pb-20` on the content container.
- **Grep check:** `grep -rn 'pb-16' frontend/ --include='*.jsx' --include='*.js'` — should return 0 matches (all should be `pb-20` or larger).
- **Files fixed:** `layout.js` — `pb-16` → `pb-20`. Map bottom sheet inner div — `pb-4` → `pb-20`.

---

## How to add a new pattern

When you fix a bug, add an entry below pattern 4 following this template:

```markdown
### Pattern N: [short name]
- **Bug:** [what the user saw]
- **Root cause:** [why it happened — the code pattern, not the specific instance]
- **Rule:** [what to do instead — a clear, grep-able instruction]
- **Grep check:** [command to find other instances of the same pattern]
- **Files fixed:** [list of files touched in the fix]
```
