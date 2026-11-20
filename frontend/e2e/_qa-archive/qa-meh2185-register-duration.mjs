/**
 * MEH-2185 guard — how long the producer wizard takes from ACCOUNT to a
 * submitted CONFIRM frame, with every input prepared in advance.
 *
 * WHY: the copy ruling on MEH-2185 replaces «10 דקות» with «כ־3 דקות» on the
 * register subtitle and the preflight line, and says: measure once; if the
 * measurement is >= 8 minutes, invert the ruling (keep 10, drop 3) and report,
 * rather than inventing a third number.
 *
 * WHAT THIS MEASURES, AND WHAT IT CANNOT (read before quoting the number):
 *   It measures the MECHANICAL FLOOR — the wizard's own cost when typing and
 *   deciding are free: navigation, per-step transitions, validation, and the
 *   submit round-trip. That is a LOWER BOUND on a human's time and nothing
 *   more. It cannot tell «3 minutes» from «10 minutes» for a real owner,
 *   because a human's minutes are spent composing a story and finding a
 *   licence number, and this harness spends none.
 *   What it CAN establish is the thing the >= 8 min branch exists to catch:
 *   whether the form is STRUCTURALLY slow — a step that blocks on a network
 *   call, a geocode, an upload — such that even a floor run costs minutes.
 *   Read the printed number as "the wizard itself costs X", not as "a person
 *   needs X".
 *
 * CONTROL (run first, and read it): the elapsed time is only meaningful if the
 * run actually reached CONFIRM. A wizard that dies on step 2 finishes FAST,
 * and a fast number is exactly the reassuring answer here — a floor of four
 * seconds reads as "well under 8 minutes" whether the form is quick or broken.
 * So the script exits 1 and prints VOID unless CONFIRM was reached, and the
 * duration is printed only alongside that verdict.
 *
 * Not a spec — a one-off harness, run by hand against `npx next start`:
 *   cd frontend && npm run build && npx next start &
 *   node e2e/qa-meh2185-register-duration.mjs
 *
 * The backend is stubbed at the route level (same two stubs as
 * qa-meh2183-register-polish.mjs, which this REUSES for its navigation): the
 * CC sandbox has no database, and a real POST would measure Railway's latency
 * rather than the wizard's.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const THRESHOLD_MIN = 8;

// REUSES: frontend/e2e/qa-meh2183-register-polish.mjs:55 — probe the sandbox
// build on the filesystem rather than reading an env var. check_env_drift.sh
// BLOCKS on any process.env name absent from .env.example, and a throwaway QA
// harness is not a reason to add one.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
);
const ctx = await browser.newContext({
  viewport: { width: 375, height: 900 },
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
await page.route("**/auth/register/producer", (r) =>
  r.request().method() === "POST"
    ? r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ whatsapp_sent: true }),
      })
    : r.continue(),
);

await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
await page.getByTestId("register-preflight-start").click();
await page.getByTestId("register-account-name").waitFor({ state: "visible", timeout: 15_000 });

// ── clock starts at the first ACCOUNT field, per the ruling's "ACCOUNT→submit"
const t0 = Date.now();

await page.getByTestId("register-account-name").fill("טסט בדיקה");
await page.getByTestId("register-account-email").fill(`qa2185+${Date.now()}@mehamakor.online`);
await page.getByTestId("register-account-password").fill("Abcdefgh1234");
await page.getByTestId("register-account-next").click();

await page.getByTestId("register-details-name").fill("העסק שלי");
await page.getByTestId("register-details-phone").fill("0501234567");
await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
await page.getByTestId("register-details-next").click();

await page.getByTestId("category-chip-1").click();
const lic = page.getByTestId("register-category-license");
if (await lic.isVisible().catch(() => false)) await lic.fill("1234567");
await page.getByTestId("register-category-next").click();

await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
  await cb.check();
}
await page.getByTestId("register-story-submit").click();

const reachedConfirm = await page
  .getByTestId("register-frame-confirm")
  .waitFor({ state: "visible", timeout: 30_000 })
  .then(() => true)
  .catch(() => false);

const elapsedMs = Date.now() - t0;
await browser.close();

const elapsedS = elapsedMs / 1000;
const elapsedMin = elapsedS / 60;

console.log("");
console.log(`  CONTROL  reached CONFIRM frame: ${reachedConfirm ? "YES" : "NO"}`);
if (!reachedConfirm) {
  console.log("  VOID     the run did not complete the wizard, so the elapsed time below");
  console.log("           measures a failure, not the form. A short duration here is NOT");
  console.log("           evidence the form is fast.");
  console.log(`  elapsed  ${elapsedS.toFixed(1)}s — DISCARD`);
  process.exit(1);
}

// Every step above is gated by a `fill`/`click` on that step's own testid, and
// Playwright throws when the target never appears — so a run that reaches this
// line has necessarily traversed ACCOUNT, DETAILS, CATEGORY and STORY. Stated
// because "reached CONFIRM fast" would otherwise be consistent with a wizard
// that skipped the middle, and that is the reading to rule out.
console.log("  path     ACCOUNT -> DETAILS -> CATEGORY -> STORY -> CONFIRM, each gated by its own testid");
console.log(`  elapsed  ${elapsedS.toFixed(1)}s (${elapsedMin.toFixed(2)} min), ACCOUNT -> CONFIRM`);
console.log(`  ruling   threshold is ${THRESHOLD_MIN} min`);
console.log(
  elapsedMin >= THRESHOLD_MIN
    ? `  VERDICT  INVERT — floor alone is >= ${THRESHOLD_MIN} min; keep «10 דקות», drop «כ־3 דקות», report.`
    : `  VERDICT  HOLD — the wizard is not structurally slow, so nothing contradicts «כ־3 דקות».`,
);
console.log(
  "  NOTE     mechanical floor only (typing and deciding are free here). Not a claim",
);
console.log("           about how long a real owner takes.");
console.log("");
