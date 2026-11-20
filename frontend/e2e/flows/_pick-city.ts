import { expect, type Locator } from "@playwright/test";
import { layoutSettled } from "./_layout-settled";

/**
 * Module:   _pick-city
 * Purpose:  Pick a town in a CitySearch field (`components/CitySearch.jsx`) the
 *           way a seller does — type, then choose a row — and PROVE the pick
 *           landed before the spec moves on.
 * Does NOT: assert anything about the suggestions themselves (which rows, how
 *           many). Specs that test the list keep their own assertions.
 * History:  MEH-3488 (creation).
 *
 * WHY. Eleven call sites did `fill()` then `getByRole("option").first().click()`
 * and trusted the click. Two things can go wrong between those lines and
 * neither names itself:
 *   1. The row is still moving when the click lands (the list opens on the
 *      fill, re-renders when the debounced GET /cities answers, and the
 *      keyboard highlight repaints the row) — the MEH-3449 shape: Playwright
 *      checks the hit target on mousedown only, so a shift before mouseup
 *      loses the pick and the click still "succeeds".
 *   2. The pick is made on `mousedown` (CitySearch.jsx, the option's
 *      onMouseDown), so a lost pick leaves the list open and the typed text in
 *      the field — and the spec fails three steps later, on «הבא», with a
 *      message about the wrong thing.
 * So: wait until the row is still (`layoutSettled`), click it, then require
 * the list to be gone and the field to hold the row's exact text. A pick that
 * did not land fails HERE, by name.
 *
 * `scope` is the field's wrapper (e.g. `getByTestId("register-details-city")`).
 * `option` defaults to `typed`; the row is matched by accessible name, first
 * match, as the call sites did.
 */
export async function pickCity(scope: Locator, typed: string, option: string | RegExp = typed): Promise<string> {
  const input = scope.getByRole("combobox");
  await input.fill(typed);
  const row = scope.getByRole("option", { name: option }).first();
  await expect(row, `a suggestion for «${typed}» must appear`).toBeVisible();
  await layoutSettled(row);
  const name = (await row.innerText()).trim();
  await row.click();
  await expect(scope.getByRole("listbox"), `the pick of «${name}» must close the list`).toHaveCount(0);
  await expect(input, `the field must hold the picked town «${name}»`).toHaveValue(name);
  return name;
}
