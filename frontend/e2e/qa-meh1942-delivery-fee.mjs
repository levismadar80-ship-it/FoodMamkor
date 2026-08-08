/**
 * MEH-1942 — mobile QA capture for the per-area delivery fee.
 *
 * WHY THIS ONE ROUTES THE API, when `e2e/CLAUDE.md` says specs do not mock.
 * That rule governs FLOW SPECS under `e2e/flows/` (MEH-417 — mocks hid real
 * backend bugs for 8 CI cycles). This is neither a flow spec nor part of the CI
 * suite: it is a one-off capture harness, and the CC sandbox cannot reach the
 * backend at all (`*.up.railway.app` egress is blocked, staging sits behind
 * Vercel SSO). The choice here is not "mock vs real data" — it is "a crafted
 * payload vs no evidence".
 *
 * What it still proves end-to-end, and this is the point: the payload goes
 * through the REAL `useProducerData` parse (`ProducerDetailSchema.loose()`),
 * the REAL nested schema, and the REAL `DeliveryBlock`. Only the network hop is
 * substituted. Against the pre-fix schema the free city renders the producer's
 * 25₪; against the fixed one it renders משלוח חינם.
 *
 * Run: node e2e/qa-meh1942-delivery-fee.mjs [baseURL]
 */
import { chromium, devices } from "@playwright/test";
import { mkdirSync, existsSync, readdirSync } from "node:fs";

/**
 * Resolve a Chromium binary without reading an environment variable — the
 * `Env drift (.env.example)` gate reds any env read that is not documented, and
 * a sandbox-only browser path is not application configuration. Probe the known
 * location; otherwise let Playwright resolve its own, which is what CI does.
 */
function resolveChromium() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    const candidate = `${root}/${entry}/chrome-linux/chrome`;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const BASE = process.argv[2] || "http://localhost:3100";
const OUT = "../qa-artifacts/MEH-1942";

// The producer-level rate is 25. חיפה overrides to 0 (FREE), עכו to 30.
// Two areas, not one: the component only consults per-area fees when they vary
// (DeliveryBlock.jsx:430), so a lone override is a different, still-open gap.
const PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "משק הראל",
  slug: "meshek-harel",
  description: "בשר בקר מהמרעה",
  city: "כרמיאל",
  phone: "0501234567",
  status: "approved",
  categories: [],
  locations: [],
  products: [],
  offers_delivery: true,
  delivery_fee: 25,
  delivery_areas: [
    { id: "a1", city: "חיפה", delivery_fee: 0, delivery_day: "ראשון", min_order: 150 },
    { id: "a2", city: "עכו", delivery_fee: 30, delivery_day: "ראשון", min_order: 150 },
  ],
};

const TARGETS = [
  { name: "iphone-390x844", viewport: { width: 390, height: 844 }, ua: devices["iPhone 13"].userAgent, scale: 3 },
  { name: "pixel5-393x851", viewport: { width: 393, height: 851 }, ua: devices["Pixel 5"].userAgent, scale: 2.75 },
];

const failures = [];

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: resolveChromium() });

  for (const t of TARGETS) {
    const ctx = await browser.newContext({
      viewport: t.viewport,
      userAgent: t.ua,
      deviceScaleFactor: t.scale,
      isMobile: true,
      hasTouch: true,
      locale: "he-IL",
    });

    // Only the producer document is substituted. The sibling feeds (events,
    // similar, nearby) answer empty so the page settles instead of hanging.
    await ctx.route("**/api/producers/**", (route) => {
      const url = route.request().url();
      if (/\/api\/producers\/[^?]+/.test(url) && !url.includes("?")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PRODUCER) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await ctx.route("**/api/events**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

    const page = await ctx.newPage();
    await page.goto(`${BASE}/he/producer/${PRODUCER.id}`, { waitUntil: "networkidle" });

    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
    if (dir !== "rtl") failures.push(`${t.name}: expected dir=rtl, got ${dir}`);

    const fees = page.getByTestId("area-fee");
    await fees.first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
    const texts = await fees.allTextContents();

    // THE assertion. Before the schema fix both rows resolved to the producer's
    // 25 and neither said חינם.
    if (!texts.some((f) => f.includes("חינם"))) {
      failures.push(`${t.name}: free area does not render חינם — got ${JSON.stringify(texts)}`);
    }
    if (texts.some((f) => f.includes("25"))) {
      failures.push(`${t.name}: an area row shows the producer rate 25 — got ${JSON.stringify(texts)}`);
    }
    if (!texts.some((f) => f.includes("30"))) {
      failures.push(`${t.name}: the 30₪ override is missing — got ${JSON.stringify(texts)}`);
    }

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    if (overflow.doc > 1 || overflow.body > 1) {
      failures.push(`${t.name}: horizontal overflow doc=${overflow.doc}px body=${overflow.body}px`);
    }

    // Frame the delivery section rather than the whole document — a fullPage
    // shot of this page is mostly unrelated surface.
    const section = page.locator("section", { has: page.getByTestId("area-fee").first() }).first();
    const target = (await section.count()) ? section : page.locator("body");
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${OUT}/${t.name}-delivery.png` });

    console.log(`${t.name}: dir=${dir} · area fees=${JSON.stringify(texts)} · overflow=${overflow.doc}px`);
    await ctx.close();
  }

  await browser.close();
  if (failures.length) {
    console.error("\nFAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
