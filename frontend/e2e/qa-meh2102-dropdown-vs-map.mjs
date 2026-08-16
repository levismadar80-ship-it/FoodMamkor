/**
 * MEH-2102 — does a Leaflet map actually overlap either city dropdown on the
 * registration DETAILS step?
 *
 * The ticket asserts the MiniMap "renders below the city field exactly as below
 * the address field". Source reading disagreed, so this measures it: it renders
 * the real page, opens each dropdown, and reports the BOUNDING BOXES plus
 * whether they intersect the map's box. Geometry, not opinion.
 *
 * CONTROL (read this before trusting any "no overlap" below): the script asserts
 * the map box and each dropdown box are non-null and non-zero BEFORE comparing.
 * A dropdown that never opened has no box, and "no box" would otherwise print as
 * "no overlap" — the reassuring answer from a dead probe. If a control line says
 * MISSING, every verdict in that run is void.
 *
 * Usage: node e2e/qa-meh2102-dropdown-vs-map.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-2102";
const CITIES = ["תל אביב-יפו", "תל מונד","רמת גן", "גבעתיים", "הרצליה", "רעננה"];

const rect = (b) => (b ? `x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.width)} h=${Math.round(b.height)}` : "MISSING");
const overlaps = (a, b) =>
  a && b && a.width > 0 && b.width > 0 &&
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // The repo pins a @playwright/test whose expected browser build is absent in
  // the CC sandbox; /opt/pw-browsers ships 1194. Sandbox-only, per the harness
  // note — CI resolves its own browser and never reads this path.
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--ssl-version-max=tls1.2"],
  });
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });

  // Static data the page would otherwise fetch from a backend we do not run.
  await page.route("**/api/cities**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify(CITIES) }));
  await page.route("**/api/categories**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 1, name: "מאפים" }]) }));
  // Without this the auth context fails the token and clears it, and the wizard
  // falls back to the ACCOUNT frame — no DETAILS step, no map, nothing to measure.
  await page.route("**/api/auth/me**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: 1, email: "qa@mehamakor.test", name: "בדיקה", role: "user" }) }));

  // token ⇒ the wizard boots straight to STEP.DETAILS (RegisterProducerClient:223).
  // The draft carries lat/lng, which is the whole of `addressConfirmed` (:340) and
  // therefore the only thing gating the MiniMap mount (:1206).
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-meh2102");
    localStorage.setItem("producer_registration_draft", JSON.stringify({
      v: 2, savedAt: Date.now(), step: null,
      form: {
        producer_name: "בדיקת מהמקור", phone: "0501234567", city: "תל אביב-יפו",
        address: "הרצל 1, תל אביב", lat: 32.0668, lng: 34.7647,
        delivery_nationwide: false, delivery_cities: [],
      },
    }));
  });

  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  // Entry chrome and the draft banner are each conditional: with a live token the
  // wizard opens on DETAILS and skips the preflight, and the banner only appears
  // when a stored draft has content. Click whichever is actually present.
  const clickIfPresent = async (id) => {
    const el = page.getByTestId(id);
    if (await el.count().then((n) => n > 0).catch(() => false)) {
      await el.click({ timeout: 5_000 }).catch(() => {});
    }
  };
  await page.waitForTimeout(1500);   // hydration: the entry chrome mounts client-side
  await clickIfPresent("register-preflight-start");
  await page.waitForTimeout(1500);
  await clickIfPresent("register-draft-continue");
  await page.waitForTimeout(1000);
  await page.getByTestId("register-frame-details").waitFor({ timeout: 15_000 });

  const map = page.locator(".leaflet-container");
  await map.waitFor({ timeout: 20_000 });
  const mapBox = await map.boundingBox();

  const results = [];

  // --- 1. CitySearch (business city, :1080) — sits ABOVE the map in source ---
  const cityInput = page.getByTestId("register-details-city").locator("input").first();
  await cityInput.click();
  await cityInput.fill("תל");
  const csList = page.getByTestId("register-details-city").locator("ul[role=listbox]");
  await csList.waitFor({ timeout: 10_000 }).catch(() => {});
  const csBox = await csList.boundingBox().catch(() => null);
  results.push({ name: "CitySearch (z-[1000], RegisterProducerClient:1080)", box: csBox });
  await page.screenshot({ path: `${OUT}/375-citysearch-open.png` });
  await page.keyboard.press("Escape");

  // --- 2. CitiesAutocomplete (delivery cities, :1343) — sits BELOW the map ---
  // The field is behind two gates: "offers delivery", then "not nationwide".
  // Neither is a default, so both have to be set here.
  const offers = page.getByTestId("register-offers-delivery");
  if (!(await offers.isChecked().catch(() => true))) await offers.check();
  const nationwide = page.getByTestId("register-delivery-nationwide");
  if (await nationwide.isChecked().catch(() => false)) await nationwide.uncheck();
  const deliv = page.getByTestId("register-delivery-cities");
  await deliv.waitFor({ timeout: 10_000 });
  await deliv.scrollIntoViewIfNeeded();
  const delivInput = deliv.locator("input").first();
  await delivInput.click();
  await delivInput.fill("תל");
  const caList = deliv.locator("ul[role=listbox]");
  await caList.waitFor({ timeout: 10_000 }).catch(() => {});
  const caBox = await caList.boundingBox().catch(() => null);
  const mapBoxNow = await map.boundingBox(); // re-read: the page scrolled
  results.push({ name: "CitiesAutocomplete (z-[1010], RegisterProducerClient:1343)", box: caBox });
  await page.screenshot({ path: `${OUT}/375-citiesautocomplete-open.png` });

  console.log("\n=== CONTROL ===");
  console.log(`map (.leaflet-container) @ CitySearch time : ${rect(mapBox)}`);
  console.log(`map (.leaflet-container) @ delivery time   : ${rect(mapBoxNow)}`);
  for (const r of results) console.log(`${r.name}\n    box: ${rect(r.box)}`);
  const dead = !mapBox || results.some((r) => !r.box);
  console.log(dead
    ? "\n!! CONTROL FAILED — a box is MISSING. Every verdict below is void."
    : "\n control OK — map and both dropdowns rendered with non-zero boxes.");

  console.log("\n=== VERDICT (geometric intersection with the map) ===");
  console.log(`CitySearch        vs map: ${overlaps(csBox, mapBox) ? "OVERLAPS" : "no overlap"}`);
  console.log(`CitiesAutocomplete vs map: ${overlaps(caBox, mapBoxNow) ? "OVERLAPS" : "no overlap"}`);

  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
