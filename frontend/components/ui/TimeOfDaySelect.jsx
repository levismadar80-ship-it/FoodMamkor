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
 * Related:  ui/Select.jsx (look), ui/DateTimeField.jsx. Every clock-time
 *           field of the site (frontend/components/CLAUDE.md catalog).
 * History:  MEH-3823 (creation). MEH-3955: every clock-time field on the
 *           site uses it (optional fields, a visible label, an error, aria
 *           labels from one field name); eslint `design-system/no-html-time`
 *           refuses a new <input type="time"> or "datetime-local".
 *
 * `ariaLabel` names the field once («יום ראשון, משעה»); the two selects are
 * then «… · שעה» and «… · דקות». `optional` adds an empty hour («--») whose
 * value is "", for a field the form lets her leave blank; picking an hour
 * from empty gives «HH:00».
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
 *   hourLabel?: string,
 *   minuteLabel?: string,
 *   ariaLabel?: string,
 *   label?: import("react").ReactNode,
 *   error?: import("react").ReactNode,
 *   optional?: boolean,
 *   invalid?: boolean,
 *   required?: boolean,
 *   describedBy?: string,
 *   disabled?: boolean,
 *   id?: string,
 *   step?: number,
 *   testId?: string,
 *   className?: string,
 * }} props
 */
import { useId } from "react";
import { useTranslations } from "next-intl";

import Select from "./Select";
import { FieldShell } from "./field";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const DEFAULT_STEP = 5;
const EMPTY = "";
const twoDigits = (num) => String(num).padStart(2, "0");

/** @param {string} value @param {number} step */
function choices(value, step) {
  // «18:30:00» (a column read as is) shows as 18:30, as a native input did.
  const hhmm = (value || "").slice(0, 5);
  const set = /^\d{2}:\d{2}$/.test(hhmm);
  const [hh, mm] = set ? hhmm.split(":") : [EMPTY, "00"];
  const hours = Array.from({ length: HOURS_PER_DAY }, (_, i) => twoDigits(i));
  const minutes = Array.from({ length: Math.ceil(MINUTES_PER_HOUR / step) }, (_, i) => twoDigits(i * step));
  if (!minutes.includes(mm)) minutes.push(mm);
  minutes.sort();
  return { hh, mm, hours, minutes };
}

/** @param {any} props */
export default function TimeOfDaySelect(props) {
  const { value, onChange, step = DEFAULT_STEP, testId, className = "", label, error, optional = false, disabled = false, id, required = false, describedBy } = props;
  // The field's name: ariaLabel, else a plain-text label.
  const ariaLabel = props.ariaLabel || (typeof label === "string" ? label : "");
  const t = useTranslations("time_of_day");
  const autoId = useId();
  const hourId = id || autoId;
  const { hh: rawHour, mm, hours, minutes } = choices(value, step);
  // A required field with no value shows 00, as it always did (MEH-3823).
  const hh = rawHour === EMPTY && !optional ? "00" : rawHour;
  const hourLabel = props.hourLabel || `${ariaLabel} · ${t("hour")}`;
  const minuteLabel = props.minuteLabel || `${ariaLabel} · ${t("minute")}`;
  const invalid = !!error || !!props.invalid;
  const describedById = `${hourId}-desc`;
  const described = [error ? describedById : null, describedBy].filter(Boolean).join(" ") || undefined;
  const selectProps = { inline: true, size: "xs", disabled, "aria-invalid": invalid || undefined, "aria-describedby": described };

  const row = (
    <div
      dir="ltr"
      role="group"
      aria-label={ariaLabel || undefined}
      className={`flex items-center gap-1 min-w-0 ${className}`.trim()}
      data-testid={testId}
      data-time-value={value || ""}
    >
      <Select
        {...selectProps}
        id={hourId}
        required={required && optional ? true : undefined}
        aria-label={hourLabel}
        value={hh}
        onChange={(event) => onChange(event.target.value === EMPTY ? EMPTY : `${event.target.value}:${mm}`)}
        data-testid={testId && `${testId}-hour`}
        className="flex-1 min-w-0 min-h-touch numeric"
      >
        {optional && <option value={EMPTY}>--</option>}
        {hours.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
      <span aria-hidden="true" className="text-fg-muted">:</span>
      <Select
        {...selectProps}
        disabled={disabled || hh === EMPTY}
        aria-label={minuteLabel}
        value={mm}
        onChange={(event) => onChange(`${hh}:${event.target.value}`)}
        data-testid={testId && `${testId}-minute`}
        className="flex-1 min-w-0 min-h-touch numeric"
      >
        {minutes.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
  if (!label && !error) return row;
  return (
    <FieldShell id={hourId} label={label} message={error} describedById={describedById} invalid={invalid}>
      {row}
    </FieldShell>
  );
}
