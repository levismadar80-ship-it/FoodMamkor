# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #154 (feature/meh-61b-header-search) — MERGED to staging
                 #155 (feature/meh-61c-url-filter-persistence) — MERGED to staging
                 #156 (feature/meh-61d-login-improvements) — MERGED to staging
                 #157 (feature/meh-61e-hero-redesign) — OPEN draft, awaiting review
Summary:
  Wave 3 (MEH-61) fully complete:
  PR #154 (61b): mobile search icon in Header between logo and hamburger;
    "/" keyboard shortcut → /search?focus=1 (guards against active input fields).
  PR #155 (61c): chips state init from URL params on homepage; updateURL
    rebuilt to write all state (category, city, kosher, organic, delivery, verified)
    on every toggle; initial load merges chip params into API call.
  PR #156 (61d): register page — brand mark (Leaf icon), heading "הצטרפי לקהילה",
    value-prop strip (🗺️❤️⭐), OAuth wrapped in guard with "— או —" divider,
    PasswordStrength component, per-field onBlur validation + eye toggle.
  PR #157 (61e): search pill padding aligned to DESIGN.md spec (gap-2.5 px-6 py-3.5);
    aria-label on hero <section> and role="search" container.

## Current state
Branch: feature/meh-61e-hero-redesign (PR #157 open draft)
Staging: clean after PRs #154 #155 #156 merged.

## Next task
MEH-61a — First-visit onboarding tours (deferred, last in Wave 3 priority):
  - useFirstVisit hook (localStorage flag, resets after 7 days)
  - 4 tooltip locations: producers grid, chip filters, map tab, profile tab
  - "x" dismiss + "הבנתי" CTA on each tooltip
  - Stagger: show first tooltip after 2s, each subsequent after user dismisses previous

After #157 is approved → git checkout staging → git pull → git checkout -b feature/meh-61a-onboarding

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| CHIPS_CONFIG replaces HOME_TOGGLE_CHIPS | Single source of truth for chip definitions | April 2026 |
| ProducersClient uses ChipScrollRow (done) | Inline chips swapped for ChipScrollRow | April 2026 |
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |
| Worktree commits must come from main repo | Signing server rejects /tmp worktree paths | April 2026 |
| Sidebar: no "צרי קשר" header | Primary CTA speaks for itself | April 2026 |
| WA share button: gray outlined | Avoids green conflict with primary WA CTA | April 2026 |
| Vacation banner: slate not amber | Neutral unavailable vs warm/sale semantics | April 2026 |
| ParallaxQuote uses Ken Burns (not fixed) | "Fixed feels dated" — deliberate choice | April 2026 |

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| CHIPS_CONFIG replaces HOME_TOGGLE_CHIPS | Single source of truth for chip definitions | April 2026 |
| ProducersClient uses ChipScrollRow (done) | Inline chips swapped for ChipScrollRow | April 2026 |
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |
| Worktree commits must come from main repo | Signing server rejects /tmp worktree paths | April 2026 |
| Sidebar: no "צרי קשר" header | Primary CTA speaks for itself | April 2026 |
| WA share button: gray outlined | Avoids green conflict with primary WA CTA | April 2026 |
| Vacation banner: slate not amber | Neutral unavailable vs warm/sale semantics | April 2026 |

## Open PRs
None currently open.

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- ProducerCard heart/favorite — Phase C not yet implemented
- git worktree + signing server: /tmp worktrees can't sign commits; must apply
  patch in main repo. Workaround: save diff, remove worktree, checkout branch
  in main repo, apply patch, commit.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
