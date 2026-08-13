// MEH-2057 self-QA capture — desktop (1440) + mobile (390) of the three
// surfaces whose lat/lng readers this chunk migrated to producerPoints():
// home (mini-map + producer cards), /map, /producers.
//
// LIMITATION (documented, not silently dropped): the CC sandbox cannot
// reach Railway (CLAUDE.md "Known Bug Patterns"), and `alembic upgrade` —
// the only way to get a local Postgres schema — is denied at the
// permissions layer (this repo's Alembic-is-sole-schema-authority rule
// applies to CC regardless of read vs write intent). So these captures
// run against a live `next dev` with no reachable backend: they prove the
// build renders without crashing and show the documented empty/error
// state, NOT live distance numbers or map markers. Pixel-level visual
// verification of the migrated distance/marker output is deferred to
// Sapir's phone check against the Vercel preview, per this repo's
// documented smoke-verification limitation (MEH-360).
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2057";

const targets = [
  { path: "/he", name: "home" },
  { path: "/he/map", name: "map" },
  { path: "/he/producers", name: "producers" },
];

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const vp of viewports) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  for (const t of targets) {
    try {
      await page.goto(`${BASE}${t.path}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${t.name}-${vp.name}.png`, fullPage: false });
      console.log(`OK ${t.name}-${vp.name}`);
    } catch (e) {
      console.log(`FAIL ${t.name}-${vp.name}: ${e.message}`);
    }
  }
  await page.close();
}
await browser.close();
