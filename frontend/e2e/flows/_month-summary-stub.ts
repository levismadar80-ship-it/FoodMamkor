/**
 * Module:   _month-summary-stub
 * Purpose:  The body a fake-token spec answers GET /producers/me/billing/summary
 *           with: a month with nothing in it. The dashboard home's monthly line
 *           (components/producer/MonthValueLine.jsx, MEH-3194) reads it for an
 *           approved business; shaped like the generated
 *           MyBillingSummaryProducersMeBillingSummaryGetResponse so it parses.
 */
export const MONTH_SUMMARY_ZERO = {
  month: "2026-11",
  phase: "launch",
  bookings: 0,
  value_agorot: 0,
  by_kind: [],
  threshold_agorot: 300000,
  over_threshold: false,
  fee_without_subscription_agorot: 0,
  fee_with_subscription_agorot: 0,
  charged_agorot: 0,
  price_list_version: 1,
};
