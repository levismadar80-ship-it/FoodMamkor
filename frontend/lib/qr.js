import { SITE_URL } from "./seo";

/**
 * Module:   qr
 * Purpose:  One owner for the URL a printed business QR code points at, and
 *           for the render options every QR surface uses.
 * Touches:  nothing — pure string/object builders. The `qrcode` package is
 *           called by the consumers, not here, so this file stays importable
 *           from a server component and from a test with no DOM.
 * Does NOT: render a QR code, download anything, or count scans. Scan counting
 *           is explicitly out of scope (MEH-2785 over-engineering guard) and
 *           would be a backend + analytics change.
 * Related:  components/producer/BusinessQrCard.jsx (the dashboard card);
 *           app/[locale]/producer/dashboard/qr-card/page.js (the A6 print
 *           card); lib/seo.js:33 (SITE_URL re-export).
 * History:  MEH-2785 (creation)
 */

// A printed QR code is permanent, so its target must be too.
//
// DO NOT point this at `/{slug}` or `/p/{slug}` — the admin can change a slug
// (backend/app/routers/admin.py), and nothing redirects an old one, so every
// card already taped to a till would go dead. `/producer/{id}` is the id route
// and the id never changes. This is our stand-in for the "dynamic QR" the
// industry uses to keep a printed code's destination editable.
//
// A camera scan arrives with no referrer, so the UTM pair is the only way the
// visit is attributable. Lower-case, matching the convention at lib/utils.js.
export const QR_UTM = "utm_source=qr&utm_medium=print";

/**
 * The absolute URL a business's printed QR code opens.
 *
 * @param {{id: string}} producer
 * @returns {string|null} null when there is no id to point at.
 */
export function buildBusinessQrUrl(producer) {
  if (!producer?.id) return null;
  return `${SITE_URL}/producer/${producer.id}?${QR_UTM}`;
}

// Print legibility, from the MEH-2785 research:
//   - errorCorrectionLevel "M": recovers ~15% damage, the usual print default.
//   - margin 4: the quiet zone, in modules. Four per side is the spec minimum;
//     nothing may be drawn inside it, so the print card puts no border or text
//     against the code.
//   - dark #2e6853 on light #FFFFFF: measured 6.52:1, above the 4:1 a scanner
//     needs. No gradient, no inverted colours, no logo in the middle — each of
//     those costs scan reliability for decoration.
export const QR_RENDER_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  color: { dark: "#2e6853", light: "#FFFFFF" },
};

/** The file name a downloaded code gets, per extension. */
export function qrFileName(producer, ext) {
  return `mehamakor-qr-${producer?.id ?? "business"}.${ext}`;
}
