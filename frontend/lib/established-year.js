/**
 * Module:   established-year
 * Purpose:  Shared client-side bounds for the producer "שנת הקמה"
 *           (established_year) number input, so the field's min/max mirror the
 *           server validator (backend schemas.py `_validate_established_year`:
 *           1800 ≤ year ≤ israel_today().year) instead of drifting.
 * Does NOT: validate or enforce — the server is the source of truth and returns
 *           a Hebrew 422 on violation; this only sets the input's min/max hint.
 *           Numbers only, no i18n.
 * Related:  frontend/components/admin/ProducerForm.jsx,
 *           frontend/app/[locale]/producer/dashboard/edit/cards.jsx,
 *           backend/app/schemas/schemas.py (_validate_established_year),
 *           frontend/lib/friday-mode.js (same Intl Asia/Jerusalem pattern).
 * History:  MEH-1581 (creation — closes the client/server tz-parity gap flagged
 *           on MEH-1541: browser-local new Date().getFullYear() diverges ±1
 *           from the server's Israel-tz year at the New-Year boundary).
 */

// Server floor (schemas.py: `v < 1800`). Shared so the literal isn't retyped
// in each form file (MEH-1393 client↔server-constant-drift family).
export const MIN_ESTABLISHED_YEAR = 1800;

/**
 * The current calendar year in Asia/Jerusalem — parity with the server's
 * `israel_today().year`, independent of the browser's own timezone (a user in
 * UTC-5 on 31 Dec is still in the *previous* year while Israel has rolled over).
 * @returns {number}
 */
export function currentIsraelYear() {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
      }).format(new Date()),
    );
  } catch {
    // Intl / timeZone data unavailable → best-effort browser year.
    return new Date().getFullYear();
  }
}
