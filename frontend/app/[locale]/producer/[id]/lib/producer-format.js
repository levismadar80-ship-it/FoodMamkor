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
 * MEH-1121 (MEH-1074 Task D): the renderable image list for the gallery.
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

// MEH-1334 chunk 3: getVacationReturnLabel (the vacation banner's sentence
// builder, MEH-76) was deleted with the banner — it duplicated the return
// date now owned by the meta status ("one home per fact"). The date's single
// source is getVacationReturnDate below.

// MEH-1334: bare return date for the header's 3-state status line
// ("בחופשה · חוזרים ב־{date}"). Local-date parse (not UTC) +
// FSI…PDI isolation so the date never reorders in RTL; null when no
// vacation_until → caller falls back to the date-less status string.
export function getVacationReturnDate(producer, locale) {
  if (!producer.vacation_until) return null;
  try {
    const [y, m, d] = producer.vacation_until.split("-").map(Number);
    const date = new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "long" });
    return `\u2068${date}\u2069`;
  } catch {
    return null;
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
