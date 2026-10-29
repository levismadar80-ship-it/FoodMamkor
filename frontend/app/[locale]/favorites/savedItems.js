/**
 * savedItems — the non-React half of /favorites' recipes / events /
 * experiences (MEH-2560, chunk 5/5 of MEH-2555): load and parse the
 * GET /users/me/saved payload row by row, and split events / experiences into
 * upcoming and «עברו». Kept out of the component so the split rules are
 * tested without rendering the page.
 */

import api from "@/lib/api";
import {
  SavedEventSchema,
  SavedExperienceSchema,
  SavedItemsResponseSchema,
  SavedRecipeSchema,
} from "@/lib/api-schemas";
import { eventWhen } from "@/lib/event-when";
import { israelToday } from "@/lib/israel-date";

const EMPTY = { recipes: [], events: [], experiences: [] };

const keepValid = (rows, schema) =>
  rows
    .map((row) => schema.safeParse(row))
    .filter((res) => res.success)
    .map((res) => res.data);

/**
 * Rule 19 + MEH-1713: a malformed envelope is an error (null); a malformed
 * ROW costs that row only. A recipe without a business slug has no page to
 * link to, so it is dropped with the bad rows.
 */
export function parseSavedItems(data) {
  const envelope = SavedItemsResponseSchema.safeParse(data);
  if (!envelope.success) return null;
  return {
    recipes: keepValid(envelope.data.recipes, SavedRecipeSchema).filter((r) => r.producer_slug),
    events: keepValid(envelope.data.events, SavedEventSchema),
    experiences: keepValid(envelope.data.experiences, SavedExperienceSchema),
  };
}

export { EMPTY as EMPTY_SAVED };

/** GET /users/me/saved, parsed. Rejects on a network error or a malformed
 *  envelope, so the page shows its error state, never a false «nothing». */
export async function loadSavedItems() {
  const res = await api.get("/users/me/saved");
  const parsed = parseSavedItems(res.data);
  if (!parsed) throw new Error("malformed /users/me/saved");
  return parsed;
}

/**
 * «עברו» holds an event whose date passed (Israel calendar), and an
 * experience that is over — a one-off whose date passed, or one its host
 * cancelled. A recurring experience is never past: its date is the first
 * occasion, not the only one (MEH-2476).
 *
 * Upcoming: soonest first. Past: most recent first.
 */
export function splitByTime(events, experiences, today = israelToday()) {
  const isPastEvent = (ev) => eventWhen(ev.event_date, today) === "past";
  const isPastExperience = (ex) =>
    ex.is_active === false || (!ex.is_recurring && eventWhen(ex.event_date, today) === "past");
  const byDate = (a, b) => String(a.event_date).localeCompare(String(b.event_date));
  const tag = (kind) => (row) => ({ kind, row });

  const upcomingEvents = events.filter((ev) => !isPastEvent(ev)).sort(byDate);
  const upcomingExperiences = experiences.filter((ex) => !isPastExperience(ex)).sort(byDate);
  const past = [
    ...events.filter(isPastEvent).map(tag("events")),
    ...experiences.filter(isPastExperience).map(tag("experiences")),
  ].sort((a, b) => byDate(b.row, a.row));

  return { upcomingEvents, upcomingExperiences, past };
}
