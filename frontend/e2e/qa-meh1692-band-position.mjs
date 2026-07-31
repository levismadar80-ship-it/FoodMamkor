/**
 * MEH-1692 — is the trust band inside the VRT capture frame?
 *
 * The home parity shot is viewport-only (SHOT carries no `fullPage`), so a copy
 * change below the fold cannot move a single baseline pixel. Answering that by
 * eye is exactly the mistake MEH-1765 documents; this measures it.
 *
 * Prints the band's bounding box against each project's viewport, and the
 * rendered lead string, at both VRT viewports.
 *
 * Usage: node e2e/qa-meh1692-band-position.mjs [baseURL]
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "desktop (1440x900)", width: 1440, height: 900 },
  { name: "mobile  (393x851)", width: 393, height: 851 },
];

// The CC sandbox's preinstalled Chromium is a different build than this repo's
// @playwright/test pins, so point at it rather than downloading one.
//
// Hardcoded rather than read from an env var on purpose. A `process.env.*` read
// here is a NEW env var: it reds the "Env drift (.env.example)" gate, and
// regression rule 8 forbids adding one without explicit sign-off. This is a
// one-off local harness, so the override is an edit to this line.
// Same constant name + existsSync guard as the sibling harnesses
// (qa-meh1655-loading-cta.mjs, qa-meh1638-settings-skeleton.mjs, …) so this
// file reads like the rest of e2e/ and still runs where the path is absent.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const lead = page.locator('[data-testid="trust-lead"]');
  const n = await lead.count();
  if (n === 0) {
    console.log(`\n${vp.name}\n  trust-lead: NOT FOUND (count=0)`);
    await page.close();
    continue;
  }
  const box = await lead.boundingBox();
  const text = (await lead.textContent()).trim();
  const secondary = page.locator('[data-testid="trust-secondary"]');
  const secText = (await secondary.count()) ? (await secondary.textContent()).trim() : "(not rendered)";

  console.log(`\n${vp.name}`);
  console.log(`  lead text        : ${text}`);
  console.log(`  secondary text   : ${secText}`);
  console.log(`  lead box.y       : ${Math.round(box.y)}`);
  console.log(`  viewport height  : ${vp.height}`);
  console.log(
    `  IN CAPTURE FRAME : ${box.y < vp.height ? "YES — baseline IS affected" : "NO — below the fold, baseline unaffected"}`,
  );
  await page.close();
}
await browser.close();
