// Single source of truth for the producer-completeness check used by the
// admin producers list. Extracted into its own module so it can be unit
// tested without spinning up React.
//
// Returns the list of missing fields (for the tooltip) and a priority bucket:
//   red    — blocks the producer from working at all (no map / no contact)
//   yellow — visible but incomplete
//   green  — every required field is filled

export function producerCompleteness(p) {
  const missing = [];
  const isDeliveryOnly = p.has_physical_location === false && p.offers_delivery;

  if (!p.city) missing.push("עיר");

  // MEH-213: delivery-only producers intentionally have no lat/lng.
  // Flag missing coords only when there IS a physical location.
  if (!isDeliveryOnly && (p.lat == null || p.lng == null)) {
    missing.push("קואורדינטות");
  }

  // MEH-213: delivery-only — require either nationwide flag or at least one city.
  if (isDeliveryOnly && !p.delivery_nationwide && (!p.delivery_cities || p.delivery_cities.length === 0)) {
    missing.push("אזורי משלוח");
  }

  const noContact = !p.phone && !p.instagram;
  if (noContact) missing.push("פרטי קשר (טלפון/אינסטגרם)");
  if (!p.categories || p.categories.length === 0) missing.push("קטגוריה");
  if (!p.images || p.images.length === 0) missing.push("תמונה");

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
