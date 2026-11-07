/**
 * MEH-2785 — 375 / 1440 evidence for the business QR card and its A6 print
 * route, captured against a real `next start` build.
 *
 * There is no database in the CC sandbox, so the owner-only surfaces are
 * reached by stubbing the four `/api` calls the dashboard makes and seeding a
 * token in localStorage. Everything else is real: the real build, the real
 * CSS, the real `qrcode` render in the real client bundle.
 *
 * CONTROL — this script refuses to write a screenshot it cannot justify.
 * Before each capture it asserts the element it is there to photograph is
 * actually in the DOM, and it asserts the QR <svg> rendered with a module
 * count > 0. A fixture typo, a failed route stub or a dead client bundle all
 * produce a loud throw instead of six plausible-looking PNGs of an empty
 * page. (The MEH-2786 lesson and #2786's six screenshots of an error
 * boundary are the reason this paragraph exists.)
 *
 * Run: node qa-meh2785-shots.mjs   (expects `next start` on PORT, default 3100)
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolveChromium } from "./qa-chrome-path.mjs";

// qa-chrome-path.mjs (MEH-1287) returns undefined on this sandbox — its
// hardcoded root does not match the installed build number — so fall back to
// scanning for the real binary rather than letting Playwright reach for a
// bundled download that is not here.
function chromePath() {
  const fromHelper = resolveChromium();
  if (fromHelper && existsSync(fromHelper)) return fromHelper;
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const dir of readdirSync(root)) {
    const candidate = `${root}/${dir}/chrome-linux64/chrome`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const PORT = process.env.PORT || "3100";
const BASE = `http://localhost:${PORT}`;
const OUT = "qa-artifacts/MEH-2785";

const PRODUCER_ID = "0b5f2c18-7a44-4d6e-9f31-2c8a5e7b1d90";

// An approved, complete business: every field producerCompleteness() checks.
const PROFILE = {
  id: PRODUCER_ID,
  name: "הלחם של דנה",
  slug: "lechem-shel-dana",
  status: "approved",
  kind: "producer",
  city: "כפר סבא",
  phone: "0521234567",
  instagram: null,
  short_description: "לחם מחמצת אפוי במטבח הבית, אפייה טרייה שלוש פעמים בשבוע.",
  description: "לחם מחמצת אפוי במטבח הבית.",
  images: ["https://res.cloudinary.com/demo/image/upload/bread.jpg"],
  categories: [{ id: 1, name_he: "מאפים" }],
  locations: [{ id: "loc-1", lat: 32.175, lng: 34.907, kind: "primary", is_primary: true, city: "כפר סבא", opening_hours: "א-ה 8:00-16:00, ו 8:00-13:00" }],
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  delivery_nationwide: false,
  opening_hours: "א-ה 8:00-16:00, ו 8:00-13:00",
  avg_rating: 4.8,
  reviews_count: 12,
};

const DASHBOARD = {
  producer: {
    id: PRODUCER_ID,
    name: PROFILE.name,
    slug: PROFILE.slug,
    status: "approved",
    kind: "producer",
    plan: "free",
    availability_state: "accepting_orders",
  },
  stats: {},
};

const ANALYTICS = {
  profile_views: 240,
  whatsapp_clicks: 31,
  favorites: 9,
  reviews_count: 12,
};

const USER = {
  id: "u-1",
  email: "dana@example.com",
  role: "producer",
  producer_kind: "producer",
  name: "דנה",
  email_verified: true,
};

function json(route, body) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const shots = [];

async function capture(page, name, selector, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(400);
  const el = page.locator(selector);
  const count = await el.count();
  if (count !== 1) {
    throw new Error(
      `CONTROL FAILED: ${name} — expected exactly 1 "${selector}", found ${count}. ` +
        `Nothing was written; the capture would have been of the wrong page.`,
    );
  }
  // The QR must actually have rendered, not just the card around it.
  const modules = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid$="-qr-preview"] svg, [data-testid$="-qr-print-code"] svg');
    if (!svg) return -1;
    return svg.querySelectorAll("path").length;
  });
  if (modules <= 0) {
    throw new Error(
      `CONTROL FAILED: ${name} — the QR <svg> has ${modules} paths. ` +
        `A screenshot here would show an empty box.`,
    );
  }
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  shots.push({ name, file, selector, svgPaths: modules, ...viewport });
  console.log(`  ok  ${file}  (${viewport.width}x${viewport.height}, svg paths: ${modules})`);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  // The sandbox Chromium, resolved by the repo's own helper (MEH-1287) —
  // playwright's bundled download is absent here.
  const executablePath = chromePath();
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ deviceScaleFactor: 2, locale: "he-IL" });

  await context.addInitScript(() => {
    localStorage.setItem("token", "qa-token");
    localStorage.setItem("user", JSON.stringify({ role: "producer" }));
    // Pre-accept the cookie banner. Without it the fixed bottom banner covers
    // the PNG and print-card buttons at 375 — the evidence would show the
    // banner, not the feature. "cookieConsent" is CookieBanner.jsx's own key.
    localStorage.setItem("cookieConsent", "all");
  });

  await context.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return json(route, USER);
    if (url.includes("/producers/me/dashboard")) return json(route, DASHBOARD);
    if (url.includes("/producers/me/analytics")) return json(route, ANALYTICS);
    if (url.includes("/producers/me")) return json(route, PROFILE);
    return json(route, {});
  });

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log("   [browser error]", m.text());
  });

  console.log("dashboard overview:");
  await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="business-qr-card"]').waitFor({ timeout: 20000 });
  await capture(page, "dashboard-qr-card-1440", '[data-testid="business-qr-card"]', {
    width: 1440,
    height: 1200,
  });
  await capture(page, "dashboard-qr-card-375", '[data-testid="business-qr-card"]', {
    width: 375,
    height: 900,
  });

  console.log("A6 print card:");
  await page.goto(`${BASE}/producer/dashboard/qr-card`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="business-qr-print-code"]').waitFor({ timeout: 20000 });
  await capture(page, "print-card-1440", '[data-testid="business-qr-print-code"]', {
    width: 1440,
    height: 1200,
  });
  await capture(page, "print-card-375", '[data-testid="business-qr-print-code"]', {
    width: 375,
    height: 900,
  });

  // The printed rendering, which is what the business actually tapes up.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/print-card-print-media.png`, fullPage: true });
  console.log(`  ok  ${OUT}/print-card-print-media.png  (print media emulation)`);
  await page.emulateMedia({ media: "screen" });

  // Measured, not assumed: what the printed QR box actually is, in px, and
  // whether the back link / hint are gone under print.
  await page.emulateMedia({ media: "print" });
  const printed = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="business-qr-print-code"]').getBoundingClientRect();
    const chrome = document.querySelector(".print\\:hidden");
    return {
      qrWidthPx: Math.round(box.width),
      qrHeightPx: Math.round(box.height),
      chromeDisplay: chrome ? getComputedStyle(chrome).display : "absent",
      anchorsInsideArticle: document.querySelectorAll("article a[href]").length,
    };
  });
  console.log("\nprint-media measurements:", JSON.stringify(printed));
  // 50mm at the CSS reference 96dpi is 50 / 25.4 * 96 ≈ 189px.
  const expected = Math.round((50 / 25.4) * 96);
  if (Math.abs(printed.qrWidthPx - expected) > 2) {
    throw new Error(`QR box is ${printed.qrWidthPx}px, expected ~${expected}px (50mm)`);
  }
  if (printed.chromeDisplay !== "none") {
    throw new Error(`screen chrome is "${printed.chromeDisplay}" under print, expected "none"`);
  }
  if (printed.anchorsInsideArticle !== 0) {
    throw new Error(
      `${printed.anchorsInsideArticle} anchor(s) inside the printed <article> — ` +
        `globals.css:614 would print their href as visible text`,
    );
  }

  console.log("\nall captures passed their controls:");
  for (const s of shots) console.log(" ", JSON.stringify(s));
  await browser.close();
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
