import { test, expect, type Page } from "./_cloudinary-stub";
import { findExperienceCategory, OTHER_CATEGORY } from "../../lib/event-categories";

/**
 * Spec:     47-item-back-row
 * Purpose:  MEH-3057 — on an event / workshop page, «→ חזרה» and the category
 *           chip («בישול ואפייה») shared one line and touched (Sapir's 13/11
 *           screenshot, 375 px: chip.right == back.left, 0 px apart). The fix
 *           makes HistoryBackLink block-level, so the chip starts a new row.
 *           This pins the GEOMETRY, which no unit test can see: the back
 *           button sits wholly above the chip and they do not overlap.
 * Data:     whatever the backend serves — no mocks. The item is picked from
 *           the live list (one with a category other than «אחר», which has no
 *           chip); a missing item is a NAMED red, never a skip
 *           (.claude/rules/testing.md: a skip prints the same thing whether the
 *           catalog is thin or the query is wrong).
 * Arrival:  the list page, then a click on the item's card — a real in-app
 *           arrival, so HistoryBackLink has a page behind it in every engine
 *           (Navigation API or the first-document fallback).
 * Projects: the geometry is asserted on `mobile` only. At lg the desktop
 *           breadcrumb sits between the two, so a desktop run would be green
 *           with the bug present — a check that cannot fail is not run there.
 */

type Item = { id: string; category?: string | null };

async function pick(page: Page, path: string): Promise<Item> {
  const res = await page.request.get(`/api${path}`);
  expect(res.ok(), `GET ${path} must respond 2xx — got ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as unknown;
  const list = (Array.isArray(body) ? body : (body as { items?: Item[] }).items ?? []) as Item[];
  // The page's own rule for showing a chip (EventDetailClient /
  // ExperienceDetailClient): a known category that is not «אחר».
  const hasChip = (c?: string | null) =>
    !!c && c !== OTHER_CATEGORY &&
    (path === "/events" ? !!c : (findExperienceCategory(c)?.key ?? OTHER_CATEGORY) !== OTHER_CATEGORY);
  const item = list.find((i) => hasChip(i.category));
  expect(item, `${path} must hold at least one item with a category chip (not «אחר»)`).toBeTruthy();
  return item as Item;
}

for (const kind of ["events", "experiences"] as const) {
  const chipId = kind === "events" ? "event-category" : "experience-category";

  test(`${kind}: «חזרה» is on its own row, above the category chip — never beside it`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "desktop: the breadcrumb separates the two, so this geometry cannot fail there");
    const item = await pick(page, `/${kind}`);
    await page.goto(`/${kind}`);
    const card = page.locator(`a[href$="/${kind}/${item.id}"]`).first();
    await expect(card, `the /${kind} list must link to ${item.id}`).toHaveCount(1);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/${kind}/${item.id}(?:[?#]|$)`));

    const back = page.getByTestId("history-back");
    const chip = page.getByTestId(chipId);
    await expect(back).toBeVisible();
    await expect(chip).toBeVisible();

    const b = await back.boundingBox();
    const c = await chip.boundingBox();
    expect(b && c, "both boxes must be measurable").toBeTruthy();
    if (!b || !c) return;
    // The chip starts below the back button's bottom edge — a shared line
    // (the bug) puts the chip's top inside the button's 44 px band.
    expect(c.y, `chip top ${c.y} must be at or below back bottom ${b.y + b.height}`).toBeGreaterThanOrEqual(
      b.y + b.height - 1,
    );
  });
}
