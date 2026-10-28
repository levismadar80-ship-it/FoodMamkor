/**
 * Module:   experience-format
 * Purpose:  An experience's duration as a reader says it — «שעה וחצי», not
 *           «90 דקות» (MEH-2476).
 * Does NOT: choose words; the copy is in messages (experiences.detail.duration_*).
 * Related:  app/[locale]/experiences/[id]/ExperienceDetailClient.jsx (the line),
 *           components/ExperienceForm.jsx (where duration_minutes is typed, 15–1440).
 * History:  MEH-2476 (creation).
 */

const MINUTES_PER_HOUR = 60;
const HALF_HOUR = 30;

/**
 * @param {number|null|undefined} minutes
 * @param {(key: string, values?: object) => string} t  experiences.detail translator
 * @returns {string|null} null when there is no duration
 */
export function formatDuration(minutes, t) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (total < MINUTES_PER_HOUR) return t("duration_minutes", { count: total });
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const rest = total % MINUTES_PER_HOUR;
  if (rest === 0) return t("duration_hours", { count: hours });
  if (rest === HALF_HOUR) return t("duration_hours_half", { count: hours });
  return t("duration_mixed", { hours: t("duration_hours", { count: hours }), minutes: rest });
}
