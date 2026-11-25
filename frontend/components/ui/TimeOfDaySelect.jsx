"use client";
// @ts-check

/**
 * Module:   TimeOfDaySelect
 * Purpose:  A clock time «HH:MM» picked from two selects (hour 00–23, minutes
 *           in steps), so it always reads on a 24-hour clock (MEH-3823).
 *           A native <input type="time"> follows the device's locale: it
 *           shows AM/PM on an iPhone set to English and in English Chromium,
 *           which is how the rescue screenshots of MEH-3702 / MEH-3703 read.
 * Does NOT: own state, or know about days or time zones — the value is a
 *           wall-clock «HH:MM» string, as an <input type="time"> gives.
 * Related:  ui/Select.jsx (look). Used by dashboard/RescueTab.jsx and
 *           dashboard/RescueScheduleForm.jsx.
 * History:  MEH-3823 (creation).
 *
 * A value off the minute step («18:07») is kept: its minute is added to the
 * list, so an existing value is never silently changed on render.
 *
 * Hours are in DOM order 00 → 23 and the two selects sit in a `dir="ltr"`
 * row, so «18 : 30» reads the same in Hebrew as on every clock.
 *
 * @param {{
 *   value: string,
 *   onChange: (hhmm: string) => void,
 *   hourLabel: string,
 *   minuteLabel: string,
 *   step?: number,
 *   testId?: string,
 *   className?: string,
 * }} props
 */
import Select from "./Select";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const DEFAULT_STEP = 5;
const twoDigits = (num) => String(num).padStart(2, "0");

export default function TimeOfDaySelect({ value, onChange, hourLabel, minuteLabel, step = DEFAULT_STEP, testId, className = "" }) {
  const [hh = "00", mm = "00"] = /^\d{2}:\d{2}$/.test(value || "") ? value.split(":") : [];
  const hours = Array.from({ length: HOURS_PER_DAY }, (_, i) => twoDigits(i));
  const minutes = Array.from({ length: Math.ceil(MINUTES_PER_HOUR / step) }, (_, i) => twoDigits(i * step));
  if (!minutes.includes(mm)) minutes.push(mm);
  minutes.sort();

  return (
    <div dir="ltr" className={`flex items-center gap-1 min-w-0 ${className}`.trim()} data-testid={testId}>
      <Select
        inline
        size="xs"
        aria-label={hourLabel}
        value={hh}
        onChange={(event) => onChange(`${event.target.value}:${mm}`)}
        data-testid={testId && `${testId}-hour`}
        className="flex-1 min-w-0 numeric"
      >
        {hours.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
      <span aria-hidden="true" className="text-fg-muted">:</span>
      <Select
        inline
        size="xs"
        aria-label={minuteLabel}
        value={mm}
        onChange={(event) => onChange(`${hh}:${event.target.value}`)}
        data-testid={testId && `${testId}-minute`}
        className="flex-1 min-w-0 numeric"
      >
        {minutes.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
}
