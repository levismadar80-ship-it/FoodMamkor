/**
 * MEH-1853 — CLS measurement harness for the producer-detail page.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT A LOCAL RUN
 * -----------------------------------------------
 * The ticket's DoD needs 12 CLS numbers taken against **staging**, and that is
 * not performable from the CC sandbox. Measured 03/08, all four combinations:
 * `--ssl-version-max=tls1.2` breaks the sandbox proxy's own CONNECT tunnel
 * (github fails too), and without the cap the Vercel edge resets this
 * Chromium's TLS-1.3 handshake — the exact condition the cap exists for. The
 * two requirements cannot both be satisfied through that proxy, so a browser in
 * the sandbox cannot reach staging at all. `curl` can (302), but CLS needs a
 * browser.
 *
 * A GitHub Actions runner talks to the Vercel edge directly — no proxy, no cap
 * needed, contradiction gone. So the measurement moves to CI. Sapir's ruling
 * 03/08, and it also rejected the two alternatives for reasons worth keeping:
 * running it on her machine works but makes the number unrepeatable (the point
 * is that "did MiniMap regress?" is answerable in two months without her), and
 * a local build measures the wrong thing — fonts, Cloudinary images and edge
 * latency are all different, so twelve numbers off a local build are worse than
 * none because they look like evidence.
 *
 * THE CONTROL IS NOT DECORATION — IT RUNS FIRST
 * ---------------------------------------------
 * Mobile CLS on this page is reported as 0.0000. That is a green with two
 * possible causes: "no shift happened" and "the sampler never installed". They
 * are indistinguishable from the number alone. So before any real measurement
 * this harness forces a KNOWN layout shift and asserts the observer recorded
 * it. If the control fails, every number in the run is unreadable and the
 * harness says so and exits non-zero rather than emitting a reassuring 0.
 *
 * `installed` is reported per sample for the same reason — a PerformanceObserver
 * that threw at construction would otherwise report exactly like a calm page.
 *
 * Usage:
 *   node e2e/qa-meh1853-cls.mjs --url https://staging.mehamakor.online \
 *     --path /producer/<id> --runs 3 --out cls-results.json
 *
 * Env: VERCEL_AUTOMATION_BYPASS_SECRET (or VERCEL_BYPASS_SECRET) — staging sits
 * behind Vercel Deployment Protection; without the header a request 302s to
 * the SSO wall and never reaches the app. Read from env only, never logged.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = (arg("url", "https://staging.mehamakor.online") || "").replace(/\/$/, "");
const TARGET_PATH = arg("path", "");
const RUNS = Number(arg("runs", "3"));
const OUT = arg("out", "cls-results.json");
const BYPASS =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_BYPASS_SECRET || "";

const VIEWPORTS = [
  { label: "mobile-375", width: 375, height: 812 },
  { label: "desktop-1440", width: 1440, height: 900 },
];

// Installed via addInitScript so it is live before first paint. It deliberately
// touches NOTHING on document.documentElement: inside addInitScript that is
// still null, and an observer that throws there dies silently and reports a
// clean zero — the failure mode this file is built to rule out.
const SAMPLER = `
  window.__cls = { value: 0, entries: 0, installed: false, error: null };
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) { window.__cls.value += e.value; window.__cls.entries++; }
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
    window.__cls.installed = true;
  } catch (err) {
    window.__cls.error = String(err && err.message ? err.message : err);
  }
`;

async function newPage(browser, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    ...(BYPASS ? { extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS } } : {}),
  });
  const page = await ctx.newPage();
  await page.addInitScript(SAMPLER);
  return { ctx, page };
}

const readCls = (page) => page.evaluate(() => ({ ...window.__cls }));

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // CLS accrues after networkidle too (late images, client-gated sections).
  await page.waitForTimeout(2500);
}

/**
 * CONTROL — prove the sampler counts a real shift before trusting any zero.
 * Injects a tall block at the top of <body>, which displaces everything below
 * it. Returns the delta the observer attributed to that injection.
 */
async function control(browser) {
  const { ctx, page } = await newPage(browser, VIEWPORTS[0]);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const before = await readCls(page);
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "height:420px;background:#ccc";
    document.body.insertBefore(d, document.body.firstChild);
  });
  await page.waitForTimeout(1200);
  const after = await readCls(page);
  await ctx.close();
  const delta = after.value - before.value;
  return { installed: after.installed, error: after.error, before: before.value, after: after.value, delta };
}

async function measure(browser, vp, path, run) {
  const { ctx, page } = await newPage(browser, vp);
  const url = `${BASE}${path}`;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page);
  const cls = await readCls(page);
  await ctx.close();
  return {
    viewport: vp.label, path, run, url,
    status: res ? res.status() : null,
    cls: Number(cls.value.toFixed(4)),
    entries: cls.entries,
    installed: cls.installed,
    observerError: cls.error,
  };
}

async function main() {
  if (!TARGET_PATH) {
    console.error("ERROR: --path is required (e.g. --path /producer/<id>)");
    process.exit(2);
  }
  if (!BYPASS) {
    // Loud, not a silent skip: without the header staging 302s to the SSO wall
    // and every sample would measure the redirect target, not the page.
    console.error(
      "ERROR: VERCEL_AUTOMATION_BYPASS_SECRET is unset. Staging is behind Vercel\n" +
      "Deployment Protection; without the bypass header this would measure the SSO\n" +
      "redirect and report numbers that look real. Refusing to run."
    );
    process.exit(2);
  }

  const browser = await chromium.launch();
  console.log(`base=${BASE} path=${TARGET_PATH} runs=${RUNS}`);

  // ---- control first ----
  const ctrl = await control(browser);
  console.log(`CONTROL installed=${ctrl.installed} delta=${ctrl.delta.toFixed(4)} (${ctrl.before} -> ${ctrl.after})`);
  const controlOk = ctrl.installed && ctrl.delta > 0.01;
  if (!controlOk) {
    console.error(
      "CONTROL FAILED — the sampler did not record a forced layout shift.\n" +
      "Every number this run would produce is unreadable; a 0.0000 here would be\n" +
      "indistinguishable from a dead observer. Not emitting measurements."
    );
    fs.writeFileSync(OUT, JSON.stringify({ control: ctrl, controlOk, samples: [] }, null, 2));
    await browser.close();
    process.exit(1);
  }

  // ---- 3 loads x 2 viewports ----
  const samples = [];
  for (const vp of VIEWPORTS) {
    for (let run = 1; run <= RUNS; run++) {
      const s = await measure(browser, vp, TARGET_PATH, run);
      samples.push(s);
      console.log(
        `${s.viewport} run${s.run}: cls=${s.cls} entries=${s.entries} installed=${s.installed} status=${s.status}`
      );
    }
  }
  await browser.close();

  const worst = samples.reduce((a, b) => (b.cls > a.cls ? b : a), samples[0]);
  const payload = { base: BASE, path: TARGET_PATH, control: ctrl, controlOk, samples, worst };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nworst: ${worst.viewport} cls=${worst.cls}`);
  console.log(`wrote ${OUT}`);

  // Any sample whose observer never installed invalidates that sample.
  const dead = samples.filter((s) => !s.installed);
  if (dead.length) {
    console.error(`FAILED — ${dead.length} sample(s) had no observer installed.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
