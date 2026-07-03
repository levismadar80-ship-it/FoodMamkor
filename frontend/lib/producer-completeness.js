// Single source of truth for the producer-completeness check used by the
// admin producers list. Extracted into its own module so it can be unit
// tested without spinning up React.
//
// Returns the list of missing fields (for the tooltip) and a priority bucket:
//   red    — blocks the producer from working at all (no map / no contact)
//   yellow — visible but incomplete
//   green  — every required field is filled

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
};

export function producerCompleteness(p) {
  const missing = [];
  const isDeliveryOnly = p.has_physical_location === false && p.offers_delivery;

  if (!p.city) missing.push(COMPLETENESS_FIELDS.city);

  // MEH-213: delivery-only producers intentionally have no lat/lng.
  // Flag missing coords only when there IS a physical location.
  if (!isDeliveryOnly && (p.lat == null || p.lng == null)) {
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
  // Yellow-tier only: never part of redCondition below.
  const noDescription =
    !(p.short_description || "").trim() && !(p.description || "").trim();
  if (noDescription) missing.push(COMPLETENESS_FIELDS.short_desc);

  let priority = "green";
  const redCondition = !p.city
    || (!isDeliveryOnly && (p.lat == null || p.lng == null))
    || noContact;
  if (redCondition) {
    priority = "red";
  } else if (missing.length > 0) {
    priority = "yellow";
  }
  return { missing, priority };
}
