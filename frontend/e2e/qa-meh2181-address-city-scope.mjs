/**
 * MEH-2181 self-QA — city-scoped address lookup + the soft mismatch notice,
 * driven against the REAL built wizard (npx next start) at 375 and 1440.
 *
 * The provider is STUBBED, deliberately and for two reasons: the sandbox
 * cannot reach either provider host (proxy allowlist), and the subject here is
 * what the app ASKS for and how it renders the answer — not whether the
 * provider geocodes correctly. The stub CAPTURES the outgoing query, which is
 * the strongest available evidence for the headline criterion: it is read off
 * the real bundle's real request, not off a re-implementation.
 *
 * BOTH providers are stubbed. `hasGoogleKey()` decides which one runs, and it
 * reads NEXT_PUBLIC_GOOGLE_MAPS_API_KEY at build time — which is EMPTY here
 * (the name appears only in .env.example, as documentation), so this sandbox
 * takes the Nominatim branch. Stubbing only one is how the first version of
 * this harness captured nothing: I read .env.example as configuration.
 * Covering both means the harness reports the same thing on a machine that
 * does carry a key.
 *
 * BEFORE COMMITTING: this writes raw PNGs. Run
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-2181/
 * and then DELETE the .png files — the helper writes .webp beside them rather
 * than replacing them, and every re-run re-creates the sources.
 *
 * CONTROL: the run asserts the captured query BEFORE screenshotting, and
 * asserts all captures are distinct at the end. A silent stub that never fired
 * would leave `captured` empty and fail loudly rather than photograph a page
 * that never made a request.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const OUT = "../qa-artifacts/MEH-2181";
const BASE = "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

const SELECTED_CITY = "תל אביב";
const RESOLVED_CITY = "חיפה"; // the provider disagrees — that is the point
const PLACE_ID = "qa-meh2181-place";

let failures = 0;
const checks = [];
function check(name, ok, detail = "") {
  checks.push(name);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
);

const captured = [];

async function run(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  const page = await ctx.newPage();

  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, name: "חלב וגבינות", slug: "dairy" },
        { id: 2, name: "לחמים ואפייה", slug: "bread" },
      ]),
    }),
  );

  // Nominatim (the branch this sandbox takes) — capture the q= it asked for.
  // Rows arrive FULLY RESOLVED here, so there is no details call to stub.
  await page.route("**/nominatim.openstreetmap.org/search**", (r) => {
    try {
      captured.push(new URL(r.request().url()).searchParams.get("q") ?? "");
    } catch {
      captured.push("<unparseable>");
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          place_id: 1,
          display_name: `דרך שרה, ${RESOLVED_CITY}`,
          lat: "32.794",
          lon: "34.9896",
          address: { road: "דרך שרה", city: RESOLVED_CITY },
        },
      ]),
    });
  });

  // Google (the branch a keyed machine takes) — same capture, same answer.
  await page.route("**/places.googleapis.com/v1/places:autocomplete**", (r) => {
    try {
      captured.push(JSON.parse(r.request().postData() || "{}").input ?? "");
    } catch {
      captured.push("<unparseable>");
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: [
          {
            placePrediction: {
              placeId: PLACE_ID,
              text: { text: `דרך שרה, ${RESOLVED_CITY}` },
              structuredFormat: {
                mainText: { text: "דרך שרה" },
                secondaryText: { text: RESOLVED_CITY },
              },
            },
          },
        ],
      }),
    });
  });

  // Place Details — resolve into a town that is NOT the selected one.
  await page.route("**/places.googleapis.com/v1/places/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        formattedAddress: `דרך שרה, ${RESOLVED_CITY}`,
        location: { latitude: 32.794, longitude: 34.9896 },
        addressComponents: [
          { types: ["route"], longText: "דרך שרה" },
          { types: ["locality"], longText: RESOLVED_CITY },
        ],
      }),
    }),
  );

  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`qa2181+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();

  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill(SELECTED_CITY);

  // Type an address; the debounce (450ms) then fires the scoped lookup.
  const addr = page.getByTestId("register-details-address");
  await addr.fill("דרך שרה");
  await page.waitForTimeout(1500);

  const scoped = captured.some((q) => q === `דרך שרה, ${SELECTED_CITY}`);
  check(
    `[${tag}] the REAL bundle queried the provider with the city appended`,
    scoped,
    `captured: ${JSON.stringify(captured)}`,
  );

  // Pick the suggestion → coordinates attach, and the towns disagree.
  await page.getByText("דרך שרה", { exact: false }).last().click().catch(() => {});
  const confirmed = await page
    .getByTestId("register-address-confirm")
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(`[${tag}] the address confirmation block rendered`, confirmed);

  const notice = page.getByTestId("register-address-city-mismatch");
  const shown = await notice
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  check(`[${tag}] the mismatch notice is visible`, shown);
  if (shown) {
    const text = (await notice.textContent()) ?? "";
    check(
      `[${tag}] the notice names BOTH towns`,
      text.includes(RESOLVED_CITY) && text.includes(SELECTED_CITY),
      `got: "${text.trim()}"`,
    );
    const color = await notice.evaluate((el) => getComputedStyle(el).color);
    check(`[${tag}] the notice is gold #8B6914, not an error red`, color === "rgb(139, 105, 20)", color);
    // Non-blocking: the submit path must still be reachable.
    check(
      `[${tag}] the notice does not disable the step`,
      await page.getByTestId("register-details-next").isEnabled(),
    );
  }
  await notice.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/mismatch-${tag}.png`, fullPage: true });

  await ctx.close();
}

await run(375, "375");
await run(1440, "1440");
await browser.close();

// CONTROL — the two captures must differ; identical files would mean one
// viewport never rendered (the MEH-2183 duplicate-artifact lesson).
const shots = ["mismatch-375.png", "mismatch-1440.png"];
const digests = shots.map((f) => createHash("sha256").update(readFileSync(`${OUT}/${f}`)).digest("hex"));
check("the two viewport captures are distinct images", new Set(digests).size === shots.length);

console.log(`\n${checks.length} assertions, ${failures} failed.`);
if (failures) {
  console.log("!! Screenshots in this run are VOID — a control failed.");
  process.exit(1);
}
