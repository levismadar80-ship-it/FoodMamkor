// MEH-3955: drive a ui/TimeOfDaySelect (hour + minute selects) the way a
// test drove an <input type="time">: find it by the «HH:MM» it shows, set a
// new «HH:MM», read it back.
import { fireEvent, screen } from "@testing-library/react";

/** Every time field on the page, in DOM order. @returns {HTMLElement[]} */
export function timeFields(root = document.body) {
  return [...root.querySelectorAll("[data-time-value]")];
}

/** The time field showing `hhmm`, or throws (like getByDisplayValue). */
export function getTimeField(hhmm, root = document.body) {
  const hits = timeFields(root).filter((el) => el.getAttribute("data-time-value") === hhmm);
  if (hits.length !== 1) throw new Error(`expected one time field showing ${hhmm}, found ${hits.length}`);
  return hits[0];
}

/** The time field showing `hhmm`, or null. */
export function queryTimeField(hhmm, root = document.body) {
  return timeFields(root).find((el) => el.getAttribute("data-time-value") === hhmm) || null;
}

/** The value a time field shows ("" when empty). */
export function timeValue(field) {
  return field.getAttribute("data-time-value") || "";
}

/** Pick `hhmm` ("" clears an optional field) in a time field. */
export function setTime(field, hhmm) {
  const [hour, minute] = field.querySelectorAll("select");
  if (!hhmm) {
    fireEvent.change(hour, { target: { value: "" } });
    return;
  }
  const [hh, mm] = hhmm.split(":");
  fireEvent.change(hour, { target: { value: hh } });
  // The parent re-renders with the new hour; read the minute select again.
  const minuteNow = field.querySelectorAll("select")[1] || minute;
  fireEvent.change(minuteNow, { target: { value: mm } });
}

/** The time field by its accessible name (the ariaLabel prop). */
export function getTimeFieldByName(name) {
  return screen.getByRole("group", { name });
}
