import { test, expect } from "@playwright/test";

/**
 * MEH-2427 — the home-screen app's status bar is opaque.
 *
 * With `black-translucent` iOS draws the clock and battery OVER the page, and
 * the sticky header (top-0, no viewport-fit=cover so env(safe-area-inset-top)
 * is 0) scrolled up under them (Sapir's /map screenshot, 27/10). `default`
 * makes the page start below the status bar. Read off the served HTML — the
 * tag iOS actually consumes — not off the metadata object.
 */
test("apple-mobile-web-app-status-bar-style is default, not black-translucent", async ({ request }) => {
  for (const path of ["/", "/en"]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    const tag = html.match(/<meta[^>]+name="apple-mobile-web-app-status-bar-style"[^>]*>/);
    expect(tag, `${path}: tag present`).not.toBeNull();
    expect(tag![0]).toContain('content="default"');
  }
});
