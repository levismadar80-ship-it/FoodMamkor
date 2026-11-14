// @ts-check
/**
 * Module:   event-date-filter
 * Purpose:  MEH-3118 — the three date shortcuts on /events and /experiences
 *           («היום», «מחר», «סוף השבוע»), as Eventbrite and Meetup offer them.
 *           Pure date arithmetic on the Israel calendar; no fetch.
 * Does NOT: fetch or change the list request — the page filters the rows it
 *           already has. It does not render anything.
 * Related:  lib/israel-date.js (the clock), lib/event-when.js (the card's
 *           «היום / מחר / השבוע» label uses the same day arithmetic),
 *           app/[locale]/events/EventsClient.jsx (the only caller)
 * History:  MEH-3118 (creation; copy approved by Sapir 14/11, rows 7–9)
 */
import { israelToday } from "@/lib/israel-date";

const DAY_MS = 86_400_000;
const ISO_DATE_LEN = 10;
const FRIDAY = 5;
const SATURDAY = 6;

export const WHEN_KEYS = /** @type {const} */ (["today", "tomorrow", "weekend"]);
/** Chip keys carry a prefix so they can never collide with a category key. */
export const WHEN_CHIP_PREFIX = "when:";

/** @param {string} iso `YYYY-MM-DD…` → UTC-midnight ms of that calendar day, or NaN */
const dayMs = (iso) => Date.parse(`${String(iso).slice(0, ISO_DATE_LEN)}T00:00:00Z`);

/**
 * Whether `date` falls in the window `when` names, counted from `today`
 * (both Israel calendar dates, `YYYY-MM-DD`).
 *
 * «סוף השבוע» = the Friday and Saturday of the current Israeli week
 * (Sunday–Saturday). On a Saturday that is today only; the Friday that has
 * passed is in the past and the list never carries it.
 *
 * @param {string} date
 * @param {string | null} when  one of WHEN_KEYS; anything else matches all
 * @param {string} [today]
 * @returns {boolean}
 */
export function matchesWhen(date, when, today = israelToday()) {
  if (!when) return true;
  const a = dayMs(date);
  const b = dayMs(today);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  const diff = Math.round((a - b) / DAY_MS);
  if (when === "today") return diff === 0;
  if (when === "tomorrow") return diff === 1;
  if (when === "weekend") {
    const dow = new Date(b).getUTCDay(); // 0 = Sunday
    const toFriday = FRIDAY - dow; // negative only on Saturday
    const toSaturday = SATURDAY - dow;
    return diff >= 0 && (diff === toFriday || diff === toSaturday);
  }
  return true;
}
