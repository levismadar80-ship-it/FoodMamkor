# docs/archive — historical session specs

These files are session-specific specs that have been **fully implemented**
on `main`. They are preserved as a historical record of *what was specified*
and *why* — useful when archaeology is needed (e.g. "why does
`MapClient.jsx` use a `committedBounds` instead of filtering against
`mapBounds`?"), but they are **not active reference**.

For active reference (what the project is today), see [`../FEATURES.md`](../FEATURES.md)
and the canonical docs in [`../`](../).

| File | What it specs |
|---|---|
| [ALL_PAGES_DESIGN.md](./ALL_PAGES_DESIGN.md) | First end-to-end pass redesigning every page (producer detail, 404, /terms, admin shell). |
| [COPY_FIXES.md](./COPY_FIXES.md) | Rewrite of UI copy from masculine "יצרן" to feminine "בית עסק / בעלת עסק" + the founder story rewrite. |
| [DESIGN_UPDATE.md](./DESIGN_UPDATE.md) | First major design refresh to the warm-cream/forest-green farmers-market aesthetic. |
| [FEEDBACK_FIXES.md](./FEEDBACK_FIXES.md) | Round of feedback-driven fixes: login, /about story, founder card, follow-button feature. |
| [FINAL_AUDIT.md](./FINAL_AUDIT.md) | Pre-launch audit checklist — OG tags, favicons, ImageWithFallback, skeletons, WhatsApp share, Clarity, Sentry, Cloudinary, section spacing. |
| [FIXES_V2.md](./FIXES_V2.md) | Six fixes: city autocomplete everywhere, expanded home-product fields, reviews, validation, login OAuth order, cookie banner, private street/zip. |
| [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | Week-by-week pre-launch plan: SEO/perf (week 1), trust signals (week 2), UX polish (week 3), verification (week 4). |
| [MAP_IMPROVEMENTS.md](./MAP_IMPROVEMENTS.md) | 10 map improvements (search-this-area, near-me, hover sync, clustering, category markers, popups, mobile sheet, legend filter, empty state) + the "arker" bug fix. Plus a second pass with bug fixes 13 and 14. |
| [NEW_CHAT_OPENER.md](./NEW_CHAT_OPENER.md) | Notes on opening a fresh Claude Code session — context the model needs early. |
| [PLAN.md](./PLAN.md) | Original v1 plan from before MVP. |
| [PREMIUM_DESIGN.md](./PREMIUM_DESIGN.md) | Six premium touches: hand-drawn line-art icons, Ken Burns parallax, marquee strip, AnimatedCounter, custom cursor, Unsplash imagery. |
| [TASKS.md](./TASKS.md) | Originally the v1 task tracker. |
| [UX_FIXES.md](./UX_FIXES.md) | Six UX polish items: "show on map" focus, nav including events, breadcrumbs/toasts/skeletons, footer sitemap, motion, /about polish. |
| [WORLD_CLASS_V2.md](./WORLD_CLASS_V2.md) | Header scroll-blur + smooth-scroll (Lenis) + Phosphor icon swap. |

## Rules for this folder

- **Read-only.** Don't edit these files — they're a record of what was, not
  what is. If you find something wrong, fix the *current* code and add a
  note in [`../CHANGELOG.md`](../CHANGELOG.md), don't backdate the spec.
- **Don't add new files here** unless they document a discrete completed
  session pass that has clear historical value. The default destination for
  new docs is the canonical [`../`](../) directory.
- **OK to delete** if you're confident the historical context is useless —
  but think twice. Disk is cheap; context is not.
