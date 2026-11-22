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
import { israelToday } from "@/lib/israel-date";

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
  // LTR isolate (as PageFillPanel / BadgeRow): bare «09:00–13:00» in an RTL
  // line reorders to «13:00–09:00» around the dash (seen at 375, MEH-3597).
  const ltr = (/** @type {string} */ x) => `\u2066${x}\u2069`;
  return startDay === endDay
    ? `${startDay}, ${ltr(`${from}\u2060–\u2060${until}`)}` // word joiners: the range never splits across lines
    : `${startDay}, ${ltr(from)} – ${endDay}, ${ltr(until)}`;
}

/**
 * MEH-3610: «עד מתי אפשר לבטל» — the join deadline as «יום חמישי, 3 בדצמבר,
 * 20:00» (Israel time), the same day and hour style as the pickup line.
 * @param {string | null | undefined} deadline naive UTC from the API
 * @param {string} locale
 * @returns {string | null}
 */
export function cancelUntilText(deadline, locale) {
  const d = deadline ? parseNaiveUtc(deadline) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${formatDate(d, locale, "long")}, \u2066${israelTime(d.toISOString())}\u2069`;
}

/**
 * The saved window back into the form's two fields (Israel wall clock):
 * `start` for a datetime-local input, `endTime` for a time input. The form
 * only writes same-day windows; a cross-day one from the API keeps its end
 * hour and is moved to the start's day on the next save.
 * @param {string | null | undefined} start
 * @param {string | null | undefined} end
 * @returns {{ start: string, endTime: string }}
 */
export function pickupWindowFields(start, end) {
  const s = start ? parseNaiveUtc(start) : null;
  const e = end ? parseNaiveUtc(end) : null;
  if (!s || !e) return { start: "", endTime: "" };
  return { start: `${israelToday(s)}T${israelTime(s.toISOString())}`, endTime: israelTime(e.toISOString()) ?? "" };
}
