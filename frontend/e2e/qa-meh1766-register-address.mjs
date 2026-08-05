/**
 * MEH-1766 self-QA — proves step 2's address field is the canonical
 * AddressSearch and that the empty-result hint renders.
 *
 * No backend is needed. RegisterProducerClient.jsx:110 boots straight to
 * STEP.DETAILS when a `token` is present in localStorage, so seeding one via
 * addInitScript lands us on step 2 with zero API calls. The provider request
 * is intercepted, so both scenarios are deterministic and offline:
 *
 *   A — Nominatim answers with two real rows  -> suggestions dropdown open
 *   B — Nominatim answers 403                 -> visible hint, free text kept
 *
 * Run from frontend/ with `next start` on :3000:
 *   node e2e/qa-meh1766-register-address.mjs [outdir]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1766",
);
const BASE = "http://127.0.0.1:3000";
const URL = `${BASE}/he/register/producer`;
const NOMINATIM = "**nominatim.openstreetmap.org**";

const ROWS = [
  {
    place_id: 1,
    display_name: "דרך שרה, רמת צבי, זכרון יעקב",
    lat: "32.5731",
    lon: "34.9512",
    address: { road: "דרך שרה", neighbourhood: "רמת צבי", city: "זכרון יעקב" },
  },
  {
    place_id: 2,
    display_name: "דרך שרה אהרונסון, זכרון יעקב",
    lat: "32.5740",
    lon: "34.9530",
    address: { road: "דרך שרה אהרונסון", city: "זכרון יעקב" },
  },
];

const failures = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures.push(name);
  }
}

async function openStep2(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 812 : 900 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  // Boot straight to STEP.DETAILS (RegisterProducerClient.jsx:110).
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-meh1766-fake-token");
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Navigate to step 2. The route opens on RegisterPreflight (entry chrome);
 *  its single CTA hands off to the step machinery, which is already sitting on
 *  STEP.DETAILS thanks to the seeded token. */
async function gotoStep2(page) {
  // auth-context.js:64 validates the seeded token against GET /auth/me and
  // clears it on failure (:74), which would drop us back to STEP.ACCOUNT. Serve
  // a consumer who does not yet own a producer so the token survives and
  // RegisterProducerClient.jsx:110 keeps its STEP.DETAILS init.
  await page.route("**/auth/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 4242,
        email: "qa-meh1766@example.com",
        name: "QA",
        role: "user",
        is_producer: false,
        producer_id: null,
      }),
    }),
  );
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const start = page.getByTestId("register-preflight-start");
  await start.waitFor({ state: "visible", timeout: 15000 });
  await start.click();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--ssl-version-max=tls1.2"],
  });

  for (const width of [375, 1440]) {
    // --- Scenario A: provider returns rows -> suggestions render -------------
    {
      const { ctx, page } = await openStep2(browser, width);
      await page.route(NOMINATIM, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }),
      );
      await gotoStep2(page);

      const field = page.getByTestId("register-details-address");
      await field.waitFor({ state: "visible", timeout: 15000 });

      // The canonical component renders a combobox; the old raw <Input> did not.
      const role = await field.getAttribute("role");
      check(`[${width}] address field is a combobox (canonical AddressSearch)`, role === "combobox", `role=${role}`);

      await field.fill("דרך שרה");
      const option = page.getByRole("option").first();
      await option.waitFor({ state: "visible", timeout: 8000 });
      const count = await page.getByRole("option").count();
      check(`[${width}] scenario A: suggestions render`, count === 2, `count=${count}`);

      await page.screenshot({ path: path.join(OUT, `register-address-suggestions-${width}.png`), fullPage: false });

      // Picking a row fills the address text.
      await option.click();
      await page.waitForTimeout(500);
      const filled = await field.inputValue();
      check(`[${width}] scenario A: pick fills the address text`, filled.includes("דרך שרה"), `value=${filled}`);
      await ctx.close();
    }

    // --- Scenario B: provider rejects -> visible hint, free text kept --------
    {
      const { ctx, page } = await openStep2(browser, width);
      await page.route(NOMINATIM, (r) => r.fulfill({ status: 403, body: "forbidden" }));
      await gotoStep2(page);

      const field = page.getByTestId("register-details-address");
      await field.waitFor({ state: "visible", timeout: 15000 });
      await field.fill("דרך שרה");

      const hint = page.getByTestId("address-search-no-results-hint");
      await hint.waitFor({ state: "visible", timeout: 8000 });
      check(`[${width}] scenario B: hint is visible on provider rejection`, true);

      // The hint must NOT be an error/validation state — free text survives.
      const stillTyped = await field.inputValue();
      check(`[${width}] scenario B: free text is preserved`, stillTyped === "דרך שרה", `value=${stillTyped}`);
      const invalid = await field.getAttribute("aria-invalid");
      check(`[${width}] scenario B: field is NOT marked invalid`, invalid === null, `aria-invalid=${invalid}`);

      await page.screenshot({ path: path.join(OUT, `register-address-hint-${width}.png`), fullPage: false });
      await ctx.close();
    }
  }

  await browser.close();
  console.log(failures.length ? `\nFAILED: ${failures.join(", ")}` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
