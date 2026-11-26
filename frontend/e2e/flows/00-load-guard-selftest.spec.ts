import { test, expect } from "./_cloudinary-stub";
import { installLoadGuard, loadGuardFailures, CONSOLE_ALLOW, CLS_LIMIT, KNOWN_CLS, type LoadGuardState } from "./_load-guard";

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
    // MEH-3893: the moved element's old and new box, so a CI log alone tells
    // a block pushed down (y grows, h same) from an element that resized.
    expect(cls[0]).toMatch(/div#content \(y-?\d+ h\d+ w\d+ → y-?\d+ h\d+ w\d+\)/);
    expect(cls[0]).toMatch(/viewport \d+x\d+ scrollY \d+/);
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

  // MEH-3879: WebKit cancels the chunk scripts of a page a test leaves while it
  // is still loading, and the old page logs ChunkLoadError. Real cases: CI job
  // 140093540361 (05-map-navigation.spec.ts:169, `goto` right after an
  // assertion) and the nightly of MEH-3879 (35-archetype-channel-smoke).
  test("a ChunkLoadError is excused only for a chunk whose request was cancelled, not one that got a 404", () => {
    const chunk = "/_next/static/chunks/3q7c6_-lg_fwp.js";
    const err = `console.error: ChunkLoadError: Failed to load chunk ${chunk} from module 760753`;
    const fails = (failedRequests: { path: string; errorText: string; status: number | null }[]) =>
      loadGuardFailures({ errors: [err], shifts: [], ready: [], failedRequests }, { browserName: "webkit", navigated: true }).length;
    // Cancelled before any response, or mid-way through its 200 body: noise.
    expect(fails([{ path: chunk, errorText: "Load request cancelled", status: null }])).toBe(0);
    expect(fails([{ path: chunk, errorText: "cancelled", status: 200 }])).toBe(0);
    // Really missing: it got a 404 first (Chromium then also fires requestfailed).
    expect(fails([{ path: chunk, errorText: "net::ERR_ABORTED", status: 404 }])).toBe(1);
    // No failed request at all, or a different chunk cancelled: not excused.
    expect(fails([])).toBe(1);
    expect(fails([{ path: "/_next/static/chunks/other.js", errorText: "cancelled", status: null }])).toBe(1);
  });

  const ABORTED_CHUNK = "/_next/static/chunks/__selftest-aborted.js";
  const MISSING_CHUNK = "/_next/static/chunks/__selftest-missing.js";
  async function loadChunks(page: import("@playwright/test").Page) {
    await page.route(`**${ABORTED_CHUNK}`, (r) => r.abort("aborted"));
    await page.route(`**${MISSING_CHUNK}`, (r) => r.fulfill({ status: 404, contentType: "text/plain", body: "nope" }));
    await servePage(`<script src="${ABORTED_CHUNK}"></script><script src="${MISSING_CHUNK}"></script>`)({ page });
    const state = await installLoadGuard(page);
    await page.goto(SELFTEST);
    return state;
  }
  const failed = (state: LoadGuardState, path: string) =>
    (state.failedRequests ?? []).filter((f) => f.path === path);

  test("the recorder marks a cancelled chunk request as having no response", async ({ page }) => {
    const state = await loadChunks(page);
    await expect.poll(() => failed(state, ABORTED_CHUNK).length).toBeGreaterThan(0);
    expect(failed(state, ABORTED_CHUNK).every((f) => f.status === null)).toBe(true);
  });

  test("the recorder keeps the 404 of a missing chunk that Chromium also reports as failed", async ({ page, browserName }) => {
    // eslint-disable-next-line playwright/no-skipped-test -- gated on the browser engine, which the product cannot move: only Chromium fires requestfailed for a script that got a 404
    test.skip(browserName !== "chromium", "only Chromium reports a 404 script as requestfailed");
    const state = await loadChunks(page);
    await expect.poll(() => failed(state, MISSING_CHUNK).map((f) => f.status)).toContain(404);
    expect(failed(state, MISSING_CHUNK).every((f) => f.status === 404)).toBe(true);
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
