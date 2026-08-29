/**
 * Module:   social-links
 * Purpose:  ONE definition of "turn a stored instagram field into a link".
 * Does NOT: re-implement the server's normalizer. `_normalize_instagram`
 *           (backend/app/schemas/schemas.py:259) is the single normalizer and
 *           stays that way — it strips `@`, a full instagram.com URL prefix,
 *           query/# tails and slashes, and STORES A BARE HANDLE. What lives
 *           here is the render-time inverse: the bare handle has to be turned
 *           back into an absolute URL before it can be an `href`.
 * Related:  MEH-1616 (the "@"-only legacy guard this generalises),
 *           MEH-2174 (the bug that made it shared).
 * History:  MEH-2174 — extracted from three copies that had drifted apart in
 *           shape but not in behaviour: admin/outreach/page.jsx:52 (module-
 *           local, not exported), producer/[id]/components/ContactCard.jsx:107
 *           (inline in a channel table) and lib/contact-method.js:65 (inline in
 *           a switch). A fourth copy was about to be written for
 *           ReviewEvidence.jsx; this is that copy, exported once instead.
 *
 * ## Why the `@` strip stays even though the server already did it
 *
 * Rows written before MEH-1616 can still carry a leading `@`, and composing
 * `https://instagram.com/@handle` links to nothing. Legacy rows in FULL URL
 * form ("https://instagram.com/x") are still out of scope here, exactly as the
 * MEH-1616 note said: porting the server's URL regex into JS would be a second
 * implementation of one rule, and the backfill decision is MEH-1616's to make.
 */

/** The bare handle, with any leading `@`s removed. `""` when there is none. */
export function instagramHandle(raw) {
  return (raw || "").trim().replace(/^@+/, "");
}

/** Absolute profile URL, or `null` when there is no handle to link to. */
export function instagramUrl(raw) {
  const handle = instagramHandle(raw);
  return handle ? `https://instagram.com/${handle}` : null;
}
