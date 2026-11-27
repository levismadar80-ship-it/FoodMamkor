// @ts-check
"use client";

/**
 * Module:   DateTimeField
 * Purpose:  A date and a 24-hour clock time in one field, with the value an
 *           <input type="datetime-local"> gives («YYYY-MM-DDTHH:MM»), so the
 *           time never reads AM/PM (MEH-3955).
 * Does NOT: convert to a time zone — the value is a wall-clock string; the
 *           caller turns it into an instant (lib/dates.js israelWallClockToIso).
 * Related:  ui/TimeOfDaySelect.jsx (the time half), ui/Input.jsx (the date half).
 * History:  MEH-3955 (creation; replaces the two datetime-local fields of the
 *           group-buy form).
 *
 * The value is "" until both halves are set; a half she has picked is kept
 * here meanwhile, so picking the date first does not clear it.
 *
 * @param {{
 *   label: import("react").ReactNode,
 *   ariaLabel: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   required?: boolean,
 *   helperText?: import("react").ReactNode,
 *   testId?: string,
 * }} props
 */
import { useId, useState } from "react";

import Input from "./Input";
import TimeOfDaySelect from "./TimeOfDaySelect";
import { FieldShell } from "./field";

const TIME_LENGTH = 5;

/** @param {string} value */
function splitDateTime(value) {
  const [date = "", time = ""] = (value || "").split("T");
  return { date, time: time.slice(0, TIME_LENGTH) };
}

/** @param {{ date: string, time: string }} parts */
const compose = (parts) => (parts.date && parts.time ? `${parts.date}T${parts.time}` : "");

/**
 * @param {{
 *   label: import("react").ReactNode,
 *   ariaLabel: string,
 *   value: string,
 *   onChange: (value: string) => void,
 *   required?: boolean,
 *   helperText?: import("react").ReactNode,
 *   testId?: string,
 * }} props
 */
export default function DateTimeField({ label, ariaLabel, value, onChange, required = false, helperText, testId }) {
  const id = useId();
  const [parts, setParts] = useState(() => splitDateTime(value));
  // A value set from outside (an edit form loading, a reset) wins; a
  // half-picked field, whose value is still "", is left as it is. Derived
  // while rendering, not in an effect (react-hooks/set-state-in-effect).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (compose(parts) !== (value || "")) setParts(splitDateTime(value));
  }
  const emit = (/** @type {{ date: string, time: string }} */ next) => {
    setParts(next);
    onChange(compose(next));
  };
  return (
    <FieldShell id={id} label={label} required={required} message={helperText} describedById={`${id}-desc`}>
      <div className="flex items-center gap-2 min-w-0" data-testid={testId}>
        <Input
          id={id}
          inline
          size="sm"
          type="date"
          dir="ltr"
          required={required}
          aria-describedby={helperText ? `${id}-desc` : undefined}
          value={parts.date}
          onChange={(/** @type {any} */ e) => emit({ ...parts, date: e.target.value })}
          className="flex-1 min-w-0"
        />
        <TimeOfDaySelect
          optional
          // A required field needs its time too: the empty «--» hour then
          // fails the browser's own check, as datetime-local did (MEH-3955 review).
          required={required}
          describedBy={helperText ? `${id}-desc` : undefined}
          ariaLabel={ariaLabel}
          value={parts.time}
          onChange={(time) => emit({ ...parts, time })}
          className="w-36"
        />
      </div>
    </FieldShell>
  );
}
