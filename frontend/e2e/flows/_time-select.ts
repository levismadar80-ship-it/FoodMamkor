/**
 * Module:   e2e/flows/_time-select
 * Purpose:  Drive ui/TimeOfDaySelect (MEH-3955): a role="group" named by its
 *           field, holding an hour and a minute <select>, with the «HH:MM»
 *           value on `data-time-value`. Replaces `.fill("16:00")` and
 *           `toHaveValue("16:00")`, which only an <input type="time"> took.
 * Does NOT: open a native picker — the selects are plain <select>s.
 * History:  MEH-3955 follow-up (the specs still drove <input type="time">).
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** The time field named `name` (its aria-label), as one group. */
export const timeField = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole("group", typeof name === "string" ? { name, exact: true } : { name });

/** Pick «HH:MM»: the hour first, since an optional field's minute waits for it. */
export async function setTime(field: Locator, hhmm: string) {
  const [hh, mm] = hhmm.split(":");
  const selects = field.getByRole("combobox");
  await selects.nth(0).selectOption(hh);
  await selects.nth(1).selectOption(mm);
  await expectTime(field, hhmm);
}

/** The field reads «HH:MM» (or "" while unset). */
export const expectTime = (field: Locator, hhmm: string, message?: string) =>
  expect(field, message).toHaveAttribute("data-time-value", hhmm);
