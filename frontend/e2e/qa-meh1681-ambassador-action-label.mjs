/**
 * MEH-1681 self-QA — the admin producers kebab labels the ACTION, not the STATE.
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1681-ambassador-action-label.mjs [baseURL] [chromiumPath]
 *
 * WHY THIS ASSERTS RENDERED TEXT AND NOT "the labels differ":
 * "the two labels differ" was ALREADY true before this ticket — the old state
 * copy was "שגרירה" vs "☆ שגריר". A probe asserting only difference would pass
 * against the exact bug it exists to catch. So every assertion below compares
 * the item's text to the expected Hebrew ACTION label read out of he.json, and
 * additionally fails if either retired state string reappears.
 *
 * next-intl renders the KEY STRING when a key is missing — silently, no throw,
 * no console error. Deleting the two retired state keys while the JSX still
 * pointed at them would look like a working page whose item renders the dotted
 * key path itself instead of Hebrew copy. The key-shaped check below catches
 * that directly. (The retired key names are deliberately not spelled out here —
 * MEH-1681's removal spec requires zero references to them under frontend/;
 * they are named in the commit message and PR body.)
 *
 * REUSES: frontend/e2e/qa-meh1852-admin-kashrut-labels.mjs (argv baseURL +
 * chromiumPath, never process.env — the MEH-491 env-drift gate blocks
 * undocumented env reads; localStorage token seeded in addInitScript because
 * the admin layout redirects to /login before issuing any request).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const OUT = new URL("../../qa-artifacts/MEH-1681", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// Read from he.json rather than restating the strings, so a copy change cannot
// leave this probe asserting a stale label.
const he = JSON.parse(fs.readFileSync(new URL("../messages/he.json", import.meta.url), "utf8"));
const ACTIONS = he.admin?.producers?.table?.actions;
if (!ACTIONS?.set_ambassador_title || !ACTIONS?.remove_ambassador_title) {
  throw new Error("he.json admin.producers.table.actions set/remove_ambassador_title failed to load");
}
const SET_LABEL = ACTIONS.set_ambassador_title;
const REMOVE_LABEL = ACTIONS.remove_ambassador_title;

// The two strings this ticket retires. Read from git history, not from he.json
// (they are gone from it) — restated here on purpose so their REAPPEARANCE is
// detectable. This is the one place restating is correct.
const RETIRED = ["שגרירה", "☆ שגריר", "☆"];

const baseRow = {
  status: "approved",
  slug: "farm",
  city: "כרמיאל",
  images: [],
  categories: [],
  verification_tier: "basic",
  created_at: "2026-08-01T00:00:00Z",
};
const ROWS = [
  { ...baseRow, id: "p-off", name: "עסק ללא שגרירות", ambassador: false },
  { ...baseRow, id: "p-on", name: "עסק עם שגרירות", ambassador: true },
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
// Scope to the /api prefix: an unprefixed /admin/producers pattern also matches
// the PAGE url /he/admin/producers, so the document navigation itself would be
// fulfilled with JSON and the table would render zero rows.
await page.route(/\/api\/admin\/producers(\?|$)/, (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROWS) }),
);
await page.route(/\/api\/auth\/me$/, (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "admin-1", role: "admin", email: "a@example.com", name: "אדמין" }),
  }),
);
await page.goto(BASE + "/he/admin/producers", { waitUntil: "networkidle" }).catch(() => {});
// Gate on the thing the assertions read, not on a fixed sleep. The .catch hands
// control to the row-count assertion below, which reports a miss as a readable
// FAIL — letting this throw would abort before that load check, and every
// "retired string absent" assertion would then pass VACUOUSLY on an empty table.
await page.waitForSelector("tbody tr", { timeout: 15_000 }).catch(() => {});

const rowCount = await page.locator("tbody tr").count();
// ---- ASSERT THE ARTIFACT LOADED before reading any result ----
assert("table-rendered-both-rows", rowCount >= 2, true);

async function readKebab(rowIndex, tag) {
  const row = page.locator("tbody tr").nth(rowIndex);
  await row.getByRole("button", { name: /פעולות|actions|menu/i }).first().click();
  await page.waitForTimeout(250);
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent.trim()),
  );
  await page.screenshot({ path: `${OUT}/kebab-${tag}-1440.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return items;
}

const offItems = await readKebab(0, "ambassador-off");
const onItems = await readKebab(1, "ambassador-on");
console.log("off:", JSON.stringify(offItems, null, 1));
console.log("on: ", JSON.stringify(onItems, null, 1));

const offLabel = offItems.find((t) => t.includes("שגריר")) ?? null;
const onLabel = onItems.find((t) => t.includes("שגריר")) ?? null;

// The action labels, compared to he.json — not merely "they differ".
assert("ambassador=false renders the SET action label", offLabel, SET_LABEL);
assert("ambassador=true renders the REMOVE action label", onLabel, REMOVE_LABEL);
assert("the two states render different labels", offLabel !== onLabel, true);

// Retired state copy must not reappear in either state.
const retiredHits = [...offItems, ...onItems].filter((t) => RETIRED.some((r) => t === r || t.includes("☆")));
assert("no retired state string (☆ / שגרירה / ☆ שגריר) in the menu", retiredHits, []);

// A missing key renders the key string, silently.
const keyish = [...offItems, ...onItems].filter((t) => t.includes("producers.table.actions") || t.includes("."));
assert("no menu item rendered as a raw i18n key", keyish, []);

await ctx.close();
results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
