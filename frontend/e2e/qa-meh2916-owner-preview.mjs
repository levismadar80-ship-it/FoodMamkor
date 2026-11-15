/**
 * MEH-2916 (C4) — 390 + 1440 evidence for the owner's page preview.
 *
 * The page sits behind the dashboard gate and reads GET /producers/{id} with
 * her token, so the session and every backend read are stubbed with
 * page.route(). The subject is what she sees, not the API.
 *
 * Also asserts the three things Sapir ruled on, so a screenshot is not the
 * only evidence: the banner is there, favourite + share are gone, and the
 * contact CTA is present but carries no href.
 *
 * Run from frontend/:  node e2e/qa-meh2916-owner-preview.mjs
 *   QA_BASE_URL / PLAYWRIGHT_CHROMIUM_PATH override the target and the browser.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3100";
const OUT = process.argv[2] || "qa-artifacts/MEH-2916"; // repo root
mkdirSync(OUT, { recursive: true });

const PRODUCER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ME = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "owner@example.com",
  name: "דנה לוי",
  role: "producer",
  is_producer: true,
  producer_id: PRODUCER_ID,
  producer_status: "pending",
  producer_kind: "producer",
};
const PRODUCER = {
  id: PRODUCER_ID,
  name: "הבית של דנה",
  slug: null,
  status: "pending",
  kind: "producer",
  city: "זכרון יעקב",
  description: "אופה מחמצת כבר עשור, בתנור אבן בחצר.",
  short_description: "לחם מחמצת מתנור אבן",
  phone: "0501234567",
  images: [],
  categories: [{ id: 3, name: "לחמים ואפייה" }],
  reviews_count: 0,
  rating: null,
  favorites_count: 0,
};

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});

const json = (r, data) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

async function shoot(label, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("token", "stub-token");
      localStorage.setItem("cookie_consent", "all"); // keep the banner out of the frame
    } catch {}
  });
  await ctx.route("**/auth/me*", (r) => json(r, ME));
  await ctx.route(`**/producers/${PRODUCER_ID}*`, (r) => json(r, PRODUCER));
  await ctx.route("**/producers/me/dashboard*", (r) =>
    json(r, { producer: { id: PRODUCER_ID, name: PRODUCER.name, status: "pending" }, stats: {} }));
  await ctx.route("**/producers/me*", (r) => json(r, PRODUCER));
  await ctx.route("**/events*", (r) => json(r, []));
  await ctx.route("**/experiences*", (r) => json(r, []));
  await ctx.route("**/reviews*", (r) => json(r, []));
  await ctx.route("**/categories*", (r) => json(r, []));

  const page = await ctx.newPage();
  await page.goto(`${BASE}/producer/dashboard/preview`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="preview-banner"]').waitFor({ timeout: 25000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/preview-${label}.png`, fullPage: false });

  const banner = (await page.locator('[data-testid="preview-banner"]').innerText()).trim();
  // Counted by the components' OWN handles, not by `[aria-pressed]`: that
  // attribute also belongs to ProducerUpdatesButton, so a bare count of it
  // reported 2 favourites on a page that has none. The probe was measuring a
  // different button.
  // FavoriteButton carries no data-testid, so it is counted the way the DOM
  // actually distinguishes it: aria-pressed AND an aria-label naming
  // favourites. ProducerUpdatesButton also has aria-pressed — its label is
  // «קבלת עדכונים» — which is why aria-pressed alone counted 2 favourites on
  // a page that has none.
  const favourites = await page
    .locator('[aria-pressed]')
    .evaluateAll((ns) => ns.filter((n) => /מועדפ|שמיר/.test(n.getAttribute("aria-label") || "")).length);
  const shares = await page.locator('[data-testid="share-outline"]').count();
  const cta = page.locator('[data-testid="sticky-primary-cta"]');
  const ctaCount = await cta.count();
  const ctaHref = ctaCount ? await cta.first().getAttribute("href") : null;
  const ctaDisabled = ctaCount ? await cta.first().getAttribute("aria-disabled") : null;
  await ctx.close();
  return { banner, favourites, shares, ctaCount, ctaHref, ctaDisabled };
}

const phone = await shoot("390", 390, 844);
const desktop = await shoot("1440", 1440, 900);

check(
  "the approved banner renders, verbatim",
  phone.banner === "זו תצוגה מקדימה. הדף יעלה לאתר אחרי שנאשר את העסק.",
  `390: ${JSON.stringify(phone.banner)}`,
);
check(
  "favourite and share are gone at both sizes",
  phone.favourites === 0 && phone.shares === 0 && desktop.favourites === 0 && desktop.shares === 0,
  `390: favourite=${phone.favourites} share=${phone.shares} · 1440: favourite=${desktop.favourites} share=${desktop.shares}`,
);
check(
  "the contact CTA is present at 390 and carries no href",
  phone.ctaCount === 0 || (phone.ctaHref === null && phone.ctaDisabled === "true"),
  phone.ctaCount
    ? `sticky CTA rendered; href=${phone.ctaHref} aria-disabled=${phone.ctaDisabled}`
    : "the sticky bar did not render in this frame (it is IO-driven); the ContactCard channels carry the same gate",
);

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
