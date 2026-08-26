/**
 * Analytics beacons for any /producer surface.
 *
 * MEH-2159: the module is no longer contact-only. It also carries
 * trackProducerView, the PAGE-VIEW beacon — see call pattern 4 below. The
 * name `contact-tracking.js` is kept because every import site would
 * otherwise churn for no behavioural gain; this paragraph is the pointer.
 *
 * Originally introduced under app/producer/[id]/lib/contact-tracking.js
 * during MEH-407 Phase 2 PR2 (ProducerDetail split). Promoted to the
 * shared frontend/lib/ in MEH-407 Phase 2 PR3 so the /map surface can
 * call pingWhatsAppBeacon from DesktopMiniPopup + the mobile-sheet
 * pinned-card without a route-cross-route import.
 *
 * Three call patterns currently consume this module:
 *
 *   1. trackContactClick(producerId, method) — POST to /api/.../contact-click
 *      with optional bearer token. Used by the four ContactSidebar tiles
 *      (phone / instagram / website / email).
 *
 *   2. pingWhatsAppBeacon(producerId) — POST to .../whatsapp-click. When a
 *      bearer token is present it uses fetch(keepalive:true) with the
 *      Authorization header so the click is attributed to the logged-in user
 *      (MEH-1426); with no token it falls back to sendBeacon (anonymous click,
 *      user_id=NULL). Called from the primary-CTA sites: ProducerDetail inline
 *      + sidebar (ContactCard) and the mobile sticky bar. (The /map
 *      DesktopMiniPopup was retired in MEH-1010 — no map WhatsApp CTA exists.)
 *
 *   3. markWhatsAppClickedLocal(producerId) — localStorage write that
 *      unlocks the review form. Called from ProducerDetail's inline +
 *      sidebar primary CTA, and (MEH-1886) from every WhatsApp deep-link in
 *      WhatsAppQuestionChips — a chat opened from a question chip is a real
 *      conversation, and a composed question is a stronger signal than a bare
 *      click. The in-page ANSWER disclosures in that component fire neither
 *      helper: nothing was opened. The mobile sticky bar AND the /map WhatsApp
 *      sites still deliberately omit this — see StickyContactBar.jsx and
 *      DesktopMiniPopup.jsx for the matching TODOs.
 *
 *   4. trackProducerView(producerId, referrer) — POST to .../view, one per
 *      page load, fired from useProducerData. MEH-2159 moved view counting
 *      off GET /producers/{id}: as a side effect of a read it depended on
 *      which endpoint happened to be called, so /{slug} counted nothing,
 *      /producer/{uuid} counted twice (SSR + client), and the SSR row
 *      carried no Authorization header so the owner's own visit slipped
 *      past is_internal_viewer. A browser beacon is one event per load, on
 *      both routes, always carrying the token when there is one.
 *
 * All helpers are fail-soft — every external surface is wrapped so a
 * failed beacon, fetch, or storage write cannot break the user flow.
 */

export function trackContactClick(producerId, method) {
  if (!producerId) return;
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    fetch(`/api/producers/${producerId}/contact-click`, {
      method: "POST",
      headers,
      body: JSON.stringify({ method }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // tracking is best-effort
  }
}

export function pingWhatsAppBeacon(producerId, city = null) {
  if (!producerId) return;
  // MEH-1677: `city` is sent ONLY by CoverageRequestCta. When present the call
  // must carry a JSON body, and navigator.sendBeacon cannot set
  // Content-Type: application/json (it sends text/plain, which FastAPI rejects
  // with 422) -- so a city forces the fetch(keepalive) path even when there is
  // no token. Ordinary WhatsApp clicks pass no city and keep their existing
  // behaviour byte for byte, which is why the parameter defaults to null
  // rather than to "".
  const coverageCity = typeof city === "string" && city.trim() ? city.trim() : null;
  // MEH-1426: sendBeacon cannot attach an Authorization header, so a logged-in
  // click landed with user_id=NULL and could never satisfy the reviews WA-gate
  // (reviews.py guard 3). When a token is present, POST via fetch(keepalive:true)
  // — same pattern as trackContactClick above — so the click is attributed to the
  // user AND survives the wa.me navigation. The whatsapp-click endpoint takes no
  // body (producer_id is the path param), so none is sent.
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  if (token || coverageCity) {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (coverageCity) headers["Content-Type"] = "application/json";
    try {
      fetch(`/api/producers/${producerId}/whatsapp-click`, {
        method: "POST",
        headers,
        ...(coverageCity ? { body: JSON.stringify({ city: coverageCity }) } : {}),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // tracking is best-effort
    }
    return;
  }
  // Anonymous fallback — no token to attach, so sendBeacon is fine (user_id stays
  // NULL, a legitimate anonymous click).
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(`/api/producers/${producerId}/whatsapp-click`);
    } catch {
      // tracking is best-effort
    }
  }
}

export function markWhatsAppClickedLocal(producerId) {
  try {
    localStorage.setItem(`wa_clicked_${producerId}`, "1");
  } catch {
    // private mode / quota — review-form unlock is best-effort
  }
}

export function trackProducerView(producerId, referrer) {
  if (!producerId) return;
  // Always fetch(keepalive) rather than sendBeacon, even anonymously — unlike
  // whatsapp-click this endpoint takes a JSON body, and sendBeacon cannot set
  // Content-Type: application/json (it sends text/plain, which FastAPI rejects
  // with 422). keepalive gives the same survives-navigation guarantee.
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    fetch(`/api/producers/${producerId}/view`, {
      method: "POST",
      headers,
      body: JSON.stringify({ referrer: referrer || null }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // tracking is best-effort — a failed view beacon is invisible to the
    // visitor and must not reach Sentry as an error.
  }
}
