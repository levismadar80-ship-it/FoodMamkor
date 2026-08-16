/**
 * MEH-1808 self-QA — post-select location confirmation on the register address
 * field, in a real browser at mobile 390px and desktop 1440px.
 *
 *   A — type "דרך שרה" → pick a suggestion → confirmation line naming the
 *       street + city, and a real Leaflet map with a pin. NOT coordinates.
 *   B — type without picking → soft, non-blocking nudge; the step still
 *       advances (the address is optional and must stay optional).
 *   C — a SECOND pick moves the pin and updates the line; typing over a
 *       confirmed address retires both (stale coordinates never survive).
 *
 * The Nominatim provider is intercepted so both scenarios are deterministic and
 * offline; RegisterProducerClient boots straight to STEP.DETAILS when a `token`
 * is present, so no account walk is needed.
 *
 * Run from frontend/ with `next start` on :3000:
 *   node e2e/qa-meh1808-address-confirm.mjs [outdir]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1808",
);
const URL = "http://127.0.0.1:3000/register/producer";
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
    display_name: "דרך שרה אהרונסון, חיפה",
    lat: "32.7940",
    lon: "34.9896",
    address: { road: "דרך שרה אהרונסון", city: "חיפה" },
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

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("token", "qa-meh1808-token");
    } catch {}
  });
  const page = await ctx.newPage();
  // auth-context validates the seeded token against /auth/me and clears it on
  // failure, which would drop the wizard back to STEP.ACCOUNT.
  await page.route("**/auth/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 4242,
        email: "qa-meh1808@example.com",
        name: "QA",
        role: "user",
        is_producer: false,
        producer_id: null,
      }),
    }),
  );
  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, name: "סבונים טבעיים" }]),
    }),
  );
  await page.route(NOMINATIM, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }),
  );
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-frame-details").waitFor();
  return { ctx, page };
}

async function pickSuggestion(page, text, optionIndex = 0) {
  const field = page.getByTestId("register-details-address");
  // Clear first: after a pick the field already holds the chosen street, and
  // filling the identical string fires no change event, so no query runs and no
  // dropdown reopens. Clearing makes the second pick a real interaction.
  await field.fill("");
  await field.fill(text);
  const option = page.getByRole("option").nth(optionIndex);
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();
}

async function run(browser, label, width, height) {
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  const { ctx, page } = await open(browser, width, height);

  // The optional-address microcopy is always present, in every state.
  check(
    `${label} 0 optional-address microcopy present`,
    (await page.getByText("אין כתובת מדויקת? היישוב מספיק.").count()) === 1,
  );

  // ---- B (first, while the field is still unpicked) -------------------
  await page.getByTestId("register-details-address").fill("דרך שרה");
  check(
    `${label} B1 typed-no-pick shows the soft nudge`,
    await page.getByTestId("register-address-no-pick-hint").isVisible(),
  );
  check(
    `${label} B2 no confirmation while unpicked`,
    (await page.getByTestId("register-address-confirm").count()) === 0,
  );
  const hintColor = await page
    .getByTestId("register-address-no-pick-hint")
    .evaluate((el) => getComputedStyle(el).color);
  check(
    `${label} B3 nudge is NOT error-red (address stays optional)`,
    !/rgb\(2[0-5][0-9],\s*[0-6][0-9],/.test(hintColor),
    `color: ${hintColor}`,
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-B-no-pick-hint.png`),
    fullPage: true,
  });

  // ---- A: pick a suggestion -------------------------------------------
  await pickSuggestion(page, "דרך שרה", 0);
  const confirm = page.getByTestId("register-address-confirm");
  await confirm.waitFor({ timeout: 10_000 });
  const confirmText = (await confirm.textContent()) || "";
  check(`${label} A1 confirmation row appears`, true);
  check(
    `${label} A2 names the street + city, not coordinates`,
    confirmText.includes("דרך שרה") && confirmText.includes("זכרון יעקב"),
    `got: ${JSON.stringify(confirmText.trim())}`,
  );
  check(
    `${label} A3 no raw lat/lng leaked into the copy`,
    !confirmText.includes("32.57") && !confirmText.includes("34.95"),
  );
  check(
    `${label} A4 the nudge is gone (states are exclusive)`,
    (await page.getByTestId("register-address-no-pick-hint").count()) === 0,
  );
  // A REAL Leaflet map, not a placeholder div.
  await page.locator(".leaflet-container").first().waitFor({ timeout: 15_000 });
  const tiles = await page.locator(".leaflet-container img.leaflet-tile").count();
  // NB: this asserts the map REQUESTED a tile grid, which is NOT the same as
  // tiles being painted — a tile <img> exists in the DOM even when its fetch
  // fails, so "count > 0" would be green for two different reasons. The
  // painted-vs-not question is measured separately, right below.
  check(
    `${label} A5 leaflet tile grid mounted (elements, not pixels)`,
    tiles > 0,
    `tiles: ${tiles}`,
  );
  // Honest reporting of a sandbox limitation: a.tile.openstreetmap.org is
  // blocked by the CC egress proxy (measured: net::ERR_TUNNEL_CONNECTION_FAILED,
  // every tile naturalWidth 0), so the screenshots show an EMPTY canvas here.
  // That is the environment, not the component — informational and never
  // pass/fail, since it would red for a reason no diff can fix. Tile imagery
  // has to be eyeballed on a real preview.
  const painted = await page
    .locator(".leaflet-container img.leaflet-tile")
    .evaluateAll((imgs) => imgs.filter((i) => i.naturalWidth > 0).length);
  console.log(
    `  INFO  ${label} tile imagery painted: ${painted}/${tiles}` +
      (painted === 0
        ? "  (sandbox blocks OSM tiles — verify visually on the preview)"
        : ""),
  );
  const pins = await page.locator(".leaflet-container .leaflet-marker-icon").count();
  check(`${label} A6 a pin is rendered`, pins >= 1, `pins: ${pins}`);
  // MEH-1808's showNavigation={false} — no "navigate to your own shop" pills.
  const bodyText = (await page.locator("body").innerText()) || "";
  check(
    `${label} A7 no Waze / Google navigation pills in the form`,
    !bodyText.includes("Waze") && !bodyText.includes("מפות Google"),
  );
  // ODbL: attribution must still be present on this map (MEH-1633).
  check(
    `${label} A8 OSM attribution present (ODbL)`,
    (await page.locator(".leaflet-container .leaflet-control-attribution").count()) === 1,
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-A-confirmed.png`),
    fullPage: true,
  });

  // ---- C: a second pick updates pin + text ----------------------------
  await pickSuggestion(page, "דרך שרה", 1);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="register-address-confirm"]')
        ?.textContent?.includes("חיפה"),
    null,
    { timeout: 10_000 },
  );
  const second = (await confirm.textContent()) || "";
  check(
    `${label} C1 second pick updates the confirmation to the new city`,
    second.includes("חיפה") && !second.includes("זכרון יעקב"),
    `got: ${JSON.stringify(second.trim())}`,
  );
  check(
    `${label} C2 map still rendered after the second pick`,
    (await page.locator(".leaflet-container .leaflet-marker-icon").count()) >= 1,
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-C-second-pick.png`),
    fullPage: true,
  });

  // typing over a confirmed address must retire both the line and the map
  await page.getByTestId("register-details-address").fill("רחוב אחר לגמרי");
  check(
    `${label} C3 typing over a pick retires the confirmation (no stale pin)`,
    (await page.getByTestId("register-address-confirm").count()) === 0,
  );
  check(
    `${label} C4 the nudge returns`,
    await page.getByTestId("register-address-no-pick-hint").isVisible(),
  );

  // ---- B4: the address is still OPTIONAL — the step advances unpicked --
  await page.getByTestId("register-details-name").fill("הבית של רותי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-next").click();
  await page.getByTestId("register-frame-category").waitFor({ timeout: 10_000 });
  check(`${label} B4 step advances with an unpicked address (still optional)`, true);

  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
// Sandbox pins a Chromium older than the one @playwright/test wants to fetch.
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
await run(browser, "mobile", 390, 844);
await run(browser, "desktop", 1440, 900);
await browser.close();

console.log(
  `\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILED: ${failures.join(", ")}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
