/**
 * MEH-2932 (C18) — 390px evidence for the saved-location picker on the event
 * form, captured against a LOCAL `next start` (rule 23 / rule 38 gate 2).
 *
 * The page sits behind the owner dashboard, so the session and every backend
 * read it makes are stubbed with page.route(); the subject here is layout at
 * 390, not the API.
 *
 * Three frames, one per cell of the count axis:
 *   many — the picker with two saved points
 *   one  — a single saved point beside «כתובת אחרת»
 *   zero — no picker at all, the form exactly as it was
 *
 * Run from frontend/:  node e2e/qa-meh2932-event-locations.mjs
 *   QA_BASE_URL / PLAYWRIGHT_CHROMIUM_PATH override the target and the browser
 *   (the names check_env_drift.sh classes as harness config, MEH-1516).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2932";
mkdirSync(OUT, { recursive: true });

const ME = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "owner@example.com",
  name: "דנה לוי",
  role: "producer",
  is_producer: true,
  producer_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
};
const LOCATIONS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    kind: "farm", label: "החווה", city: "זכרון יעקב", address: "הרצל 1",
    lat: 32.57, lng: 34.95, is_primary: true, location_precision: "exact",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    kind: "market", label: "הדוכן בשוק", city: "חיפה", address: "הנמל 5",
    lat: null, lng: null, is_primary: false, location_precision: "city",
  },
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});

const json = (route, data) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

async function capture(name, locations) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("token", "stub-token"); } catch {}
  });
  await ctx.route("**/producers/me/locations*", (r) => json(r, locations));
  await ctx.route("**/auth/me*", (r) => json(r, ME));
  await ctx.route("**/producers/me*", (r) => json(r, { name: "הבית של דנה", status: "approved" }));
  await ctx.route("**/categories*", (r) => json(r, []));
  await ctx.route("**/cities*", (r) => json(r, ["זכרון יעקב", "חיפה"]));

  const page = await ctx.newPage();
  await page.goto(`${BASE}/producer/dashboard/events/new`, { waitUntil: "domcontentloaded" });
  await page.locator("#location").waitFor({ timeout: 20000 });

  const picker = page.locator('[data-testid="event-saved-locations"]');
  const count = await picker.count();
  const radios = count ? await picker.locator('input[type="radio"]').count() : 0;
  await picker
    .scrollIntoViewIfNeeded()
    .catch(() => page.locator("#location").scrollIntoViewIfNeeded());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-390.png` });
  console.log(`${name}: picker rendered=${count > 0}  radios=${radios} (expected ${locations.length ? locations.length + 1 : 0})`);
  await ctx.close();
  return { count, radios };
}

const many = await capture("many-saved", LOCATIONS);
const one = await capture("one-saved", [LOCATIONS[0]]);
const zero = await capture("zero-saved", []);

const ok =
  many.radios === 3 && one.radios === 2 && zero.count === 0;
console.log(`\n${ok ? "OK" : "MISMATCH"} — many=3 one=2 zero=no picker`);
await browser.close();
process.exit(ok ? 0 : 1);
