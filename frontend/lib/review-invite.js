/**
 * Module:   review-invite
 * Purpose:  Keep the owner's "request a review" token (`?rt=` on the shared
 *           link) for the producer it was minted for, so ReviewsSection can
 *           unlock the form and forward it as `review_token`.
 * Does NOT: verify the token — the server does (reviews.py
 *           `_invited_by_token`: signature, expiry, scope, producer binding).
 *           A wrong or stale token here only shows a form whose submit 403s,
 *           exactly like the WhatsApp-click gate it stands in for.
 * Related:  components/ReviewsSection.jsx; backend producer_me.py
 *           `GET /producers/me/review-link` (mints the URL).
 * History:  MEH-1428 chunk 2 (MEH-2330).
 *
 * sessionStorage, keyed per producer: the link is opened in a tab, the
 * customer usually has to log in first, and the login round-trip drops the
 * query string — the tab-scoped copy survives it without outliving the tab.
 */

const keyFor = (producerId) => `review_invite_${producerId}`;

/** Store `?rt=` from `search` (a location.search string) for this producer, then return the token on file. */
export function captureReviewInvite(producerId, search) {
  if (!producerId) return null;
  try {
    const rt = new URLSearchParams(search || "").get("rt");
    if (rt) sessionStorage.setItem(keyFor(producerId), rt);
    return sessionStorage.getItem(keyFor(producerId));
  } catch {
    // Storage blocked (private mode / disabled): the gate simply stays closed.
    return null;
  }
}
