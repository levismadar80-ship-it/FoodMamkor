/**
 * Contact tracking helpers for any /producer surface.
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
 *      sidebar primary CTA ONLY. The mobile sticky bar AND the /map
 *      WhatsApp sites deliberately omit this — see StickyContactBar.jsx
 *      and DesktopMiniPopup.jsx for the matching TODOs.
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

export function pingWhatsAppBeacon(producerId) {
  if (!producerId) return;
  // MEH-1426: sendBeacon cannot attach an Authorization header, so a logged-in
  // click landed with user_id=NULL and could never satisfy the reviews WA-gate
  // (reviews.py guard 3). When a token is present, POST via fetch(keepalive:true)
  // — same pattern as trackContactClick above — so the click is attributed to the
  // user AND survives the wa.me navigation. The whatsapp-click endpoint takes no
  // body (producer_id is the path param), so none is sent.
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    try {
      fetch(`/api/producers/${producerId}/whatsapp-click`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
