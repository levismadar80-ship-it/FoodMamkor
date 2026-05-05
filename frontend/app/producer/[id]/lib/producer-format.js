/**
 * Display-format helpers for ProducerDetail.
 *
 * Pure functions — no React, no module-level state. Extracted verbatim
 * from ProducerDetail.jsx:176-213. Callers must guarantee a non-null
 * `producer` argument (matches the pre-refactor IIFE behavior, which
 * ran after the null-check at ProducerDetail.jsx:168-174).
 */

export function buildShareUrl(producer) {
  if (typeof window === "undefined") return "";
  const path = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  return `${window.location.origin}${path}`;
}

export function getVacationReturnLabel(producer) {
  if (!producer.vacation_until) return "חוזרת בקרוב";
  try {
    // Parse as local date (not UTC) to avoid off-by-one in UTC+2/+3 (Israel).
    const [y, m, d] = producer.vacation_until.split("-").map(Number);
    return "חוזרת ב-" + new Date(y, m - 1, d).toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  } catch {
    return "חוזרת בקרוב";
  }
}

export function getProducerInitials(producer) {
  const words = (producer.name || "").trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? words[0][0] + words[1][0] : words[0]?.slice(0, 2) ?? "מ";
}

export function buildShowOnMapHandler(producer, router) {
  return () => {
    try {
      sessionStorage.setItem(
        "focusProducer",
        JSON.stringify({
          id: producer.id,
          lat: producer.lat,
          lng: producer.lng,
          name: producer.name,
        }),
      );
    } catch {
      // private mode — map will still open, just without highlight
    }
    router.push("/map");
  };
}
