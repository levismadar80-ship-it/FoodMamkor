/**
 * MEH-1859 chunk B self-QA — the admin moderation table's BADGE COLUMN HEADER
 * renders Hebrew on the Hebrew page.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite —
 * playwright.config.ts:35 testMatch excludes .mjs):
 *   node e2e/qa-meh1859-admin-badge-column.mjs [baseURL] [chromiumPath]
 *
 * WHY A RENDERED CHECK AND NOT A JSON DIFF:
 * the key was never missing — `admin.kashrut.columns.badge` existed and
 * resolved. It resolved to the English word "Badge" on a `dir="rtl"`, locale=he
 * page. next-intl reports nothing for that: a present key holding untranslated
 * copy is indistinguishable from a translated one at every layer except the
 * pixels. The whole reason this ticket exists is that nobody looked at the
 * rendered header, so the evidence has to be the rendered header.
 *
 * THE DISCRIMINATING ASSERTION is `badge-header-has-no-latin-letters`. Comparing
 * against he.json alone would NOT discriminate: this probe reads its expectation
 * from he.json (so a future label change cannot leave it asserting a stale
 * string), which means on the pre-fix tree it would have compared "Badge" to
 * "Badge" and passed. The Latin-letter check is what separates the two trees.
 * Demonstrated fail→pass, both runs recorded in the PR body.
 *
 * The load gate (`all-six-headers-rendered`) runs FIRST and on its own line: an
 * admin page that redirected to /login renders zero `th`, and every text
 * assertion below would then pass vacuously against `undefined`. That exact
 * vacuous pass is what the sibling MEH-1852 probe hit on its first run.
 *
 * REUSES: frontend/e2e/qa-meh1852-admin-kashrut-labels.mjs — the addInitScript
 * token seed (the admin layout redirects before issuing ANY request when
 * localStorage has no token) and the /api-prefixed route patterns (an unprefixed
 * /admin/kashrut pattern also matches the PAGE url and fulfils the document
 * navigation with JSON).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1859", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const he = JSON.parse(fs.readFileSync(new URL("../messages/he.json", import.meta.url), "utf8"));
const COLUMNS = he.admin?.kashrut?.columns;
if (!COLUMNS || Object.keys(COLUMNS).length !== 6) {
  throw new Error(`he.json admin.kashrut.columns failed to load (got ${Object.keys(COLUMNS ?? {}).length} keys)`);
}
const ORDER = ["producer", "badge", "cert", "date", "notes", "actions"];

const ROWS = [
  {
    id: 1,
    producer_id: "p1",
    producer_name: "עסק לדוגמה",
    badge_code: "chalak",
    status: "pending",
    cert_url: null,
    expires_at: "2027-01-01",
    created_at: "2026-08-01T00:00:00Z",
    notes: null,
  },
];

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
// Gate on the element the assertions read, not a fixed sleep. The .catch hands
// control to the load assertion below rather than aborting before it — that
// assertion is the one that reports a miss as a readable count.
await page.waitForSelector("thead th", { timeout: 15_000 }).catch(() => {});

const headers = await page.evaluate(() =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent.trim()),
);
console.log("headers:", JSON.stringify(headers, null, 1));

// ---- ASSERT THE ARTIFACT LOADED before reading any result ----
// A redirect to /login renders zero th, and every check below would then be
// comparing against undefined and passing vacuously.
assert("all-six-headers-rendered", headers.length, 6);

const badge = headers[1];

// Expectation read from he.json — never restated here, so a future rename of the
// label cannot leave this probe green against a stale string.
assert("badge-header-matches-he-json", badge, COLUMNS.badge);
assert("every-header-matches-he-json", headers, ORDER.map((k) => COLUMNS[k]));

// THE DISCRIMINATING ONE. The two assertions above pass on the pre-fix tree
// (they compare he.json to itself). This is the check that separates "Badge"
// from "תג כשרות" on a locale=he page.
assert("badge-header-has-no-latin-letters", /[A-Za-z]/.test(badge ?? ""), false);

// A missing key renders the key string, silently — the sibling failure mode.
assert("badge-header-is-not-a-raw-key", (badge ?? "").includes("."), false);

await page.screenshot({ path: `${OUT}/admin-kashrut-header-1440.png`, fullPage: false });
const table = page.locator("table").first();
if (await table.count()) await table.screenshot({ path: `${OUT}/badge-column-header-1440.png` });

await ctx.close();
results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
