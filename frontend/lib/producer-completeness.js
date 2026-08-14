// Single source of truth for the producer-completeness check used by the
// admin producers list. Extracted into its own module so it can be unit
// tested without spinning up React.
//
// Returns the list of missing fields (for the tooltip) and a priority bucket:
//   red    — blocks the producer from working at all (no map / no contact)
//   yellow — visible but incomplete
//   green  — every required field is filled

// MEH-1938 chunk 3: reads through producerPoints() instead of Producer.lat/lng
// directly, so a producer whose only coordinates live in a producer_locations
// row (no Producer.lat/lng) counts as having coords too — that case used to
// read red by mistake. producerPoints() still falls back to Producer.lat/lng
// when there is no usable location row, so today's producers are unaffected.
import { producerPoints } from "./producerPoints.js";

// MEH-831: the canonical Hebrew field labels this heuristic emits in `missing`.
// Single source of truth — ProfileCompletenessCard imports these to build its
// label→slug map instead of mirroring the strings (which would drift silently
// if a label here were renamed). Keyed by the card's slug.
export const COMPLETENESS_FIELDS = {
  city: "עיר",
  coords: "קואורדינטות",
  delivery: "אזורי משלוח",
  contact: "פרטי קשר (טלפון/אינסטגרם)",
  category: "קטגוריה",
  image: "תמונה",
  short_desc: "תיאור קצר",
  hours: "שעות פתיחה",
};

// MEH-1173: the MEH-532 seed description, written at registration from the
// localized i18n value `auth.register.producer.default_description` (he + en,
// RegisterProducerClient.jsx). A description still equal to the seed is a
// placeholder, not a real description — so it counts as MISSING here and in the
// edit-tab summary. Duplicated from messages/{he,en}.json by necessity: this
// module is React-free (unit-tested without next-intl) and cannot call t().
// Keep in sync if the registration default copy changes.
export const DEFAULT_PRODUCER_DESCRIPTIONS = [
  "בית עסק מקומי. עוד פרטים בקרוב.",
  "Local business. More details coming soon.",
];

export function isDefaultDescription(text) {
  return DEFAULT_PRODUCER_DESCRIPTIONS.includes((text || "").trim());
}

export function producerCompleteness(p) {
  const missing = [];
  const isDeliveryOnly = p.has_physical_location === false && p.offers_delivery;
  // MEH-1938 chunk 3: true when the producer has a usable point through
  // either a producer_locations row or the Producer.lat/lng fallback.
  const hasCoords = producerPoints(p).length > 0;

  if (!p.city) missing.push(COMPLETENESS_FIELDS.city);

  // MEH-213: delivery-only producers intentionally have no lat/lng.
  // Flag missing coords only when there IS a physical location.
  if (!isDeliveryOnly && !hasCoords) {
    missing.push(COMPLETENESS_FIELDS.coords);
  }

  // MEH-213: delivery-only — require either nationwide flag or at least one city.
  // MEH-904: cities are derived from the delivery_areas relation (the only
  // path the public POST /producers writer populates — the flat
  // delivery_cities column is empty for any registration-created producer).
  const deliveryCities = [...new Set(
    (p.delivery_areas || []).map((da) => da.city).filter(Boolean),
  )];
  if (isDeliveryOnly && !p.delivery_nationwide && deliveryCities.length === 0) {
    missing.push(COMPLETENESS_FIELDS.delivery);
  }

  const noContact = !p.phone && !p.instagram;
  if (noContact) missing.push(COMPLETENESS_FIELDS.contact);
  if (!p.categories || p.categories.length === 0) missing.push(COMPLETENESS_FIELDS.category);
  if (!p.images || p.images.length === 0) missing.push(COMPLETENESS_FIELDS.image);

  // MEH-1002: short_desc = the public description surface. Both fields render
  // to customers — the tagline (short_description: ProducerCard.jsx:208,
  // ProducerHeader.jsx:81) and the long story (description:
  // ProducerSections.jsx:77) — so either one filled satisfies the check.
  // MEH-1173: the MEH-532 seed description does NOT count — it's a placeholder,
  // so a producer who never wrote a real description still reads as missing.
  // Yellow-tier only: never part of redCondition below.
  const hasRealDescription =
    !!(p.description || "").trim() && !isDefaultDescription(p.description);
  const noDescription = !(p.short_description || "").trim() && !hasRealDescription;
  if (noDescription) missing.push(COMPLETENESS_FIELDS.short_desc);

  // MEH-1884: opening_hours is the visibility currency — it feeds the
  // LocalBusiness JSON-LD `openingHoursSpecification` (lib/seo.js:288-291) and
  // the open-now surfaces — but nothing told the owner it was missing. Counted
  // here so the dashboard completeness card (page.js:338 gate) and the admin
  // tooltip both surface it.
  // Yellow-tier only: never part of redCondition below — a business with no
  // hours is still findable and contactable, which is what red is reserved for.
  // DO NOT add order_window here: it is a per-cycle ordering window, not a
  // standing profile field, so an owner who runs no order cycles would read as
  // permanently incomplete. Deliberately excluded (MEH-1884).
  const noHours = !(p.opening_hours || "").trim();
  if (noHours) missing.push(COMPLETENESS_FIELDS.hours);

  let priority = "green";
  const redCondition = !p.city
    || (!isDeliveryOnly && !hasCoords)
    || noContact;
  if (redCondition) {
    priority = "red";
  } else if (missing.length > 0) {
    priority = "yellow";
  }
  return { missing, priority };
}
