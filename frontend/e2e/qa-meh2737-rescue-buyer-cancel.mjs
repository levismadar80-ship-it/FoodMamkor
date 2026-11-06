/**
 * MEH-2737 self-QA — the buyer cancels a rescue-bag reservation:
 *   - the cancel link asks first («לבטל את השריון?»)
 *   - «כן, לבטל» → «השריון בוטל, והסל חזר לרשימה.» and the reserve card is back
 *   - a cancel refused past the cutoff → «מועד הביטול החינמי כבר עבר…», code stays
 *   - a bag whose cutoff passed: «את הסל הזה כבר אי אפשר לבטל» under the CTA,
 *     and «אי אפשר לבטל · שתי אי-הגעות = חסימה» on the confirmation
 * Drives the REAL business page against `next start` on :3100 (built with
 * NEXT_PUBLIC_RESCUE_BAGS_ENABLED=true), /api/** from fixtures. 375 + 1440.
 * Chromium only.
 * Run manually:  node e2e/qa-meh2737-rescue-buyer-cancel.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2737";
const BASE = "http://localhost:3100";
// CC-sandbox only (fixed path); absent elsewhere, so launch falls back.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const PID = "3c3c3c3c-3333-4333-8333-333333333333";
const USER = { id: 9, email: "demo-buyer@example.com", role: "user", name: "נועה" };
const PRODUCER = {
  id: PID,
  name: "מאפיית שדה",
  slug: "sade",
  city: "זכרון יעקב",
  description: "לחמים ומאפים מקמח מלא",
  categories: [{ id: 2, name: "מאפים" }],
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
  verification_tier: "declared",
};
const failures = [];
const check = (l, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${l}`);
  if (!ok) failures.push(l);
};

function times(cutoffPassed) {
  const now = Date.now();
  return {
    pickup_start: new Date(now + (cutoffPassed ? -600_000 : 3_600_000)).toISOString(),
    pickup_end: new Date(now + 7_200_000).toISOString(),
    cancel_until: new Date(now + (cutoffPassed ? -1_800_000 : 1_800_000)).toISOString(),
  };
}

function offer(cutoffPassed) {
  return {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    date: new Date().toISOString().slice(0, 10),
    qty_left: 3,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: 4000,
    value_max_agorot: null,
    ...times(cutoffPassed),
    producer: {
      id: PID,
      name: PRODUCER.name,
      slug: "sade",
      city: "זכרון יעקב",
      image_url: null,
      location_address: "המייסדים 12",
      location_city: "זכרון יעקב",
    },
    typical_items: ["לחם", "חלה", "עוגיות"],
    distance_km: null,
  };
}

function order(cutoffPassed, status = "reserved") {
  return {
    id: "bbbbbbbb-2222-4222-8222-222222222222",
    offer_id: "aaaaaaaa-1111-4111-8111-111111111111",
    user_id: "cccccccc-3333-4333-8333-333333333333",
    qty: 1,
    pickup_code: "0431",
    status,
    handed_at: null,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    price_agorot: 1500,
    ...times(cutoffPassed),
  };
}

async function open(browser, width, height, { cutoffPassed = false, mine = [], cancel = "ok" }) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL", reducedMotion: "reduce" });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!url.includes("/api/")) return route.continue();
    const path = new URL(url).pathname.replace(/^\/api/, "");
    const json = (status, body) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me") return json(200, USER);
    if (path === `/producers/${PID}`) return json(200, PRODUCER);
    if (path === "/rescue/offers") return json(200, [offer(cutoffPassed)]);
    if (path === "/rescue/orders/mine") return json(200, mine);
    if (req.method() === "POST" && path === "/rescue/orders") {
      return json(201, order(cutoffPassed));
    }
    if (req.method() === "POST" && path.endsWith("/cancel")) {
      if (cancel === "late") return json(409, { detail: "מועד הביטול החופשי חלף" });
      return json(200, { ...order(cutoffPassed, "cancelled") });
    }
    return json(200, []);
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "all");
  });
  await page.goto(`${BASE}/producer/${PID}`, { waitUntil: "load" });
  // Control: the section rendered at all, or every "absent" below is void.
  await page.getByTestId("rescue-section").waitFor({ timeout: 30_000 });
  return { ctx, page };
}

async function shot(page, el, name, width) {
  // Centre the element: the sticky header and section tabs cover the top.
  await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`[${name}] no horizontal scroll`, sw <= width);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function run(browser, label, width, height) {
  // 1. ask → yes → cancelled notice
  {
    const { ctx, page } = await open(browser, width, height, {});
    await page.getByTestId("rescue-reserve").click();
    await page.getByTestId("rescue-confirmation-code").waitFor();
    await page.getByTestId("rescue-confirmation-cancel").click();
    const ask = page.getByTestId("rescue-cancel-ask");
    await ask.waitFor();
    check(`[${label}] ask title`, (await ask.innerText()).includes("לבטל את השריון?"));
    await shot(page, ask, `cancel-ask-${label}`, width);
    await page.getByTestId("rescue-cancel-yes").click();
    const notice = page.getByTestId("rescue-cancelled-notice");
    await notice.waitFor();
    check(`[${label}] cancelled notice text`, (await notice.innerText()) === "השריון בוטל, והסל חזר לרשימה.");
    check(`[${label}] reserve button back`, await page.getByTestId("rescue-reserve").isVisible());
    await shot(page, notice, `cancelled-${label}`, width);
    await ctx.close();
  }
  // 2. refused because the cutoff passed in between
  {
    const { ctx, page } = await open(browser, width, height, { cancel: "late" });
    await page.getByTestId("rescue-reserve").click();
    await page.getByTestId("rescue-confirmation-cancel").click();
    await page.getByTestId("rescue-cancel-yes").click();
    const err = page.getByTestId("rescue-section-error");
    await err.waitFor();
    check(`[${label}] too-late text`, (await err.innerText()) === "מועד הביטול החינמי כבר עבר, אז השריון נשאר בתוקף.");
    check(`[${label}] code still shown`, (await page.getByTestId("rescue-confirmation-code").innerText()) === "0431");
    await shot(page, err, `cancel-too-late-${label}`, width);
    await ctx.close();
  }
  // 3. a bag whose free-cancel cutoff already passed
  {
    const { ctx, page } = await open(browser, width, height, { cutoffPassed: true });
    const terms = page.getByTestId("rescue-section-terms");
    await terms.waitFor();
    check(`[${label}] card says no cancel`, (await terms.innerText()) === "את הסל הזה כבר אי אפשר לבטל");
    await shot(page, terms, `after-cutoff-card-${label}`, width);
    await page.getByTestId("rescue-reserve").click();
    const cterms = page.getByTestId("rescue-confirmation-terms");
    await cterms.waitFor();
    check(`[${label}] confirmation says no cancel`, (await cterms.innerText()) === "אי אפשר לבטל · שתי אי-הגעות = חסימה");
    check(`[${label}] no cancel link`, (await page.getByTestId("rescue-confirmation-cancel").count()) === 0);
    await shot(page, cterms, `after-cutoff-confirmation-${label}`, width);
    await ctx.close();
  }
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {});
for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 1000]]) await run(browser, label, w, h);
await browser.close();
if (failures.length) {
  console.log(`FAILURES: ${failures.length}`);
  process.exit(1);
}
console.log("ALL PASS");
