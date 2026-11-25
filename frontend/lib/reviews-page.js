// @ts-check

/**
 * Module:   reviews-page
 * Purpose:  One read of a business's reviews page 1 shared by the two parts of
 *           the business page that need it: the quote under the header
 *           (ReviewExcerpt) and the reviews list (ReviewsSection).
 * Touches:  GET /producers/{id}/reviews?page=1.
 * Does NOT: cache an answer. The entry is dropped once the read settles, so
 *           it only joins the two callers of the same first render, and a
 *           later read (another visit, «הצג עוד») goes to the server.
 * History:  MEH-3836 (creation): the list read its page 1 only once it was
 *           scrolled into view, and the rows then pushed the write-a-review
 *           line and the delivery section down under the reader's eyes
 *           (CLS 0.12 on a phone, MEH-3809 guard).
 */

import api from "@/lib/api";

/** @type {Map<string, Promise<any>>} */
const inFlight = new Map();

/**
 * Page 1 of the business's reviews, joined to a read already in flight.
 * @param {string | number} producerId
 * @returns {Promise<any>} the response body
 */
export function readFirstReviewsPage(producerId) {
  const key = String(producerId);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const read = api
    .get(`/producers/${producerId}/reviews`, { params: { page: 1 } })
    .then((r) => r.data)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, read);
  return read;
}

/** Tests only: drop reads a test left hanging, so the next test reads afresh. */
export function forgetReviewsReads() {
  inFlight.clear();
}
