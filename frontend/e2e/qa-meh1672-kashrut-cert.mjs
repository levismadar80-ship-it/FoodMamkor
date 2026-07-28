/**
 * MEH-1672 self-QA harness — kashrut certificate proxy + modal.
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1672-kashrut-cert.mjs [baseURL] [chromiumPath]
 * The backend is unreachable from the CC sandbox, so BOTH the producer detail
 * API and the certificate proxy route are intercepted at the Playwright layer.
 * The proxy interception stands in for `GET /producers/{id}/kashrut-cert/{code}`
 * returning real image bytes — proving the FRONTEND wiring (tap → modal →
 * proxy URL, never Cloudinary), not backend authorization (that's pytest's job,
 * see tests/test_meh1672_kashrut_cert_public.py).
 * REUSES: frontend/e2e/qa-meh1646-deliveryblock.mjs (fixture-intercept pattern).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = new URL("../../qa-artifacts/MEH-1672", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// A minimal valid PNG (1x1 transparent pixel) — enough for the <img> to render.
const FAKE_CERT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const producer = {
  id: 123,
  name: "חוות הזית",
  slug: null,
  description: "שמן זית ומוצרי בוטיק מהחווה",
  city: "עתלית",
  phone: "0501234567",
  categories: [],
  images: [],
  is_approved: true,
  offers_delivery: false,
  kashrut_badges: ["badatz", "rabanut"],
  kashrut_verified_at: "2027-01-01T00:00:00Z",
  kashrut_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  // MEH-1672: only badatz has a servable certificate — rabanut stays a plain
  // (non-interactive) label, exactly like the pre-ticket rendering.
  kashrut_certs: [{ badge_code: "badatz" }],
};

const browser = await chromium.launch({ executablePath: process.argv[3] || "/opt/pw-browsers/chromium" });

async function shot(name, viewport, { openModal = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: producer });
    if (/\/api\/producers\/123\/kashrut-cert\/badatz$/.test(url)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: FAKE_CERT_PNG });
    }
    if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(1200);

  const badatzTrigger = page.getByTestId("kashrut-cert-trigger-badatz");
  const rabanutTrigger = page.getByTestId("kashrut-cert-trigger-rabanut");
  console.log(
    `${name} | badatz tappable=${await badatzTrigger.count()} | rabanut tappable=${await rabanutTrigger.count()}`,
  );

  if (openModal) {
    await badatzTrigger.first().click();
    await page.waitForTimeout(400);
    const modalCount = await page.getByTestId("kashrut-cert-modal").count();
    const src = await page.getByTestId("kashrut-cert-image").getAttribute("src").catch(() => null);
    console.log(`${name} | modal blocks=${modalCount} | image src=${src}`);
  } else {
    const trustStrip = page.locator('[data-testid="kashrut-quiet-line"]').first();
    await trustStrip.scrollIntoViewIfNeeded().catch(() => {});
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  await ctx.close();
}

// (א) badge row before any tap — badatz tappable, rabanut not.
await shot("kashrut-cert-375-badges", { width: 375, height: 812 });
await shot("kashrut-cert-1440-badges", { width: 1440, height: 900 });
// (ב) modal open on 375 + 1440 — image fits viewport, validity + disclaimers visible.
await shot("kashrut-cert-375-modal-open", { width: 375, height: 812 }, { openModal: true });
await shot("kashrut-cert-1440-modal-open", { width: 1440, height: 900 }, { openModal: true });

await browser.close();
