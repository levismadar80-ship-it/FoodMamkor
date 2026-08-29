import { test, expect, type Page } from "@playwright/test";
import { detailPath, openDetail, pickProducer, watchPageErrors, REQUIREMENTS } from "./_producer-fixture";

/**
 * MEH-2215 — the guest login prompt must paint ABOVE the page chrome.
 *
 * The bug: `LoginPromptModal` was rendered in place, as a sibling of the
 * gallery heart inside ImageGallery's `absolute top-3 start-3 z-20 lg:hidden`
 * wrapper (ImageGallery.jsx:375). `position` + a z token makes that wrapper a
 * stacking context, so the modal's `z-[9500]` (LoginPromptModal.jsx:98) only
 * ever ranked INSIDE it. The page's own root-level chrome — the `sticky
 * z-[1050]` Header (Header.jsx:321) and the `sticky z-30` /producer tab bar
 * (ProducerDetail.jsx:161) — therefore painted straight over the card, slicing
 * "רוצה לשמור?" in half on mobile. The fix portals the overlay to <body>.
 *
 * ── Why elementFromPoint, and where it can lie ───────────────────────────────
 * Over the TAB BAR it is fully discriminating: that nav has no pointer-events
 * override, so whichever element paints on top is the one returned.
 *
 * Over the HEADER it needs the caveat, because `Header.jsx:321` carries
 * `pointer-events-none` (MEH-1251) — a band that can never be hit-tested would
 * report "the modal is on top" whether or not that is true, which is the
 * two-causes-for-one-green shape .claude/rules/testing.md names. It is kept
 * here because the inner `<nav>` pill re-enables events
 * (`pointer-events-auto`), and that pill is what was measured returning at the
 * header centre BEFORE the portal — so on this surface the assertion is known
 * to be falsifiable rather than assumed to be. Evidence:
 * `frontend/qa-meh-2215-stacking-probe.mjs`, whose run reported
 * `nav.pointer-events-auto` at the header centre and `button.flex-1` (a tab)
 * at the tab-bar centre, with a luma delta of 0.0 on both — i.e. neither
 * surface darkened, so neither was under the scrim.
 *
 * Mobile-only by design. The trapped wrapper is `lg:hidden`, so on the desktop
 * project the surface under test does not render at all. The gate is the
 * project's static identity, never a `count() === 0` on the element under test
 * — that shape reports green when the control disappears entirely (MEH-1698).
 */

/** Matches both names — the label flips on save (FavoriteButton.jsx:165). */
const FAV_ARIA = /הוסיפו למועדפים|הסר ממועדפים/;

/**
 * Is the point painted by the modal? Resolved through `elementFromPoint`, then
 * tested for containment in the portalled overlay.
 */
async function paintedByModal(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="login-prompt-title"]');
      const overlay = dialog?.parentElement ?? null;
      const el = document.elementFromPoint(px as number, py as number);
      return {
        inside: !!(overlay && el && (overlay === el || overlay.contains(el))),
        // Reported so a failure names the culprit instead of just saying false.
        tag: el ? el.tagName.toLowerCase() : null,
        cls: el ? (el.getAttribute("class") || "").slice(0, 60) : null,
      };
    },
    [x, y],
  );
}

/** Centre of an element, or null when it does not render on this viewport. */
async function centreOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return null;
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, selector);
}

test.describe("MEH-2215 — login prompt is not trapped in a stacking context", () => {
  test("guest tap on the gallery heart opens a modal that paints over Header AND tab bar", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the trapped wrapper is lg:hidden");

    const pageErrors = watchPageErrors(page);
    // The reported surface is the IMAGED gallery, so require a photo rather
    // than skipping when the feed hands over an imageless business.
    const producer = await pickProducer(request, REQUIREMENTS.hasGalleryImage);
    await openDetail(page, producer, pageErrors);

    const heart = page.getByRole("button", { name: FAV_ARIA }).filter({ visible: true }).first();
    await expect(
      heart,
      `no visible favourite control on ${detailPath(producer)}`,
    ).toBeVisible({ timeout: 20_000 });
    await heart.click();

    const dialog = page.getByRole("dialog").filter({ visible: true }).first();
    await expect(dialog).toBeVisible();

    // 1. The structural fact: the overlay is a direct child of <body>. This is
    //    what makes the z token meaningful, and it is checkable independently
    //    of any hit test.
    const portalled = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-labelledby="login-prompt-title"]');
      return d?.parentElement?.parentElement === document.body;
    });
    expect(portalled, "the overlay must be a direct child of <body>").toBe(true);

    // 2. The tab bar — measured live, because its offset is `--chrome-top`.
    const tabs = await centreOf(page, 'nav.sticky.z-30');
    expect(tabs, "the /producer mobile tab bar must render on this viewport").not.toBeNull();
    const overTabs = await paintedByModal(page, tabs!.x, tabs!.y);
    expect(
      overTabs.inside,
      `the tab-bar centre is painted by <${overTabs.tag} class="${overTabs.cls}">, not by the modal`,
    ).toBe(true);

    // 3. The header pill (see the pointer-events caveat in the header comment).
    const header = await centreOf(page, "header nav");
    expect(header, "the header pill must render").not.toBeNull();
    const overHeader = await paintedByModal(page, header!.x, header!.y);
    expect(
      overHeader.inside,
      `the header centre is painted by <${overHeader.tag} class="${overHeader.cls}">, not by the modal`,
    ).toBe(true);

    expect(pageErrors, "the page must not throw while the modal is open").toEqual([]);
  });
});
