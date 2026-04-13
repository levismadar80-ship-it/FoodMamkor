# מהמקור — Known Bug Patterns

> Every time a bug is found and fixed, Claude must: (1) identify the root cause pattern, (2) search the entire codebase for the same pattern, (3) fix ALL instances in the same PR, (4) add an entry here. See CLAUDE.md rule 14.

---

### Pattern 1: RTL icon positioning
- **Bug:** Password eye toggle appeared on the LEFT side of input fields. In RTL Hebrew layout, positioned elements inside inputs should be on the RIGHT (leading/start) side.
- **Root cause:** Used `left-3` (physical left) instead of `right-3` for the eye icon.
- **Rule:** In RTL context, use `right-3` for icons inside inputs. For LTR-only contexts (badges on images), `left-3` is fine.
- **Grep check:** `grep -rn 'absolute.*left-3' frontend/app --include='*.jsx'` — verify each hit is intentional.
- **Files fixed:** `login/page.js`, `register/page.js` — eye toggle `left-3` → `right-3`, input padding `pl-11` → `pr-11`.

### Pattern 2: Empty optional fields showing blank space
- **Bug:** When optional data (website, phone, category) was null/undefined, empty containers still rendered with margin/padding — visible as blank vertical space.
- **Root cause:** Wrapping `<div>` rendered unconditionally even when all children were conditional.
- **Rule:** ALWAYS wrap container divs in a conditional: `{(a || b || c) && <div>...</div>}`.
- **Grep check:** `grep -rn 'flex flex-wrap.*gap\|flex flex-wrap.*mb' frontend/components --include='*.jsx'`
- **Files fixed:** `ProducerCard.jsx`, `HomeProductCard.jsx`, `EventCard.jsx`, `ExperienceCard.jsx`.

### Pattern 3: Grid with hardcoded optional positions
- **Bug:** 2-column grid left empty cell when optional item was missing.
- **Root cause:** Grid positions hardcoded: "row 1 = phone + instagram, row 2 = website + copy-link".
- **Rule:** Build dynamic array of available items, then render. Last odd item goes full-width.
- **Grep check:** `grep -rn 'grid-cols-2' frontend/app --include='*.jsx'` — verify each handles missing items.
- **Files fixed:** `ProducerDetail.jsx` — ContactButtons refactored to dynamic array.

### Pattern 4: Content cut off by BottomNav
- **Bug:** Last content item hidden behind the 56px BottomNav.
- **Root cause:** Body `pb-16` (64px) was barely enough; any sticky bar made it worse.
- **Rule:** Body must have `pb-20` (80px) minimum on mobile. Pages with sticky bars need their own `pb-20`.
- **Grep check:** `grep -rn 'pb-16' frontend/ --include='*.jsx' --include='*.js'` — should return 0 matches.
- **Files fixed:** `layout.js` — `pb-16` → `pb-20`.

### Pattern 5: Responsive visibility inconsistency
- **Bug:** ChatWidget was `hidden md:flex` — visible on desktop but invisible on mobile. Users on phones couldn't access the help bot.
- **Root cause:** Original spec said "desktop only" for MVP, but this was never revisited after mobile became the primary target.
- **Rule:** Always test components on BOTH mobile AND desktop before closing a PR. Use `grep -r 'hidden md:\|md:hidden' frontend/components --include='*.jsx'` to audit visibility classes — each must be intentional (Header desktop nav = intentional, ChatWidget = bug).
- **Grep check:** `grep -rn 'hidden md:flex\|hidden lg:flex' frontend/components --include='*.jsx'` — verify each is intentional.
- **Files fixed:** `ChatWidget.jsx` — `hidden md:flex` → `flex` on both launcher and panel, with responsive positioning (bottom-20 on mobile to clear BottomNav, bottom-6 on desktop).

---

## How to add a new pattern

When you fix a bug, add an entry following this template:

```markdown
### Pattern N: [short name]
- **Bug:** [what the user saw]
- **Root cause:** [why it happened]
- **Rule:** [what to do instead]
- **Grep check:** [command to find other instances]
- **Files fixed:** [list of files]
```
