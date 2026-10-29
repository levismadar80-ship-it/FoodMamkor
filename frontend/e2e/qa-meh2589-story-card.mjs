/**
 * MEH-2589 — story-card redesign evidence.
 *
 * Drives the REAL /he/admin/producers page against `next start`, every
 * /api/** call fulfilled from fixtures (house pattern — see
 * qa-meh2230-admin-kebab-viewport.mjs). Opens the «סטורי» panel for three
 * rows (photo + short name · no photo · very long name + 3 categories),
 * screenshots the panel at 375 and 1440, and writes each canvas out at its
 * full 1080×1920 so the card itself can be read, not just the preview.
 *
 * The Cloudinary photo is served from QA_PHOTO (a local file) with CORS
 * headers, because the canvas loads it crossOrigin=anonymous.
 *
 * CONTROL, run first and failing loudly: the canvas exists and is 1080×1920.
 * A missing or 300×150 canvas means the panel never drew, and every PNG
 * below would be void.
 *
 * Run: QA_PHOTO=/path/to/photo.png node e2e/qa-meh2589-story-card.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3100";
const OUT = process.env.QA_OUT || "qa-artifacts/MEH-2589";
const PHOTO = process.env.QA_PHOTO;
const ADMIN = { id: 1, email: "admin@example.com", role: "admin", name: "ספיר" };

const row = (i, extra) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  slug: `story-${i}`,
  city: "מודיעין",
  status: "approved",
  images: [],
  categories: [{ name: "לחמים ואפייה" }],
  created_at: "2026-10-01T10:00:00Z",
  submitted_for_review_at: "2026-10-01T10:00:00Z",
  business_days_waiting: 1,
  ambassador: false,
  risk_score: null,
  risk_reasoning: null,
  _completeness: 100,
  ...extra,
});
const producers = [
  row(1, { name: "מאפיית לחם וזמן", images: ["https://res.cloudinary.com/demo/image/upload/v1/bread.jpg"] }),
  row(2, { name: "גבינות הגליל", city: "ראש פינה", categories: [{ name: "גבינות" }] }),
  row(3, {
    name: "המאפייה הכפרית הוותיקה של משפחת כהן מזכרון יעקב והסביבה הקרובה",
    city: "זכרון יעקב",
    images: ["https://res.cloudinary.com/demo/image/upload/v1/bread.jpg"],
    categories: [{ name: "לחמים ואפייה" }, { name: "מעדניות" }, { name: "גבינות" }],
  }),
];

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures += 1;
};

async function openStory(page, index) {
  const triggers = page.locator('button[aria-haspopup="menu"][aria-label="פעולות נוספות"]');
  const visible = [];
  for (let i = 0; i < (await triggers.count()); i++) {
    if (await triggers.nth(i).isVisible()) visible.push(triggers.nth(i));
  }
  await visible[index].click();
  await page.locator('[role="menuitem"]', { hasText: "סטורי" }).first().click();
  await page.getByText("כרטיס אינסטגרם מוכן").first().waitFor();
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return c && c.width === 1080 && !document.body.innerText.includes("מייצר...");
  }, null, { timeout: 15000 });
}

async function run(width, height) {
  // QA_CHROME: the sandbox ships one Chromium outside the pinned Playwright cache.
  const browser = await chromium.launch(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", timezoneId: "Asia/Jerusalem", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("res.cloudinary.com")) {
      return route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: fs.readFileSync(PHOTO) });
    }
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const body =
      path === "/auth/me" ? ADMIN
      : path === "/admin/producers" ? producers
      : path === "/admin/dashboard" ? { stats: { pending_moderation_count: 0, pending_kashrut_requests: 0 } }
      : {};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
  await page.goto(`${BASE}/he/admin/producers`, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  for (const [i, tag] of [[0, "photo"], [1, "nophoto"], [2, "long"]]) {
    await openStory(page, i);
    const size = await page.evaluate(() => { const c = document.querySelector("canvas"); return c ? [c.width, c.height] : null; });
    check(size && size[0] === 1080 && size[1] === 1920, `CONTROL ${width}/${tag}: canvas 1080×1920 (got ${size})`);
    const panel = page.locator("canvas").locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]");
    await panel.scrollIntoViewIfNeeded();
    if (tag === "photo") await page.screenshot({ path: `${OUT}/panel-${width}.png` });
    if (width === 375) {
      const data = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
      fs.writeFileSync(`${OUT}/card-${tag}.png`, Buffer.from(data.split(",")[1], "base64"));
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await browser.close();
}

await run(375, 812);
await run(1440, 900);
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
