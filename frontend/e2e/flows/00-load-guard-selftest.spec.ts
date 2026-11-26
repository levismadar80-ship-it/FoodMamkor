import { test, expect } from "./_cloudinary-stub";
import { installLoadGuard, loadGuardFailures, CONSOLE_ALLOW, CLS_LIMIT, KNOWN_CLS } from "./_load-guard";

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
    }, 1000);
  </script>`;

const STABLE = `<div id="content" style="height:2000px;background:#eee">content</div>`;

async function settle(page: import("@playwright/test").Page) {
  // Two animation frames after the late block's timer: the shift is reported.
  // A fixed wait on purpose: the page's own 1 s timer is the subject, and
  // "no shift happened" has nothing in the DOM to await.
  await page.waitForTimeout(1500);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe("load guard self-test (MEH-3809)", () => {
  test("a block inserted 1 s after load fails the CLS check, naming the page", async ({ page, browserName }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: layout-shift entries are Chromium-only
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
    // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: layout-shift entries are Chromium-only
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

  test("WebKit's cancelled-fetch pageerror is allowed on WebKit only, and only as a pageerror", () => {
    const cancelled = "pageerror: Fetch API cannot load https://localhost:3443/api/categories due to access control checks.";
    const state = (e: string) => ({ errors: [e], shifts: [], ready: [] });
    expect(loadGuardFailures(state(cancelled), { browserName: "webkit", navigated: false })).toEqual([]);
    expect(loadGuardFailures(state(cancelled), { browserName: "chromium", navigated: false })).toHaveLength(1);
    const asConsole = cancelled.replace(/^pageerror: /, "console.error: ");
    expect(loadGuardFailures(state(asConsole), { browserName: "webkit", navigated: false })).toHaveLength(1);
  });

  test("the Speed Insights refusal is allowed; another refused script is not", () => {
    const state = (e: string) => ({ errors: [e], shifts: [], ready: [] });
    const si =
      'console.error: Refused to execute https://localhost:3443/_vercel/speed-insights/script.js as script because "X-Content-Type-Options: nosniff" was given';
    expect(loadGuardFailures(state(si), { browserName: "webkit", navigated: false })).toEqual([]);
    const other = si.replace("/_vercel/speed-insights/script.js", "/_next/static/chunks/app.js");
    expect(loadGuardFailures(state(other), { browserName: "webkit", navigated: false })).toHaveLength(1);
    // Chromium's wording for the same refusal, read off the first Chromium run.
    const siChromium =
      "console.error: Refused to execute script from 'http://localhost:3000/_vercel/speed-insights/script.js' because its MIME type ('text/plain') is not executable, and strict MIME type checking is enabled.";
    expect(loadGuardFailures(state(siChromium), { browserName: "chromium", navigated: false })).toEqual([]);
    const otherChromium = siChromium.replace("/_vercel/speed-insights/script.js", "/_next/static/chunks/app.js");
    expect(loadGuardFailures(state(otherChromium), { browserName: "chromium", navigated: false })).toHaveLength(1);
  });

  test("KNOWN_CLS: a listed page passes under its ceiling, fails above it; an unlisted page and errors still fail", () => {
    const shifted = (url: string, v: number, errors: string[] = []) => ({
      errors,
      shifts: [{ doc: 1, url, t: 500, v, src: "div#x" }],
      ready: [{ doc: 1, supported: true }],
    });
    const run = (s: ReturnType<typeof shifted>, cls?: boolean) =>
      loadGuardFailures(s, { browserName: "chromium", navigated: true, cls });
    // Anchored to a real row: the dashboard, at a value measured on PR #5280.
    expect(KNOWN_CLS.some((k) => k.card === "MEH-3817")).toBe(true);
    expect(run(shifted("/producer/dashboard/edit?group=products", 0.548))).toEqual([]);
    expect(run(shifted("/en/producer/dashboard/edit", 0.55))).toEqual([]);
    // A row removed when its fix merged: the dashboard home now fails at 0.1.
    expect(run(shifted("/producer/dashboard", 0.3))).toHaveLength(1);
    // Worse than the ceiling: still red, and says it got worse.
    const worse = run(shifted("/producer/dashboard/edit", 1.6));
    expect(worse).toHaveLength(1);
    expect(worse[0]).toContain("got worse");
    // A page that is not listed fails at the plain limit, a lookalike path too.
    expect(run(shifted("/producers", CLS_LIMIT + 0.05))).toHaveLength(1);
    expect(run(shifted("/producer/dashboard/editx", 0.3))).toHaveLength(1);
    // MEH-3878: /recommend passes under 0.62, fails above it; a lookalike fails.
    expect(run(shifted("/recommend", 0.41))).toEqual([]);
    expect(run(shifted("/recommend", 0.7))).toHaveLength(1);
    expect(run(shifted("/recommendx", 0.41))).toHaveLength(1);
    // A row with a query covers that state only (MEH-3887: home with a city).
    expect(KNOWN_CLS.some((k) => k.card === "MEH-3887" && k.query)).toBe(true);
    expect(run(shifted("/?city=haifa", 0.105))).toEqual([]);
    expect(run(shifted("/en?view=list&city=haifa", 0.105))).toEqual([]);
    expect(run(shifted("/", 0.105))).toHaveLength(1);
    expect(run(shifted("/?view=list", 0.105))).toHaveLength(1);
    // A listed page never hides an error.
    expect(run(shifted("/producer/dashboard/edit", 0.3, ["pageerror: boom"]))).toEqual(["pageerror: boom"]);
    // "errors" mode (cls: false) drops CLS only.
    expect(run(shifted("/producers", 0.9), false)).toEqual([]);
    expect(run(shifted("/producers", 0.9, ["console.error: boom"]), false)).toEqual(["console.error: boom"]);
  });

  test("Google sign-in noise from the localhost origin is allowed; our own CORS and other CSP refusals are not", () => {
    const state = (e: string) => ({ errors: [e], shifts: [], ready: [] });
    const fails = (e: string) => loadGuardFailures(state(e), { browserName: "chromium", navigated: false }).length;
    expect(fails("console.error: [GSI_LOGGER]: The given origin is not allowed for the given client ID.")).toBe(0);
    const gsiCors =
      "console.error: Access to XMLHttpRequest at 'https://accounts.google.com/gsi/style' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.";
    expect(fails(gsiCors)).toBe(0);
    expect(fails(gsiCors.replace("https://accounts.google.com/gsi/style", "https://staging.mehamakor.co.il/api/producers"))).toBe(1);
    expect(fails(gsiCors.replace("http://localhost:3000", "https://mehamakor.co.il"))).toBe(1);
    const bread =
      "console.error: Loading the image 'https://bread.jpg/' violates the following Content Security Policy directive: \"img-src 'self' https://res.cloudinary.com\".";
    expect(fails(bread)).toBe(0);
    expect(fails(bread.replace("https://bread.jpg/", "https://evil.example.com/x.png"))).toBe(1);
  });

  test("on Chromium, a probe that never reported fails instead of reading green", () => {
    const failures = loadGuardFailures({ errors: [], shifts: [], ready: [] }, { browserName: "chromium", navigated: true });
    expect(failures.some((f) => f.includes("observer never reported"))).toBe(true);
  });

  test("on the real home page the probe is alive", async ({ page, browserName }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: layout-shift entries are Chromium-only
    test.skip(browserName !== "chromium", "layout-shift entries exist only in Chromium");
    const state = await installLoadGuard(page);
    await page.goto("/");
    await expect(page.getByTestId("hero-search")).toBeVisible({ timeout: 15_000 });
    expect(state.ready.some((r) => r.supported), "observer never reported installed on /").toBe(true);
  });
});
