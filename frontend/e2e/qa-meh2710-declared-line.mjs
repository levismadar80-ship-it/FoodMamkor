/**
 * MEH-2710 — self-QA: a declared-tier business page shows NO badge-absence
 * line («ללא תג מאומת · מה זה אומר?» was removed). Verified tier keeps its
 * «מאומת» chip. Producer endpoint route-mocked (same pattern as
 * qa-meh1611-producer-locations.mjs); asserts on rendered text, not testids.
 *
 * Run: node e2e/qa-meh2710-declared-line.mjs [outDir] [base]  (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-2710");
const BASE = process.argv[3] || "http://127.0.0.1:3000";
// CC-sandbox only (fixed path); absent elsewhere, so launch falls back to
// Playwright's own resolution. A constant, not an env var: env-drift guard.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";

const DECLARED_ID = "3c3c3c3c-3333-4333-8333-333333333333";
const VERIFIED_ID = "4d4d4d4d-4444-4444-8444-444444444444";

const base = {
  name: "משק הכרמל הירוק",
  slug: "carmel-green",
  city: "זכרון יעקב",
  description: "ירקות עונתיים מהשדה בזכרון",
  categories: [{ id: 2, name: "ירקות" }],
  images: [],
  lat: 32.5732,
  lng: 34.9519,
  locations: [],
  primary_contact_method: "whatsapp",
  phone: "0501110001",
  delivery_areas: [],
  avg_rating: null,
  reviews_count: 0,
  plan: "free",
};
const declared = { ...base, id: DECLARED_ID, verification_tier: "declared" };
const verified = {
  ...base,
  id: VERIFIED_ID,
  verification_tier: "verified",
  license_type: "license",
  verified_at: "2026-10-01T10:00:00Z",
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function run(width, height, label) {
  const browser = await chromium.launch({
    ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const serve = (p) => (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(p) });
  await page.route(new RegExp(`/api/producers/${DECLARED_ID}(?:\\?[^#]*)?$`), serve(declared));
  await page.route(new RegExp(`/api/producers/${VERIFIED_ID}(?:\\?[^#]*)?$`), serve(verified));
  await page.route(/\/api\/(reviews|producers\/[^/]+\/(products|events|recipes|experiences))/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  for (const [id, tier] of [[DECLARED_ID, "declared"], [VERIFIED_ID, "verified"]]) {
    await page.goto(`${BASE}/producer/${id}`, { waitUntil: "domcontentloaded" });
    // Control: the business name must render, or every "absent" below is void.
    const h1 = page.getByRole("heading", { level: 1, name: /משק הכרמל הירוק/ });
    await h1.waitFor({ timeout: 30_000 });
    check(`[${label}/${tier}] control: business name rendered`, await h1.isVisible());
    await page.waitForTimeout(800);
    const text = await page.locator("main").innerText();
    check(`[${label}/${tier}] no «ללא תג מאומת» line`, !text.includes("ללא תג מאומת"));
    if (tier === "verified") {
      check(`[${label}/${tier}] «מאומת» chip still shown`, text.includes("מאומת"));
    }
    await page.screenshot({ path: path.join(OUT, `${tier}-${label}.png`) });
  }
  await browser.close();
}

fs.mkdirSync(OUT, { recursive: true });
await run(375, 812, "375");
await run(1440, 900, "1440");
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
