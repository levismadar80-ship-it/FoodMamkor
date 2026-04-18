# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #159 (feature/meh-62-security-deps) — MERGED to staging
                 #160 (feature/meh-63-critical-correctness) — MERGED to staging
                 #161 (feature/meh-64-rate-limits) — MERGED to staging
                 #162 (feature/meh-65-polish) — MERGED to staging
Summary:
  Bug-hunt audit cycle complete (4 PRs shipped):
  PR #159 (PR-A security): python-jose 3.3.0→3.4.0 (CVE-2024-33663/33664),
    python-multipart 0.0.9→0.0.18 (CVE-2024-53981), next 14.2.15→14.2.35
    (CVE-2025-29927 middleware bypass).
  PR #160 (PR-B correctness): admin/settings .catch()+error state;
    producer_me PUT field allowlist (strips admin_notes/is_verified/
    is_recommended/status); normalizePhone adds ^972[5-9]\d{8}$ validation;
    MapClient uses normalizePhone() instead of raw .replace(/\D/g, "").
  PR #161 (PR-C rate limits): 10 endpoints — GET /producers (120/min),
    GET /producers/{id} (120/min), GET /auth/me (60/min), DELETE /auth/me
    (3/hr), POST /producers/{id}/report (5/hr), PUT /producers/me (30/hr),
    POST /producers/me/availability (20/hr), POST /home-products/{id}/
    whatsapp-click (10/min), POST /upload/image (20/hr), POST /recipes (10/hr).
  PR #162 (PR-D polish): phone added to ProducerListOut (unblocks map WA
    buttons); register/producer form uses ps-*/pe-* logical properties;
    print() → logger.debug/info/warning in auth.py + admin.py (22 calls).

## Current state
Branch: staging (clean, all PRs squash-merged)
Staging HEAD: 7f67964

## Next task
Audit cycle complete. Candidate next tasks (confirm with user):
  - ProducerCard heart/favorite Phase C (post-login replay — known issue below)
  - Contact-click analytics endpoint
  - Lightbox for gallery images
  - Events section on producer detail page (feature/meh-XX-producer-events slot)
  - availability_return_date schema change (v2 backend)
  - Linear MEH-62/63/64/65 naming conflict cleanup: our branch names reused
    Linear issue numbers that were already assigned to CLAUDE.md rule docs.
    Linkback bot auto-linked PRs to wrong issues. Low priority.

First step: confirm which task → git checkout staging → git pull → git checkout -b feature/[description]

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
| Onboarding: module singleton, no Context | Simpler than wrapping layout in a Provider | April 2026 |

## Open PRs
None.

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — partially done in PR #162
  (register/producer only); register/page.js + other forms still TBD
- ProducerCard heart/favorite — Phase C not yet implemented (post-login replay)
- git worktree + signing server: /tmp worktrees can't sign commits; must apply
  patch in main repo. Workaround: save diff, remove worktree, checkout branch
  in main repo, apply patch, commit.
- Map WhatsApp CTA: phone now in ProducerListOut (PR #162) so buttons can
  surface, but old producer records without phone still skip the button.
  Verify in production after staging redeploy.
- Linear bot naming conflict: MEH-62/63/64/65 in Linear are CLAUDE.md rule
  docs, not these PRs. Linkback is cosmetic only, no impact.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
