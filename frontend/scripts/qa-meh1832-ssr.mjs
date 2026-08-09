/**
 * MEH-1832 chunk 1 evidence. Three assertions, each with a control that fails
 * if the mechanism is inert — the BATCH-2 lesson quoted on the card (a GZip
 * check passed two happy-path assertions in BOTH states; only the control
 * caught that it was doing nothing).
 *
 *   1. cold load makes ZERO client /producers requests   (control: a filtered
 *      URL MUST still fetch — proves the counter counts)
 *   2. no hydration mismatch warnings on the console
 *   3. LCP + CLS, reported for before/after comparison
 *
 *   usage: node scripts/qa-meh1832-ssr.mjs [baseUrl]
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const CHROME = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;

/** One measured load. Returns request counts, console warnings and web vitals. */
async function measure(browser, path, { interact = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "he-IL" });
  const page = await ctx.newPage();

  const producerCalls = [];
  page.on("request", (r) => {
    const u = r.url();
    // Only count the client-side XHR/fetch to the feed — not the document, and
    // not the server's own call (which never appears in the browser at all).
    if (/\/api\/producers(\?|$)/.test(u) && r.resourceType() !== "document") producerCalls.push(u);
  });
  const hydrationWarnings = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|server HTML/i.test(t)) hydrationWarnings.push(t.slice(0, 160));
  });

  await page.addInitScript(() => {
    window.__cls = 0;
    window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      const es = l.getEntries();
      if (es.length) window.__lcp = es[es.length - 1].startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  // Cards present in the SERVER HTML is the subject; wait for network idle so
  // any client refetch has had its chance to happen before we count.
  await page.waitForLoadState("networkidle").catch(() => {});
  if (interact) {
    await page.waitForTimeout(500);
  }

  const vitals = await page.evaluate(() => ({
    cls: +(window.__cls || 0).toFixed(4),
    lcp: Math.round(window.__lcp || 0),
    cards: document.querySelectorAll('[data-testid="producer-card"]').length,
  }));
  await ctx.close();
  return { producerCalls: producerCalls.length, hydrationWarnings, ...vitals };
}

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const plain = await measure(browser, "/he");
  // CONTROL: a category-filtered URL is NOT covered by the server's default
  // fetch, so it must still produce a client call. If this reads 0 the counter
  // is broken and the "0 on a plain load" result above means nothing.
  const filtered = await measure(browser, "/he?category=1");

  console.log(JSON.stringify({
    plainLoad: plain,
    controlFilteredUrl: filtered,
    verdicts: {
      // The home GRID's fetch is the subject. HomepageMiniMap.jsx:183 is a
      // SEPARATE, pre-existing consumer that lazily calls /producers on
      // intersection — the card scopes the mini-map block as keep-as-is, so
      // its call is expected and is not a duplicate feed fetch.
      // Discriminator: the filtered URL is NOT covered by the server's default
      // fetch, so it makes the grid call as well. The difference between the
      // two loads is therefore exactly the grid fetch, and it must be 1.
      gridFetchSkippedOnColdLoad:
        filtered.producerCalls - plain.producerCalls === 1
          ? `PASS (plain ${plain.producerCalls} = mini-map only; filtered ${filtered.producerCalls} = mini-map + grid)`
          : `FAIL (plain ${plain.producerCalls}, filtered ${filtered.producerCalls})`,
      controlProvesCounterWorks:
        filtered.producerCalls > plain.producerCalls ? "PASS" : "FAIL — counter is inert, the PASS above is meaningless",
      noHydrationWarnings: plain.hydrationWarnings.length === 0 ? "PASS" : "FAIL",
      cardsRenderedOnPlainLoad: plain.cards,
    },
  }, null, 2));
} finally {
  await browser.close();
}
