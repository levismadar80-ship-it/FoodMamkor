import { test, expect } from "./_cloudinary-stub";
import { installLoadGuard, loadGuardFailures, CONSOLE_ALLOW, CLS_LIMIT } from "./_load-guard";

/**
 * MEH-3809 self-test for the load guard (testing.md «A classifier ships a
 * self-test»). Every case runs the REAL guard (`_load-guard.ts`), on pages
 * served by page.route so the answer is known in advance, plus one case on the
 * real home page so the probe is shown alive against the app itself.
 *
 * The guard's own teardown is off in this file (`loadGuard: "off"`): these
 * pages misbehave on purpose. Each test installs the guard by hand and asserts
 * what it found.
 */
test.use({ loadGuard: "off" });

const SELFTEST = "/__load-guard-selftest";

function servePage(body: string) {
  return async ({ page }: { page: import("@playwright/test").Page }) => {
    await page.route(`**${SELFTEST}`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><body>${body}</body></html>` }),
    );
  };
}

const LATE_BLOCK = `
  <div id="content" style="height:2000px;background:#eee">content</div>
  <script>
    setTimeout(() => {
      const b = document.createElement("div");
      b.id = "late-banner";
      b.style.height = "400px";
      document.body.prepend(b);
    }, 300);
  </script>`;

const STABLE = `<div id="content" style="height:2000px;background:#eee">content</div>`;

async function settle(page: import("@playwright/test").Page) {
  // Two animation frames after the late block's timer: the shift is reported.
  // A fixed wait on purpose: the page's own 300 ms timer is the subject, and
  // "no shift happened" has nothing in the DOM to await.
  await page.waitForTimeout(800);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe("load guard self-test (MEH-3809)", () => {
  test("a block inserted 300 ms after load fails the CLS check, naming the page", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries exist only in Chromium; the guard says so instead of reading 0");
    await servePage(LATE_BLOCK)({ page });
    const state = await installLoadGuard(page);
    await page.goto(SELFTEST);
    await settle(page);
    const failures = loadGuardFailures(state, { browserName, navigated: true });
    const cls = failures.filter((f) => f.startsWith("layout shift:"));
    expect(cls, failures.join("\n")).toHaveLength(1);
    expect(cls[0]).toContain(SELFTEST);
    expect(cls[0]).toContain(`> ${CLS_LIMIT}`);
  });

  test("the same page without the late block is clean", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries exist only in Chromium");
    await servePage(STABLE)({ page });
    const state = await installLoadGuard(page);
    await page.goto(SELFTEST);
    await settle(page);
    expect(state.ready.some((r) => r.supported), "observer never reported installed").toBe(true);
    expect(loadGuardFailures(state, { browserName, navigated: true })).toEqual([]);
  });

  test("an app console.error and a pageerror fail; the browser's network log does not", async ({ page, browserName }) => {
    await servePage(`
      <script>
        console.error("SENTINEL: a real application error");
        console.error("Failed to load resource: the server responded with a status of 404 ()");
        setTimeout(() => { throw new Error("SENTINEL uncaught"); }, 0);
      </script>${STABLE}`)({ page });
    const state = await installLoadGuard(page);
    await page.goto(SELFTEST);
    await settle(page);
    const failures = loadGuardFailures(state, { browserName, navigated: true });
    expect(failures.some((f) => f.includes("SENTINEL: a real application error")), failures.join("\n")).toBe(true);
    expect(failures.some((f) => f.startsWith("pageerror:") && f.includes("SENTINEL uncaught")), failures.join("\n")).toBe(true);
    expect(failures.some((f) => f.includes("Failed to load resource")), failures.join("\n")).toBe(false);
  });

  test("a hydration error fails even when an allowlist entry would match it", async ({ browserName }) => {
    const state = { errors: ["console.error: Uncaught Error: Minified React error #418; visit https://react.dev/errors/418"], shifts: [], ready: [] };
    const failures = loadGuardFailures(state, {
      browserName,
      navigated: false,
      allow: [{ pattern: /.*/, reason: "match-everything, for the test", card: "MEH-3809" }],
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^hydration mismatch/);
  });

  test("CONSOLE_ALLOW does not swallow arbitrary text", () => {
    expect(CONSOLE_ALLOW.some((a) => a.pattern.test("SENTINEL: a real application error"))).toBe(false);
  });

  test("on Chromium, a probe that never reported fails instead of reading green", () => {
    const failures = loadGuardFailures({ errors: [], shifts: [], ready: [] }, { browserName: "chromium", navigated: true });
    expect(failures.some((f) => f.includes("observer never reported"))).toBe(true);
  });

  test("on the real home page the probe is alive", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "layout-shift entries exist only in Chromium");
    const state = await installLoadGuard(page);
    await page.goto("/");
    await expect(page.getByTestId("hero-search")).toBeVisible({ timeout: 15_000 });
    expect(state.ready.some((r) => r.supported), "observer never reported installed on /").toBe(true);
  });
});
