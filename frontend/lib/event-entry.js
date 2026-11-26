// @ts-check
/**
 * toEventEntry — normalizes an event OR experience API row into the one shape
 * EventEntryRow renders. Plain module (no "use client"): the organizer page is
 * a server component and builds its rows here too (MEH-2547).
 */
// Normalize an event OR experience row into one shape the rail renderer
// understands. Field names diverge between the two APIs; the accent
// ("green" event / "gold" experience) drives the species styling.
import { findExperienceCategory } from "./event-categories";

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
    // MEH-2666: the experience page names the host's business (MEH-2476);
    // the list row matches it and falls back to her name only without one.
    who: isExp
      ? row.host?.producer_name || row.host?.name
      : isOrganizerEvent
        ? t("organizer_line", { name: row.producer_name })
        : row.producer_name,
    city: row.city,
    // MEH-2476: a recurring experience names its schedule in the meta line,
    // so the date rail reads as the first occasion, not the only one.
    // MEH-3898: a course says so, with its number of meetings.
    schedule: isExp && row.is_recurring
      ? row.recurring_schedule?.trim() || null
      : isExp && row.course_meetings?.length
        ? t("course_meetings", { count: row.course_meetings.length }) || null
        : null,
    // an older experience row stores the English key («workshop»);
    // the row chip shows the Hebrew value the other rows carry.
    category: isExp ? findExperienceCategory(row.category)?.key ?? row.category : row.category,
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
    // MEH-3009: experiences carry the host's initial too, so every row with a
    // picture is marked the same way.
    ownerInitial:
      Array.from(((isExp ? row.host?.producer_name || row.host?.name : row.producer_name) || "").trim())[0] ?? "",
  };
}

/**
 * MEH-3892: on the owner's OWN page (business page, organizer page) a row with
 * no photo of its own takes one from that owner's gallery. The cover
 * (images[0]) already heads the page, so the other photos come first, in turn
 * by row order — a weekly event reads as four rows, not one row four times.
 * Only one photo → that one. None → unchanged (the category tile).
 * Rows keep their own photo, and no owner initial is added (the caller clears
 * it: every row here is this owner's).
 *
 * @template {Record<string, any>} E
 * @param {E[]} entries rows in display order (each may carry `image`)
 * @param {unknown} images the owner's `images` array from the API
 * @returns {(E & { ownerImage: string | null })[]}
 */
export function withOwnGallery(entries, images) {
  const all = (Array.isArray(images) ? images : [])
    .filter((u) => typeof u === "string" && u.trim())
    .map((u) => u.trim());
  const pool = all.length > 1 ? all.slice(1) : all;
  let next = 0;
  return entries.map((e) => {
    if (e.image || pool.length === 0) return { ...e, ownerImage: null };
    const ownerImage = pool[next % pool.length];
    next += 1;
    return { ...e, ownerImage };
  });
}
