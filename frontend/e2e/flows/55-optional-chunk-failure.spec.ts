import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * MEH-3946 — when the chat widget's code fails to download, the page stays.
 *
 * The chat is loaded by next/dynamic after hydration, from the root layout, so
 * on every page. Before, a failed download (a flaky phone network, a WebKit
 * navigation that cancels it, a deploy that replaced the build) was rethrown
 * during render, and the error boundary replaced the WHOLE page with
 * «משהו השתבש». In WebKit E2E it showed as `console.error: ChunkLoadError …
 * 3a4709iczcfuw.js from module 982666` (05-map-navigation:165 and
 * manual/producer-detail:418, 27/11). lib/optional-chunk.js now turns a
 * failed add-on download into "render nothing".
 *
 * The chunk is found by its content (the launcher's test id), not by its
 * hashed file name, which changes with every build.
 *
 * Shown failing (PR body): with ChatWidgetLazy.jsx at its staging version the
 * first case is red: the error screen appears.
 */

const ERROR_HEADING = "משהו השתבש";
const CHAT_MARKER = '"chat-launcher"';

/** Aborts the JS chunk that holds the chat widget; counts the aborts. */
async function blockChatChunk(page: Page) {
  const blocked = { count: 0 };
  await page.route(/\/_next\/static\/chunks\/[^/?]+\.js(?:\?|$)/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (body.includes(CHAT_MARKER)) {
      blocked.count += 1;
      await route.abort("failed");
      return;
    }
    await route.fulfill({ response: res, body });
  });
  return blocked;
}

test.describe("MEH-3946 a chat chunk that fails to load does not take the page down", () => {
  // The aborted chunk is a failed resource load by design; the guard would
  // count the browser's own "Failed to load resource" line for it.
  test.use({ loadGuard: "off" });

  test("chat chunk blocked: the page stays, with no launcher", async ({ page }) => {
    const blocked = await blockChatChunk(page);
    await page.goto("/producers", { waitUntil: "load" });
    await expect.poll(() => blocked.count, { message: "the chat chunk must have been requested and blocked", timeout: 15_000 }).toBeGreaterThan(0);

    // Inverted wait: the error screen arrives within a frame or two of the
    // failure, so 3 s without it is the evidence.
    const crashed = await page
      .getByRole("heading", { name: new RegExp(ERROR_HEADING) })
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    expect(crashed, "the error screen replaced the page after the chat chunk failed").toBe(false);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.getByTestId("chat-launcher")).toHaveCount(0);
  });

  test("control: nothing blocked, the launcher is there (the marker finds the chat chunk)", async ({ page }) => {
    await page.goto("/producers", { waitUntil: "load" });
    await expect(page.getByTestId("chat-launcher").first()).toBeAttached({ timeout: 15_000 });
  });
});
