/**
 * Module:   rescue
 * Purpose:  The one place the rescue-bags pilot's flag, its fetches and its
 *           unit formatting live, so no component re-derives any of them.
 * Does NOT: render anything, and does NOT hold copy — every user-visible
 *           string is a `rescue.*` key in messages/he.json.
 * Related:  lib/generated/api.zod.js (the response schemas, generated from
 *           backend/openapi.json in MEH-2646 — never hand-written here),
 *           backend/app/routers/rescue.py (the endpoints)
 * History:  MEH-2648 (creation, chunk 4/4 of the rescue-bags pilot MEH-2643)
 */

import api from "@/lib/api";
import {
  CancelOrderRescueOrdersOrderIdCancelPostResponse,
  CreateOrderRescueOrdersPostResponse,
  CreateReviewRescueOrdersOrderIdReviewPostResponse,
  ListMyReservationsRescueOrdersMineGetResponse,
  ListOffersRescueOffersGetResponse,
} from "@/lib/generated/api.zod";

/**
 * Whether the pilot is on for this build.
 *
 * `NEXT_PUBLIC_*` is inlined by Next at BUILD time, so this is a constant in
 * the bundle rather than a runtime lookup — which is why flipping the flag
 * needs a redeploy, not a restart. The backend has its own
 * `RESCUE_BAGS_ENABLED`; both are set together or the UI offers a bag the API
 * refuses with a 404.
 *
 * The comparison is against the string "true" on purpose: every value in
 * `process.env` is a string, so a bare truthiness check treats "false" as on.
 */
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;

export function rescueBagsEnabled() {
  return process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED === "true";
}

/** Walking minutes, the way the spec defines them: haversine × 1.3 at 5 km/h. */
export function walkingMinutes(distanceKm) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  return Math.max(1, Math.round(((distanceKm * 1.3) / 5) * 60));
}

/** Agorot → whole shekels. Prices in the pilot are whole-shekel by construction. */
export function shekels(agorot) {
  if (typeof agorot !== "number" || !Number.isFinite(agorot)) return null;
  return Math.round(agorot / 100);
}

/**
 * HH:MM in Asia/Jerusalem.
 *
 * NOT `toLocaleTimeString` with no zone: the browser's zone is the visitor's,
 * and a pickup window is a fact about a shop in Israel. `lib/orderWindow.js`
 * owns the same primitive for store hours (israel-clock-guard, MEH-1988) —
 * this formats an instant rather than deriving "open now", so it reads the
 * zone directly instead of reaching into that module's day logic.
 */
export function israelTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  }).format(d);
}

/**
 * Thrown when the server answered but the payload did not match the schema.
 *
 * It exists so a schema drift cannot masquerade as "no bags today". Returning
 * [] on a parse failure — which this module did first — renders the same empty
 * shelf as a genuinely quiet evening, with nothing in any log: the caller can
 * never tell the two apart, and neither can anyone reading a bug report.
 */
export class RescueShapeError extends Error {
  constructor(issues) {
    super("rescue:unparsable-offers");
    this.name = "RescueShapeError";
    this.issues = issues;
  }
}

/**
 * Today's bags.
 *
 * A 404 IS an ordinary answer here and comes back as []: the backend 404s
 * every rescue route while its own flag is off, and the home page must not
 * show an error for a feature that is simply not on yet. Anything else —
 * network, 5xx, or a payload that fails the schema — throws, so the caller
 * shows its own failure state instead of an empty list.
 */
export async function fetchOffers({ city, lat, lng } = {}) {
  const params = {};
  if (city) params.city = city;
  if (typeof lat === "number" && typeof lng === "number") {
    params.lat = lat;
    params.lng = lng;
  }
  let res;
  try {
    res = await api.get("/rescue/offers", { params });
  } catch (err) {
    // The pilot being off server-side is not a fault to report.
    if (err?.response?.status === HTTP_NOT_FOUND) return [];
    throw err;
  }
  // Rule 19: validate before consuming. The schema is generated from the
  // backend's own OpenAPI, so it cannot drift from the server by hand.
  const parsed = ListOffersRescueOffersGetResponse.safeParse(res.data);
  if (!parsed.success) throw new RescueShapeError(parsed.error.issues);
  return parsed.data;
}

/** Reserve. Throws the axios error so the caller can map status → copy. */
export async function reserveBag({ offerId, qty = 1 }) {
  const res = await api.post("/rescue/orders", { offer_id: offerId, qty });
  const parsed = CreateOrderRescueOrdersPostResponse.safeParse(res.data);
  if (!parsed.success) throw new Error("rescue:unparsable-order");
  return parsed.data;
}

/**
 * The signed-in buyer's own reservations on today's bags (MEH-2680).
 *
 * The confirmation used to live only in component state, so a reload lost the
 * pickup code and the review never appeared. The business page reads this
 * back on mount. Call it only with a signed-in user: a guest's 401 would go
 * through the refresh interceptor and end in the "session expired" toast. A
 * 404 (flag off) is an ordinary [] like `fetchOffers`.
 */
export async function fetchMyOrders() {
  let res;
  try {
    res = await api.get("/rescue/orders/mine");
  } catch (err) {
    if (err?.response?.status === HTTP_NOT_FOUND) return [];
    throw err;
  }
  const parsed = ListMyReservationsRescueOrdersMineGetResponse.safeParse(res.data);
  if (!parsed.success) throw new RescueShapeError(parsed.error.issues);
  return parsed.data;
}

export async function cancelOrder(orderId) {
  const res = await api.post(`/rescue/orders/${orderId}/cancel`);
  const parsed = CancelOrderRescueOrdersOrderIdCancelPostResponse.safeParse(res.data);
  if (!parsed.success) throw new Error("rescue:unparsable-order");
  return parsed.data;
}

export async function submitReview(orderId, body) {
  const res = await api.post(`/rescue/orders/${orderId}/review`, body);
  const parsed = CreateReviewRescueOrdersOrderIdReviewPostResponse.safeParse(res.data);
  if (!parsed.success) throw new Error("rescue:unparsable-review");
  return parsed.data;
}

/**
 * Maps a failed reserve to a copy key.
 *
 * Every branch here is a status the backend actually returns
 * (routers/rescue.py): 422 is the two-no-shows block, 409 covers sold out /
 * the two-bag cap / an inactive offer, 401 is a guest, 404 is the flag being
 * off server-side. Anything else falls through to the generic key rather than
 * inventing a diagnosis.
 */
export function reserveErrorKey(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status === HTTP_UNAUTHORIZED) return "errors.sign_in";
  if (status === HTTP_NOT_FOUND) return "errors.gone";
  if (status === HTTP_UNPROCESSABLE) return "errors.blocked";
  if (status === HTTP_CONFLICT) {
    if (typeof detail === "string" && detail.includes("שתי שקיות")) {
      return "errors.max_two";
    }
    return "errors.sold_out";
  }
  return "errors.generic";
}
