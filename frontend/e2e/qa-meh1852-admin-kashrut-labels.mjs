/**
 * MEH-1852 chunk B self-QA — the admin moderation table's certification pill
 * now reads the CANONICAL `kashrut.badges.*` namespace.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1852-admin-kashrut-labels.mjs [baseURL] [chromiumPath]
 *
 * WHY THIS ASSERTS RENDERED TEXT AND NOT "no error":
 * next-intl renders the KEY STRING when a key is missing — silently, with no
 * throw and no console error. So `admin.kashrut.badges.*` being deleted while
 * the call site still pointed at it would look like a working page whose pills
 * read "kashrut.badges.chalak". Every assertion below therefore compares the
 * pill's text to the expected Hebrew label from he.json, and additionally
 * fails on any pill whose text still looks like a key (contains a dot, or the
 * literal namespace).
 *
 * All 8 codes are exercised, one row each, using the hyphenated API `code`
 * axis the backend actually sends (organic-kosher / artisan-dairy) — the axis
 * CODE_TO_KEY translates. A fixture using the underscore form would pass the
 * lookup trivially and prove nothing about the mapping.
 *
 * Both routes are scoped to the `/api` prefix (lib/api.js:5 baseURL). An
 * unprefixed /admin/kashrut pattern also matches the PAGE url /he/admin/kashrut,
 * so the document navigation itself gets fulfilled with JSON and the table
 * renders zero rows — which is how the first run of this probe failed. The
 * `table-rendered-all-8-rows` assertion is what caught it: without that load
 * check the "no raw key" assertion passed VACUOUSLY on an empty row set.
 *
 * REUSES: frontend/e2e/qa-meh1704-badge-parity.mjs (argv baseURL + chromiumPath,
 * never process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1852", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// Read from he.json rather than restated, so a label change cannot leave this
// probe asserting a stale string.
const he = JSON.parse(fs.readFileSync(new URL("../messages/he.json", import.meta.url), "utf8"));
const LABELS = he.kashrut.badges;
if (!LABELS || Object.keys(LABELS).length !== 8) {
  throw new Error(`he.json kashrut.badges failed to load (got ${Object.keys(LABELS ?? {}).length} keys)`);
}

// API `code` axis (hyphenated) → message key (underscored), per CODE_TO_KEY.
const CODES = [
  ["rabanut", "rabanut"],
  ["badatz", "badatz"],
  ["chalak", "chalak"],
  ["mehadrin", "mehadrin"],
  ["organic-kosher", "organic_kosher"],
  ["shmitta", "shmitta"],
  ["kilayim", "kilayim"],
  ["artisan-dairy", "artisan_dairy"],
];

const ROWS = CODES.map(([code], i) => ({
  id: i + 1,
  producer_id: `p${i + 1}`,
  producer_name: `עסק ${i + 1}`,
  badge_code: code,
  status: "pending",
  cert_url: null,
  expires_at: "2027-01-01",
  created_at: "2026-08-01T00:00:00Z",
  notes: null,
}));

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

const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "he" });
const page = await ctx.newPage();
// The admin layout redirects to /login before issuing ANY request when
// localStorage has no token (auth-context.js:61, layout.js:134) — the first run
// of this probe landed on /login with zero /api calls. Seed the token BEFORE
// page scripts run, then let the mocked /api/auth/me supply the admin role.
// (localStorage is safe in addInitScript; DOM reads are not — document.
// documentElement is null there.)
await page.addInitScript(() => {
  localStorage.setItem("token", "qa-harness-token");
});
await page.route(/\/api\/admin\/kashrut(\?|$)/, (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }),
);
await page.route(/\/api\/auth\/me$/, (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "admin-1", role: "admin", email: "a@example.com", name: "אדמין" }),
  }),
);
await page.goto(BASE + "/he/admin/kashrut", { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2500);

const pills = await page.evaluate(() =>
  [...document.querySelectorAll("tbody tr")].map((tr) => ({
    producer: tr.querySelector("td:nth-child(1)")?.textContent.trim() ?? null,
    pill: tr.querySelector("td:nth-child(2)")?.textContent.trim() ?? null,
  })),
);
console.log("rows:", JSON.stringify(pills, null, 1));

// ---- ASSERT THE ARTIFACT LOADED before reading any result ----
// An empty table would satisfy every "no raw key" check below vacuously.
assert("table-rendered-all-8-rows", pills.length, 8);

const expected = CODES.map(([, key]) => LABELS[key].label);
assert("every-pill-renders-the-canonical-label", pills.map((p) => p.pill), expected);

// The chalak pill specifically — the string the whole ticket turns on.
assert("chalak-pill-text", pills[2]?.pill, LABELS.chalak.label);
assert("chalak-is-not-the-retired-admin-wording", pills[2]?.pill === "חלק", false);

// A missing key renders the key string, silently. Catch that shape directly.
const keyish = pills.filter((p) => !p.pill || p.pill.includes(".") || p.pill.includes("kashrut.badges"));
assert("no-pill-rendered-as-a-raw-key", keyish, []);

await page.screenshot({ path: `${OUT}/admin-kashrut-table-1440.png`, fullPage: false });
const table = page.locator("table").first();
if (await table.count()) await table.screenshot({ path: `${OUT}/pill-column-1440.png` });

await ctx.close();
results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
