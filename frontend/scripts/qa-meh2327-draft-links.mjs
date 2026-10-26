/**
 * MEH-2327 self-QA — the draft banner's missing items, each a link, at 375
 * and 1440. Real `next start` build; only /api/** is synthetic (faked producer
 * session + a draft missing every requirement, then one missing only the
 * photo). Disposable probe, not a gate — the gate is
 * __tests__/DraftSubmitBanner.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const flag = (name) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const BASE = flag("base") || "http://127.0.0.1:3000";
const EXE = flag("chromium");
const OUT = new URL("../../qa-artifacts/MEH-2327/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com",
  role: "producer", producer_id: "22222222-2222-2222-2222-222222222222",
  phone_verified: false,
};
const BASE_PROFILE = {
  id: USER.producer_id, name: "גבינות הגליל", status: "draft", description: "",
  short_description: "", images: [], categories: [], category_ids: [], products: [],
  has_physical_location: true, locations: [], custom_questions: [], order_window: {},
  phone: "0501234567", phone_verified: false,
};
const CASES = {
  "all-missing": BASE_PROFILE,
  "one-missing": {
    ...BASE_PROFILE, phone_verified: true,
    categories: [{ id: 1, name: "חלב וגבינות" }], category_ids: [1],
    products: [{ id: "p1", name: "גבינת עיזים" }],
    locations: [{ id: "l1", city: "ראש פינה", is_primary: true, lat: 32.97, lng: 35.54 }],
    lat: 32.97, lng: 35.54, city: "ראש פינה",
  },
};

const failures = [];
const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) failures.push(n); };

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
try {
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    for (const [name, profile] of Object.entries(CASES)) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "he-IL" });
      await ctx.addInitScript(() => {
        localStorage.setItem("token", "qa-fixture-token");
        localStorage.setItem("cookie_consent", "accepted");
      });
      const page = await ctx.newPage();
      await page.route("**/api/**", (route) => {
        const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
        const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
        if (p === "/auth/me") return json({ ...USER, phone_verified: profile.phone_verified });
        if (p === "/producers/me/dashboard") return json({ producer: profile });
        if (p === "/producers/me") return json(profile);
        if (p === "/producers/me/analytics") return json({});
        return json([]);
      });
      await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
      const list = page.getByTestId("draft-missing-list");
      await list.waitFor({ timeout: 20_000 });
      const links = await page.locator('[data-testid^="draft-missing-link-"]').count();
      check(`${w} ${name}: links rendered`, name === "one-missing" ? links === 1 : links >= 4, `${links}`);
      const box = await list.boundingBox();
      check(`${w} ${name}: list inside viewport`, box.x >= 0 && box.x + box.width <= w);
      await list.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${OUT}banner-${name}-${w}.png` });
      if (name === "one-missing") {
        await page.locator('[data-testid^="draft-missing-link-"]').first().click();
        await page.waitForURL(/dashboard\/edit/, { timeout: 10_000 }).catch(() => {});
        check(`${w} ${name}: link lands on the edit page`, /\/producer\/dashboard\/edit#profile-images$/.test(page.url()), page.url());
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAIL` : "\nall PASS");
process.exit(failures.length ? 1 : 0);
