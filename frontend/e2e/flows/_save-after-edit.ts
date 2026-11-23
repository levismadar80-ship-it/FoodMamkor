import { expect, type Locator, type Page } from "@playwright/test";
import { layoutSettled } from "./_layout-settled";

/**
 * Module:   _save-after-edit
 * Purpose:  Click a card's save button on /producer/dashboard/edit after an
 *           edit, once the page has stopped moving.
 * Does NOT: check what the save did. The caller asserts the request and the
 *           card's answer.
 * History:  MEH-3685 · MEH-3560 · MEH-3692 · MEH-3722 (creation). The mechanism
 *           was found in MEH-3449 and fixed there in one spec only.
 *
 * WHY. An edit makes the card dirty in one render; the card reports it to the
 * page from an effect (`reportDirty`), and the page mounts the sticky
 * «unsaved changes» banner (`data-testid="unsaved-banner"`, edit/page.js) in a
 * LATER render. The banner is in flow above the cards, so mounting it pushes
 * every card down. A spec that clicks save as soon as the button enables can
 * land its mousedown before that render and its mouseup after it: the mouseup
 * hits another element, `click` fires on a common ancestor, the handler never
 * runs, and Playwright still reports the click as done — Playwright checks the
 * hit target on the first pointer event only (see _layout-settled.ts). The
 * symptom is «the PUT never left the browser», or no inline error after a
 * 422, on the first attempt only; a retry passes. A person never clicks within
 * a frame of their own edit, so this is a test race, not a product bug.
 *
 * HOW. Gate on the three states the click needs, in order: the button enabled
 * (the card saw the edit), the banner on screen (the last render of the edit
 * happened), the button still for 10 frames. Each failure says which.
 * Only for cards that report dirty to the page. A card that does not (the
 * locations editor) has no banner, and this helper would rightly fail on it.
 */
export async function clickSaveAfterEdit(page: Page, save: Locator): Promise<void> {
  await expect(save, "the save button never enabled — the card did not see the edit").toBeEnabled();
  await expect(
    page.getByTestId("unsaved-banner"),
    "the unsaved banner never mounted — the card did not report dirty to the page",
  ).toBeVisible();
  await layoutSettled(save);
  await save.click();
}
