/**
 * Contact tracking helpers for ProducerDetail.
 *
 * Three call patterns extracted from the pre-refactor ProducerDetail.jsx:
 *
 *   1. trackContactClick(producerId, method) — POST to /api/.../contact-click
 *      with optional bearer token. Used by the four sidebar tiles
 *      (phone / instagram / website / email).
 *
 *   2. pingWhatsAppBeacon(producerId) — sendBeacon to .../whatsapp-click.
 *      Called from all three primary-CTA sites (inline, sidebar, sticky bar).
 *
 *   3. markWhatsAppClickedLocal(producerId) — localStorage write that
 *      unlocks the review form. Called from inline + sidebar primary CTA
 *      ONLY. The mobile sticky bar deliberately omits this (see
 *      StickyContactBar.jsx for the TODO).
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
