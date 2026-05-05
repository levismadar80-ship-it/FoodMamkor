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
 *   2. pingWhatsAppBeacon(producerId) — sendBeacon to .../whatsapp-click.
 *      Called from primary-CTA sites: ProducerDetail inline + sidebar +
 *      sticky bar; /map DesktopMiniPopup + mobile-sheet pinned card.
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
