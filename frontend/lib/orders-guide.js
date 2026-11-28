// @ts-check
/**
 * Module:   orders-guide
 * Purpose:  The address of the «איך מקבלים הזמנות» page (MEH-3981) and the
 *           numbers its copy states, so the page and its entry points share
 *           one place.
 * Does NOT: decide any of these numbers. Each is the backend's, named below;
 *           OrdersGuidePage.test.jsx fails when one drifts.
 * History:  MEH-3981 (creation, 2026-11-27).
 */

export const ORDERS_GUIDE_PATH = "/join/orders";

export const ORDERS_GUIDE_NUMBERS = Object.freeze({
  // backend/app/services/product_order_outbox.py REMIND_BUSINESS_AFTER_HOURS
  remindHours: 4,
  // backend/app/services/product_order_outbox.py ANSWER_HOURS
  answerHours: 24,
  // backend/app/limits.py MAX_STAFF
  maxStaff: 5,
});
