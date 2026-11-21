/**
 * MEH-1893 Phase 0 — READ ONLY. No product code is modified.
 *
 * Measures the live staging page. Deliberately does NOT assume the
 * [overlayActive, reposition] re-subscription lead: it instruments
 * window.addEventListener/removeEventListener and the handler itself, then
 * reports the raw timeline. Whatever the timeline shows is the finding.
 *
 * Probe self-check: the instrumentation must prove it is alive (nonzero
 * add-records) before any of its output is trusted. A silent probe reporting
 * "nothing happened" is indistinguishable from a working one.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TEST_URL || "https://staging.mehamakor.online";
const TRIGGER = '[data-testid="badge-overflow"]';
const PANEL = '[data-testid="badge-overflow-popover"]';

const INSTRUMENT = () => {
  window.__probe = { alive: false, adds: [], removes: [], calls: [], error: null };
  try {
    const origAdd = window.addEventListener.bind(window);
    const origRem = window.removeEventListener.bind(window);
    const wrapped = new Map();
    window.addEventListener = function (type, fn, opts) {
      if (type === "scroll" && opts && opts.capture) {
        window.__probe.alive = true;
        const id = window.__probe.adds.length;
        window.__probe.adds.push({ id, t: Math.round(performance.now()), y: window.scrollY });
        const proxy = function (...a) {
          const before = window.scrollY;
          const r = fn.apply(this, a);
          window.__probe.calls.push({ id, t: Math.round(performance.now()), y: before });
          return r;
        };
        wrapped.set(fn, proxy);
        return origAdd(type, proxy, opts);
      }
      return origAdd(type, fn, opts);
    };
    window.removeEventListener = function (type, fn, opts) {
      if (type === "scroll" && opts && opts.capture && wrapped.has(fn)) {
        window.__probe.removes.push({ t: Math.round(performance.now()), y: window.scrollY });
        const proxy = wrapped.get(fn);
        wrapped.delete(fn);
        return origRem(type, proxy, opts);
      }
      return origRem(type, fn, opts);
    };
  } catch (e) {
    window.__probe.error = String(e);
  }
};

async function run(label, { width, height, touch }) {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--ssl-version-max=tls1.2"],
  });
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
      "x-vercel-set-bypass-cookie": "true",
      "x-vercel-skip-toolbar": "1",
    },
  });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();

  const out = { label };
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-testid="producer-card"]', { timeout: 45000 });

    const trig = page.locator(TRIGGER).first();
    if ((await page.locator(TRIGGER).count()) === 0) {
      out.invalid = "no badge-overflow trigger on page";
      return out;
    }
    await trig.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    out.probeAliveBeforeOpen = await page.evaluate(() => window.__probe.alive);
    out.addsBeforeOpen = await page.evaluate(() => window.__probe.adds.length);

    const b = await trig.boundingBox();
    if (touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else await trig.click();
    await page.waitForTimeout(400);

    out.panelAfterOpen = await page.locator(PANEL).count();
    out.snapshotAtOpen = await page.evaluate(() => ({
      adds: window.__probe.adds.length,
      removes: window.__probe.removes.length,
      calls: window.__probe.calls.length,
      y: window.scrollY,
    }));

    const yBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(700);

    out.yMoved = `${yBefore} -> ${await page.evaluate(() => window.scrollY)}`;
    out.panelAfterScroll = await page.locator(PANEL).count();
    out.final = await page.evaluate(() => ({
      adds: window.__probe.adds,
      removes: window.__probe.removes.length,
      calls: window.__probe.calls,
      error: window.__probe.error,
    }));
  } catch (e) {
    out.error = e.message;
  } finally {
    await browser.close();
  }
  return out;
}

const runs = [
  await run("MOBILE 375 touch", { width: 375, height: 812, touch: true }),
  await run("DESKTOP 1440 mouse", { width: 1440, height: 900, touch: false }),
];

console.log("\n================ MEH-1893 PHASE 0 (read-only) ================");
for (const r of runs) {
  console.log(`\n--- ${r.label} ---`);
  if (r.invalid) { console.log("INVALID:", r.invalid); continue; }
  if (r.error) { console.log("ERROR:", r.error); continue; }
  console.log("probe alive before open :", r.probeAliveBeforeOpen, `(capture-scroll adds seen: ${r.addsBeforeOpen})`);
  console.log("panel after open        :", r.panelAfterOpen);
  console.log("at open  -> adds:", r.snapshotAtOpen.adds, "removes:", r.snapshotAtOpen.removes, "handler calls:", r.snapshotAtOpen.calls, "scrollY:", r.snapshotAtOpen.y);
  console.log("scrollY                 :", r.yMoved);
  console.log("panel after scroll      :", r.panelAfterScroll, r.panelAfterScroll === 0 ? "(dismissed)" : "(STILL OPEN)");
  console.log("final adds (id,t,yAtSubscribe):", JSON.stringify(r.final.adds));
  console.log("final removes           :", r.final.removes);
  console.log("handler invocations     :", JSON.stringify(r.final.calls));
  if (r.final.error) console.log("probe error:", r.final.error);
}
console.log(`
How to read:
  probe alive=false                      -> instrumentation dead; ignore everything else
  handler invocations = 0 while y moved  -> the listener never ran (not a baseline problem)
  invocation yAtCall == its add's y      -> baseline was re-captured at the current position
  many adds with rising y                -> re-subscription resets the baseline`);
