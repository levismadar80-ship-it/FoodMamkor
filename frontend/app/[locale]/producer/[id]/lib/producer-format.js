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

/**
 * MEH-1122 (MEH-1074 Task D): the renderable image list for the gallery.
 *
 * A producer whose `images` array holds only blank/whitespace entries (`[""]`,
 * `[null]`, `["  "]`) is effectively imageless — but `images.length` counted
 * them as 1, so ImageGallery rendered a broken single-photo banner AND
 * ProducerHeader kept its own gray <h1> (the ZFFS symptom) instead of the
 * MEH-815 Tinted Masthead. Deriving BOTH `hasImages` and the gallery prop from
 * this single filtered list keeps the two in agreement (one owner — no
 * ImageGallery-vs-ProducerDetail "is imageless?" drift, MEH-271 Smell #1) so
 * every genuinely-imageless approved producer gets the masthead.
 */
export function getRenderableImages(images) {
  if (!Array.isArray(images)) return [];
  return images.filter((src) => typeof src === "string" && src.trim() !== "");
}

// MEH-76 chunk 1: label moved to i18n (producer.detail.header.vacation_back*) —
// the hardcoded Hebrew here rendered on /en too. Callers pass next-intl's
// t + locale. The date is wrapped FSI…PDI (⁨…⁩, the string-level
// <bdi>) so it never reorders inside the surrounding RTL sentence.
export function getVacationReturnLabel(producer, t, locale) {
  if (!producer.vacation_until) return t("producer.detail.header.vacation_back_soon");
  try {
    // Parse as local date (not UTC) to avoid off-by-one in UTC+2/+3 (Israel).
    const [y, m, d] = producer.vacation_until.split("-").map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "long" });
    return t("producer.detail.header.vacation_back", { date: `\u2068${date}\u2069` });
  } catch {
    return t("producer.detail.header.vacation_back_soon");
  }
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
