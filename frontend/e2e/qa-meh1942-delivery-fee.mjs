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
 * EVERY `/api/` request is intercepted — see the single catch-all route below,
 * and the assertion that nothing escaped it. That is not belt-and-braces: the
 * first version routed three narrow patterns, believed it covered the surface,
 * and leaked one.
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

    // ONE route over the whole API surface, dispatching by path. Not three
    // narrow ones — that was the first version and it leaked.
    //
    // `**/api/producers/**` looks like it covers the producer surface and does
    // not: the glob requires a literal `/` after `producers`, so it matches
    // `/api/producers/<id>` but NOT the sibling feeds, which axios builds as
    // `/api/producers?city=…` and `/api/producers?category=…`
    // (useProducerData.js:108, :123). This fixture sets `city`, so the nearby
    // feed fired and reached the real network while the header claimed every
    // sibling was answered empty. It did not break the run — those requests
    // fail fast against an absent backend and `networkidle` still settles — but
    // the capture was only deterministic by luck, and against a REACHABLE
    // backend the screenshots would have carried live data.
    //
    // Caught by the different-model adversarial reviewer, not by the maker.
    // A catch-all plus an escape assertion removes the whole class rather than
    // patching the one pattern that was found.
    const escaped = [];
    await ctx.route("**/api/**", (route) => {
      const url = route.request().url();
      const json = (body) =>
        route.fulfill({ status: 200, contentType: "application/json", body });
      // The producer document: /api/producers/<id>, no query string.
      if (/\/api\/producers\/[^/?]+$/.test(url)) return json(JSON.stringify(PRODUCER));
      // Every list-shaped sibling answers empty: the producer feeds (similar,
      // nearby), events, and the city list the delivery checker autocompletes
      // against.
      if (/\/api\/(producers|events|cities)\b/.test(url)) return json("[]");
      // Shaped, not empty — `use-experiences-nav-gate.js:42` parses this with
      // `z.object({ count: int })` and a bare `[]` would fail that parse. The
      // gate is unrelated to delivery, so 0 keeps it closed and quiet.
      if (/\/api\/experiences\/count\b/.test(url)) return json('{"count":0}');
      // Anything else is a request this harness did not anticipate. Record it
      // and answer empty rather than letting it reach the network silently —
      // an unanticipated call is a finding, not something to swallow.
      escaped.push(url);
      return json("[]");
    });

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

    if (escaped.length) {
      failures.push(`${t.name}: ${escaped.length} unanticipated API call(s): ${JSON.stringify(escaped)}`);
    }

    console.log(
      `${t.name}: dir=${dir} · area fees=${JSON.stringify(texts)} · ` +
        `overflow=${overflow.doc}px · unanticipated API calls=${escaped.length}`,
    );
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
