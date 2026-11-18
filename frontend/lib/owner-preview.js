// @ts-check
/**
 * Module:   owner-preview
 * Purpose:  One rule for "an owner or admin is opening an item that may not
 *           be public yet" (MEH-2977 follow-up). The detail pages' server
 *           fetch is anonymous, so a pending or hidden item reads as missing
 *           there; with ?preview=1 (or the after-create ?pending=1) the page
 *           and the middleware let the browser ask again with the user's own
 *           token instead of answering 404. The backend still decides who may
 *           see it — this only stops the frontend from refusing to ask.
 * Does NOT: grant access, or change anything for a URL without the flag
 *           (public URLs keep their real 404).
 * Related:  middleware.js (ENTITY_404_SEGMENTS check), app/[locale]/
 *           experiences/[id]/page.js, app/[locale]/group-buys/[id]/page.js.
 * History:  created 14/11/2026 (workshop-404 bug, found reviewing PR #4553).
 */

/** @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params */
export function isOwnerPreview(params) {
  if (!params) return false;
  const get = (/** @type {string} */ k) =>
    typeof params.get === "function"
      ? /** @type {URLSearchParams} */ (params).get(k)
      : /** @type {Record<string, any>} */ (params)[k];
  return get("preview") === "1" || get("pending") === "1";
}
