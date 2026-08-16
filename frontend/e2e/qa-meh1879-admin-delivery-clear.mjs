/**
 * MEH-1879 self-QA — unticking "משלוחים" in the admin form no longer submits a
 * payload that CHECK producer_nationwide_requires_delivery rejects with a 500.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite —
 * playwright.config.ts testMatch excludes .mjs):
 *   node e2e/qa-meh1879-admin-delivery-clear.mjs [baseURL] [chromiumPath]
 *
 * WHY THE ASSERTION IS ON THE INTERCEPTED PAYLOAD, NOT ON THE UI:
 * the visible behaviour was never wrong. The nationwide block is conditionally
 * rendered (`form.offers_delivery &&`) and it disappeared correctly on untick,
 * both before and after this fix — the state behind it is what survived. A probe
 * asserting "the nationwide checkbox is gone" is green on the broken tree, which
 * is precisely the assertion that let the 500 ship. So this intercepts the
 * outbound PUT and reads the three fields off the request body.
 *
 * THE DISCRIMINATING ASSERTION is `payload-nationwide-cleared`. On the pre-fix
 * tree it reads `true` (state survived the unmount) and the probe exits 1;
 * post-fix it reads `false`. `payload-delivery-off` passes on BOTH trees — the
 * untick itself always worked — and is recorded as a control, not as evidence.
 *
 * The load gate (`delivery-checkbox-present`) runs FIRST: the admin layout
 * redirects to /login when localStorage has no token, and every assertion below
 * would then read `undefined` and pass vacuously. Same failure the MEH-1859
 * sibling documents.
 *
 * REUSES: frontend/e2e/qa-meh1859-admin-badge-column.mjs — the addInitScript
 * token seed and the /api-prefixed route patterns (an unprefixed pattern also
 * matches the PAGE url and fulfils the document navigation with JSON).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1879", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const he = JSON.parse(
  fs.readFileSync(new URL("../messages/he.json", import.meta.url), "utf8"),
);
const F = he.admin?.producers?.form?.fields;
if (!F?.offers_delivery || !F?.delivery_nationwide) {
  throw new Error("he.json admin.producers.form.fields failed to load");
}

const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium",
});

const results = [];
let failures = 0;
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify({ actual, expected })}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`, { actual, expected });
};

/** One viewport pass: run the repro sequence, capture the payload + a shot. */
async function run(width, height, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he",
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-harness-token");
  });
  await page.route(/\/api\/auth\/me$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "admin-1", role: "admin", email: "a@example.com", name: "אדמין" }),
    }),
  );
  await page.route(/\/api\/categories(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  // The producer under edit: already delivering nationwide, i.e. the live-data
  // path an admin actually hits, not the empty-form default.
  // NOTE the path: the admin EDIT page reads the PUBLIC `/producers/{id}`
  // (edit/page.js:26), not `/admin/producers/{id}`. Mocking the admin route
  // here left the page in its `fetching` branch, which is what the load gate
  // caught on the first run — the form never rendered at all.
  await page.route(/\/api\/producers\/p-qa$/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "p-qa",
        name: "עסק ארצי לבדיקה",
        city: "תל אביב",
        status: "approved",
        has_physical_location: true,
        offers_delivery: true,
        delivery_nationwide: true,
        delivery_excluded_cities: ["אילת"],
        delivery_areas: [],
        categories: [],
        images: [],
      }),
    });
  });

  // Intercept the save. Never let it reach a real backend — the point is to read
  // what the form BUILT, and a 500 from a live DB would prove the same thing
  // less legibly.
  let submitted = null;
  await page.route(/\/api\/admin\/producers\/p-qa$/, (route) => {
    const req = route.request();
    if (req.method() !== "PUT") return route.fallback();
    try {
      submitted = JSON.parse(req.postData() || "{}");
    } catch {
      submitted = { _unparseable: req.postData() };
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto(`${BASE}/he/admin/producers/p-qa/edit`, { waitUntil: "networkidle" }).catch(() => {});

  // exact:true is load-bearing — Playwright's `name` is substring-matching and
  // "משלוחים" is a prefix of "משלוחים לכל הארץ", so the loose form resolved to 3
  // checkboxes and the load gate reported 3-vs-1. (testing-library's getByRole
  // matches the full name by default, which is why the vitest twin passed.)
  const deliveryBox = page.getByRole("checkbox", { name: F.offers_delivery, exact: true });
  await deliveryBox.waitFor({ timeout: 15_000 }).catch(() => {});

  // ---- LOAD GATE, before anything reads a result ----
  assert(`${tag}/delivery-checkbox-present`, await deliveryBox.count(), 1);
  if ((await deliveryBox.count()) !== 1) {
    await page.screenshot({ path: `${OUT}/${tag}-0-load-failed.png`, fullPage: true });
    await ctx.close();
    return;
  }

  await page.screenshot({ path: `${OUT}/${tag}-1-loaded-nationwide-on.png`, fullPage: true });

  // Precondition: the form really loaded the state that can contradict.
  assert(`${tag}/precondition-delivery-on`, await deliveryBox.isChecked(), true);
  const nationwideBox = page.getByRole("checkbox", { name: F.delivery_nationwide, exact: true });
  assert(`${tag}/precondition-nationwide-on`, await nationwideBox.isChecked(), true);

  // THE REPRO: untick משלוחים.
  await deliveryBox.click();
  await page.screenshot({ path: `${OUT}/${tag}-2-after-untick.png`, fullPage: true });

  // The block unmounts — true on BOTH trees, so this is context, not evidence.
  assert(`${tag}/nationwide-control-unmounted`, await nationwideBox.count(), 0);

  await page.getByRole("button", { name: he.admin.producers.form.submit_update, exact: true }).click();
  await page.waitForTimeout(1500);

  assert(`${tag}/save-was-submitted`, submitted !== null, true);
  if (!submitted) {
    await ctx.close();
    return;
  }
  console.log(`${tag} payload:`, JSON.stringify(submitted, null, 1));

  // CONTROL — passes on both trees. The untick itself was never broken.
  assert(`${tag}/payload-delivery-off`, submitted.offers_delivery, false);
  // THE DISCRIMINATING ONE — `true` on the pre-fix tree.
  assert(`${tag}/payload-nationwide-cleared`, submitted.delivery_nationwide, false);
  // The cross-table sibling: stale rows on a non-delivering business.
  assert(`${tag}/payload-areas-cleared`, submitted.delivery_area_cities, []);
  assert(`${tag}/payload-excluded-cleared`, submitted.delivery_excluded_cities, []);

  await page.screenshot({ path: `${OUT}/${tag}-3-after-save.png`, fullPage: true });
  await ctx.close();
}

await run(375, 812, "375");
await run(1440, 950, "1440");

results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
