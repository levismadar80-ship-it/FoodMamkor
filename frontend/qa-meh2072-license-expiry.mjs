/**
 * MEH-2072 self-QA — the admin licence-expiry field at 375 and 1440.
 *
 * Stubs the API rather than booting a backend: `alembic upgrade` is denied to
 * CC (.claude/settings.json:317), so there is no sanctioned way to build a real
 * schema locally, and scripts/local-backend.sh runs exactly that command.
 * The admin edit page is "use client" (page.js:1), so page.route() reaches its
 * fetches — unlike the SSR /producers feed that defeated the MEH-1854 harness.
 *
 * WHAT THIS PROVES: the field renders, is labelled with the locked copy,
 * hydrates from the admin payload, and does not overflow at either width.
 * WHAT IT DOES NOT PROVE: that the column exists (no DB) or that a real save
 * round-trips (no backend). Those are pytest's job and Sapir's post-deploy check.
 *
 * The controls are the point — every "not found" this harness could report is
 * paired with something that MUST be found, so a dead page cannot read as a pass.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3100";
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "qa-artifacts/MEH-2072";
const PRODUCER_ID = "11111111-2222-3333-4444-555555555555";

const ADMIN = {
  id: "11111111-0000-0000-0000-000000000001",
  email: "admin@example.com",
  role: "admin",
  name: "ספיר",
};

const PRODUCER = {
  id: PRODUCER_ID,
  name: "מאפיית הגליל",
  slug: "galil-bakery",
  city: "צפת",
  description: "מאפייה משפחתית",
  short_description: "מאפייה משפחתית",
  status: "approved",
  images: [],
  categories: [{ id: 1, name: "מאפים" }],
  products: [],
  delivery_areas: [],
  // The two fields under test — both admin-only, both previously wiped on save.
  producer_license_number: "1234567",
  license_expires_at: "2026-09-10",
  address: "הרצל 1",
  phone: "0501234567",
  contact_name: "רותי",
  primary_contact_method: "whatsapp",
  availability_state: "accepting_orders",
  has_physical_location: true,
  offers_delivery: false,
  business_days_waiting: 0,
};

let OVERFLOW_WITH_FIELD = null;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function run() {
  mkdirSync(OUT, { recursive: true });
  // The sandbox's pre-installed Chromium, not a downloaded one: this repo's
  // @playwright/test pin resolves to a build revision the image does not carry,
  // and `playwright install` is forbidden here (the browsers are baked in).
  const browser = await chromium.launch({
    executablePath: process.env.QA_CHROMIUM ?? CHROMIUM,
    args: ["--ssl-version-max=tls1.2"],
  });

  for (const [label, width, height] of [
    ["375", 375, 812],
    ["1440", 1440, 900],
  ]) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();

    await page.addInitScript(
      ([token, user]) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", user);
      },
      ["qa-fake-admin-token", JSON.stringify(ADMIN)],
    );

    // Catch-all FIRST: Playwright matches routes in REVERSE registration order,
    // so the specific handlers below still win. Without it, any /api/* this page
    // fetches that I did not stub falls through to next.config.js's rewrite ->
    // localhost:8000 -> ECONNREFUSED, which killed the dev server outright on the
    // first attempt. An unstubbed request must fail closed and cheap, not escape
    // the harness.
    await page.route("**/api/**", (r) => r.fulfill(json([])));
    await page.route(`**/api/admin/producers/${PRODUCER_ID}`, (r) =>
      r.fulfill(json(PRODUCER)),
    );
    await page.route("**/api/auth/me", (r) => r.fulfill(json(ADMIN)));
    await page.route("**/api/categories**", (r) =>
      r.fulfill(json([{ id: 1, name: "מאפים" }])),
    );

    await page.goto(`${BASE}/he/admin/producers/${PRODUCER_ID}/edit`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });

    // CONTROL 1 — the form actually rendered. Every "not found" below is void
    // if this fails, because an error page has no fields to miss.
    const nameInput = page.locator('input[value="מאפיית הגליל"]');
    await nameInput.first().waitFor({ state: "visible", timeout: 25_000 }).catch(() => {});
    const rendered = await nameInput.count();
    check(
      `[${label}] CONTROL: edit form rendered for the stubbed producer`,
      rendered > 0,
      `name inputs found: ${rendered}`,
    );

    const expiry = page.locator("#admin-producer-license-expires");
    const licenseNum = page.locator("#admin-producer-license");

    // CONTROL 2 — the licence NUMBER hydrated. This is the pre-existing bug the
    // scope extension fixed; if it is empty, the admin payload never reached the
    // form and the expiry assertion below would be measuring the same nothing.
    const numVal = await licenseNum.inputValue().catch(() => null);
    check(
      `[${label}] CONTROL: licence number hydrated from the admin payload`,
      numVal === "1234567",
      `value=${JSON.stringify(numVal)}`,
    );

    check(
      `[${label}] expiry field is present and visible`,
      await expiry.isVisible().catch(() => false),
    );

    const expVal = await expiry.inputValue().catch(() => null);
    check(
      `[${label}] expiry hydrated from license_expires_at`,
      expVal === "2026-09-10",
      `value=${JSON.stringify(expVal)}`,
    );

    check(
      `[${label}] expiry input is type=date`,
      (await expiry.getAttribute("type").catch(() => null)) === "date",
    );

    const labelText = await page
      .locator('label:has-text("תוקף רישיון")')
      .first()
      .textContent()
      .catch(() => null);
    check(
      `[${label}] label reads the locked Hebrew copy`,
      (labelText ?? "").includes("תוקף רישיון (מהמסמך)"),
      JSON.stringify(labelText),
    );

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    if (label === "375") OVERFLOW_WITH_FIELD = overflow;
    // Reported, not asserted: attribution comes from the baseline control at the
    // end of this run, not from the raw number.
    check(`[${label}] horizontal page overflow = ${overflow}px`, true, "see ATTRIBUTION below");

    const box = await expiry.boundingBox().catch(() => null);
    check(
      `[${label}] expiry field fits inside the viewport`,
      !!box && box.x >= 0 && box.x + box.width <= width + 1,
      box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "no box",
    );

    await expiry.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({
      path: `${OUT}/admin-license-expiry-${label}.png`,
      fullPage: true,
    });
    await ctx.close();
  }

  // BASELINE CONTROL — the same page at 375 with BOTH licence fields empty, so
  // ProducerLicenseField renders its collapsed toggle and my date input is not
  // in the DOM at all. This is what separates "my field overflows" from "this
  // admin form already overflowed"; without it, an overflow number is just a
  // number with no attribution.
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.addInitScript(
      ([token, user]) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", user);
      },
      ["qa-fake-admin-token", JSON.stringify(ADMIN)],
    );
    await page.route("**/api/**", (r) => r.fulfill(json([])));
    await page.route(`**/api/admin/producers/${PRODUCER_ID}`, (r) =>
      r.fulfill(
        json({ ...PRODUCER, producer_license_number: null, license_expires_at: null }),
      ),
    );
    await page.route("**/api/auth/me", (r) => r.fulfill(json(ADMIN)));
    await page.route("**/api/categories**", (r) =>
      r.fulfill(json([{ id: 1, name: "מאפים" }])),
    );
    await page.goto(`${BASE}/he/admin/producers/${PRODUCER_ID}/edit`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .locator('input[value="מאפיית הגליל"]')
      .first()
      .waitFor({ state: "visible", timeout: 25_000 })
      .catch(() => {});

    const fieldAbsent = (await page.locator("#admin-producer-license-expires").count()) === 0;
    check(
      "[baseline-375] CONTROL: expiry field really is absent in this run",
      fieldAbsent,
      "if this fails the baseline is measuring the same page and proves nothing",
    );
    const baseOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    check(
      `[baseline-375] overflow WITHOUT the new field = ${baseOverflow}px`,
      true,
      "attribution reference, not a pass/fail",
    );
    console.log(
      `\nATTRIBUTION: overflow with field = ${OVERFLOW_WITH_FIELD}px, ` +
        `without = ${baseOverflow}px -> ` +
        (baseOverflow === OVERFLOW_WITH_FIELD
          ? "PRE-EXISTING, not caused by this diff"
          : "CHANGED by this diff — investigate"),
    );
    await page.screenshot({ path: `${OUT}/baseline-375-no-field.png`, fullPage: true });
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(
      "FAILED:\n" + failed.map((f) => `  - ${f.name} (${f.detail})`).join("\n"),
    );
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
