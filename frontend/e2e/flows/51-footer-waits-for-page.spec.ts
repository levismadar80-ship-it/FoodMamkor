import { test, expect } from "./_cloudinary-stub";

/**
 * MEH-3878 — while the route loader is on screen, the site footer is not drawn.
 *
 * On a first load React sends a large page as a later chunk and swaps it in at
 * least 300 ms after the first paint (the `$RC` / `$RT` reveal of React's
 * streaming), so for that moment the page is the route loader with the footer
 * right under it. At scroll 0 the loader's min-h-screen (MEH-2754) keeps the
 * footer below the fold, but a hash link (/recommend#share), a reload that
 * restores the scroll or a tall screen showed it, and the page pushed it down:
 * CLS 0.41 on /recommend, reproduced locally under CPU load (load guard, desktop).
 *
 * Two halves hold it: `__tests__/RouteLoadingHeight.test.jsx` renders the real
 * loading.js and finds `data-route-loader` on it; this spec checks, in a real
 * browser, what the globals.css rule does with that marker. The loader itself
 * cannot be held on screen here without answering for the server (a prefetched
 * client navigation never shows it), so the spec puts the marker in the page
 * the way loading.js renders it, and takes it out again.
 *
 * Shown failing: without the globals.css rule the footer stays visible beside
 * the marker and the first `toBeHidden` goes red.
 */
test.describe("MEH-3878 the footer waits for the page", () => {
  test("hidden while the route loader shows, back once the page is in", async ({ page }) => {
    await page.goto("/about");
    const footer = page.locator("footer[data-site-footer]");
    await expect(footer).toBeVisible({ timeout: 15_000 });

    // Control: the same empty element without the marker changes nothing, so a
    // footer that hides below is hidden by the marker and not by the insert.
    // Empty on purpose: a tall block would itself push the footer (load guard).
    // Re-inserted on every poll: a hydration still running may drop a node it
    // does not own, and the check must read the marker, not its absence.
    const mark = (withMarker: boolean) =>
      page.evaluate((on) => {
        let d = document.getElementById("meh3878-probe");
        if (!d) {
          d = document.createElement("div");
          d.id = "meh3878-probe";
          document.body.appendChild(d);
        }
        if (on) d.setAttribute("data-route-loader", "");
        else d.removeAttribute("data-route-loader");
        return getComputedStyle(document.querySelector("footer[data-site-footer]")!).display;
      }, withMarker);
    await expect.poll(() => mark(false), { message: "control: an unmarked block must not hide the footer" }).not.toBe("none");
    await expect.poll(() => mark(true)).toBe("none");
    await expect(footer).toBeHidden();
    await expect.poll(() => mark(false)).not.toBe("none");
    await expect(footer).toBeVisible();
  });
});
