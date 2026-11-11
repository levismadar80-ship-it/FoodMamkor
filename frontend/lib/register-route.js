/**
 * Module:   register-route
 * Purpose:  The ONE predicate for "is this pathname inside the registration
 *           flow", shared by every surface that has to stay out of its way.
 * Does NOT: decide what to do about it — each consumer owns its own gate.
 * Related:  components/BottomNav.jsx (render gate + the
 *           --bottom-nav-clearance publish), components/InstallPrompt.jsx
 * History:  MEH-2927 (pilot B3b/B3c — extracted from two byte-identical
 *           copies after an adversarial reviewer named them as one fact with
 *           two owners, workflow.md Smell #1).
 */

/**
 * MEH-2927: exact equality plus a trailing slash, never a bare `startsWith`.
 * A bare prefix test would also swallow a future `/registerx` route, which is
 * the trap the sibling `/producer/dashboardx/foo` control in
 * __tests__/BottomNav.test.jsx exists to catch.
 *
 * The pathname comes from `@/i18n/navigation` (next-intl's createNavigation),
 * which strips the locale prefix — so `/he/register` and `/en/register` both
 * arrive here as `/register`.
 *
 * @param {string|null|undefined} pathname
 * @returns {boolean}
 */
export function isRegisterRoute(pathname) {
  return pathname === "/register" || (pathname || "").startsWith("/register/");
}
