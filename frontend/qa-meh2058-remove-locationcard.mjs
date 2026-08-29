// MEH-2058 self-QA capture — desktop (1440) + mobile (390) of the producer
// edit page's "location" group after LocationCard removal.
//
// LIMITATION (same as MEH-2057, documented not silently dropped): the CC
// sandbox cannot reach Railway and `alembic upgrade` (needed for a local
// Postgres schema) is a denied action, and this route additionally requires
// an authenticated producer session. These captures show whatever the route
// renders unauthenticated (loading/redirect state), NOT the actual edit-page
// UI with LocationsEditor open. Real verification that "one location section
// remains, LocationsEditor works" is deferred to Sapir's phone check.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "/home/user/FoodMamkor/qa-artifacts/MEH-2058";

const targets = [
  { path: "/he/producer/dashboard/edit?group=location", name: "edit-location-group" },
  { path: "/he/producer/dashboard", name: "dashboard-hub" },
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
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${t.name}-${vp.name}.png`, fullPage: false });
      console.log(`OK ${t.name}-${vp.name}`);
    } catch (e) {
      console.log(`FAIL ${t.name}-${vp.name}: ${e.message}`);
    }
  }
  await page.close();
}
await browser.close();
