/**
 * toEventEntry — normalizes an event OR experience API row into the one shape
 * EventEntryRow renders. Plain module (no "use client"): the organizer page is
 * a server component and builds its rows here too (MEH-2547).
 */
// Normalize an event OR experience row into one shape the rail renderer
// understands. Field names diverge between the two APIs; the accent
// ("green" event / "gold" experience) drives the species styling.
export function toEventEntry(row, tab, t) {
  const isExp = tab === "experiences";
  // MEH-2461: an organizer-owned event names its organizer with the approved
  // «מארגן: {name}» line; a business keeps the bare business name.
  const isOrganizerEvent = !isExp && row.owner_kind === "organizer" && row.producer_name;
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    time: row.event_time,
    endTime: row.end_time ?? null, // MEH-2469
    who: isExp
      ? row.host?.name
      : isOrganizerEvent
        ? t("organizer_line", { name: row.producer_name })
        : row.producer_name,
    city: row.city,
    // MEH-2476: a recurring experience names its schedule in the meta line,
    // so the date rail reads as the first occasion, not the only one.
    schedule: isExp && row.is_recurring ? row.recurring_schedule?.trim() || null : null,
    category: row.category,
    price: isExp ? row.price_per_person : row.price,
    description: row.description,
    accent: isExp ? "gold" : "green",
    href: isExp ? `/experiences/${row.id}` : `/events/${row.id}`,
    // MEH-2468: the cover image the owner uploaded (EventForm, MEH-988) —
    // until now it showed only on the event page itself.
    image: row.image_url || null,
    // MEH-2546: the owner's first photo — the row's fallback when the event
    // has none (Meetup shows the group cover the same way). Events only.
    ownerImage: isExp ? null : row.owner_image_url || null,
    ownerInitial: isExp ? "" : Array.from((row.producer_name || "").trim())[0] ?? "",
  };
}
