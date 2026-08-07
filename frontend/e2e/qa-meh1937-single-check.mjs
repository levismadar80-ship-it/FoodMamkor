/**
 * MEH-1937 self-QA — the "המיקום זוהה" confirmation row carries exactly ONE
 * check mark, in a real browser at mobile 390px and desktop 1440px.
 *
 * Before this ticket the row rendered two: the `CheckCircle` icon
 * (RegisterProducerClient.jsx:1095) AND a literal "✓" that opened the
 * translated string (he.json `address_confirmed`). The icon is the one that
 * stays — an icon is the component's own affordance, a glyph baked into a
 * translation is invisible to every consumer that doesn't render it.
 *
 * The assertion is deliberately TWO-SIDED and joined with AND, not OR
 * (.claude/rules/testing.md — "watch the shape of the pass condition"):
 *   icons === 1   catches the icon being dropped or duplicated
 *   no "✓" in the accessible text   catches the glyph coming back via i18n
 * Either cue alone would let the other regress unnoticed.
 *
 * Scaffolding (route stubs, token seeding, pickSuggestion) is lifted from
 * e2e/qa-meh1808-address-confirm.mjs — same screen, same wizard entry point.
 * REUSES: frontend/e2e/qa-meh1808-address-confirm.mjs:56-106
 *
 * Run from frontend/ with `next start` on :3000:
 *   node e2e/qa-meh1937-single-check.mjs [outdir]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1937",
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
      localStorage.setItem("token", "qa-meh1937-token");
    } catch {}
  });
  const page = await ctx.newPage();
  await page.route("**/auth/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 4242,
        email: "qa-meh1937@example.com",
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

async function run(browser, label, width, height) {
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  const { ctx, page } = await open(browser, width, height);

  const field = page.getByTestId("register-details-address");
  await field.fill("דרך שרה");
  const option = page.getByRole("option").nth(0);
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();

  const confirm = page.getByTestId("register-address-confirm");
  await confirm.waitFor({ timeout: 10_000 });

  // Scope to the confirmation PARAGRAPH, not the whole testid block. The block
  // also holds the MiniMap, and Leaflet mounts an <svg> overlay pane the moment
  // any vector layer appears — counting svgs across the block would then read 2
  // and red on a change that has nothing to do with this ticket. It measures 1
  // today only because MiniMap uses image/div markers; that is a property of
  // MiniMap's internals, which is exactly the wrong thing for this probe to
  // depend on. Same reason the glyph regex reads this node and not the block.
  const row = confirm.locator("p").first();

  // Guard against a green that means "nothing rendered": if the row were
  // missing entirely, both cues below would trivially hold. Anchor on the
  // copy actually being there first.
  const text = ((await row.textContent()) || "").trim();
  check(
    `${label} 0 the confirmation row really rendered its copy`,
    text.includes("המיקום זוהה") && text.includes("זכרון יעקב"),
    `got: ${JSON.stringify(text)}`,
  );

  const icons = await row.locator("svg").count();
  const hasGlyph = /[✓✔]/.test(text);
  check(
    `${label} 1 exactly ONE check mark (icon===1 AND no ✓ glyph in the text)`,
    icons === 1 && !hasGlyph,
    `icons: ${icons} · glyph: ${hasGlyph} · text: ${JSON.stringify(text)}`,
  );

  fs.mkdirSync(OUT, { recursive: true });
  await confirm.screenshot({ path: path.join(OUT, `${label}-confirm-row.png`) });
  await page.screenshot({
    path: path.join(OUT, `${label}-register-details.png`),
    fullPage: true,
  });

  await ctx.close();
}

// The sandbox ships a pinned Chromium that does not match this repo's
// @playwright/test revision, so the default resolution misses it. PW_CHROMIUM
// lets the runner point at it; unset (CI, a dev machine) falls through to
// Playwright's own download, so nothing outside the sandbox changes.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
await run(browser, "mobile", 390, 844);
await run(browser, "desktop", 1440, 900);
await browser.close();

console.log(
  failures.length === 0
    ? `\nALL CHECKS PASSED — artifacts in ${OUT}`
    : `\n${failures.length} FAILED: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
