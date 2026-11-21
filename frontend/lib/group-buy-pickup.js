// @ts-check
/**
 * Module:   group-buy-pickup
 * Purpose:  The group buy's pickup window as one line — «יום שישי, 5 בדצמבר,
 *           09:00–13:00», or two dates when it spans days (MEH-3597). Israel
 *           time, from the naive-UTC strings the API sends.
 * Does NOT: format dates itself — formatDate (lib/format-date.js) and
 *           israelTime (lib/rescue.js) own that.
 * History:  MEH-3597 (creation)
 */
import { formatDate } from "@/lib/format-date";
import { parseNaiveUtc } from "@/lib/dates";
import { israelTime } from "@/lib/rescue";

/**
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 * @param {string} locale
 * @returns {string | null} null when the window is missing or unreadable.
 */
export function pickupWindowText(start, end, locale) {
  const s = start ? parseNaiveUtc(start) : null;
  const e = end ? parseNaiveUtc(end) : null;
  if (!s || !e) return null;
  const startDay = formatDate(s, locale, "long");
  const endDay = formatDate(e, locale, "long");
  const from = israelTime(s.toISOString());
  const until = israelTime(e.toISOString());
  return startDay === endDay ? `${startDay}, ${from}–${until}` : `${startDay}, ${from} – ${endDay}, ${until}`;
}
