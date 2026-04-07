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
  if (!p.city) missing.push("עיר");
  if (p.lat == null || p.lng == null) missing.push("קואורדינטות");
  const noContact = !p.phone && !p.instagram;
  if (noContact) missing.push("פרטי קשר (טלפון/אינסטגרם)");
  if (!p.categories || p.categories.length === 0) missing.push("קטגוריה");
  if (!p.images || p.images.length === 0) missing.push("תמונה");

  let priority = "green";
  if (!p.city || p.lat == null || p.lng == null || noContact) {
    priority = "red";
  } else if (missing.length > 0) {
    priority = "yellow";
  }
  return { missing, priority };
}
