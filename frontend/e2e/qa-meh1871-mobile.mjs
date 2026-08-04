/**
 * MEH-1871 mobile QA — overlay Popover dismissal under touch emulation.
 *
 * The batch shipped with Chromium 375/1440 desktop-input coverage only. This
 * runs the same surface with hasTouch/isMobile on, against live staging.
 *
 * KNOWN LIMIT (stated, not worked around): this is Chromium touch EMULATION.
 * WebKit / real iOS momentum scroll is NOT covered — see MEH-1788.
 *
 * Sandbox note: --ssl-version-max=tls1.2 is required from the CC sandbox or the
 * Vercel edge drops the TLS-1.3 ClientHello (.claude/rules/testing.md).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.TEST_URL || "https://staging.mehamakor.online";
const OUT = "qa-artifacts/MEH-1871-mobile";
const TRIGGER = '[data-testid="badge-overflow"]';
const PANEL = '[data-testid="badge-overflow-popover"]';

const results = [];
const record = (step, status, detail) => {
  results.push({ step, status, detail });
  console.log(`${status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️ "} ${step} — ${detail}`);
};

mkdirSync(OUT, { recursive: true });

// The sandbox ships chromium build 1194 while this project's @playwright/test
// expects 1234, so point at the installed binary rather than re-downloading.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  extraHTTPHeaders: {
    "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    "x-vercel-set-bypass-cookie": "true",
    "x-vercel-skip-toolbar": "1",
  },
});
const page = await ctx.newPage();

/** Real touch scroll gesture via CDP — not window.scrollBy. */
async function touchScroll(pixels) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 187,
    y: 500,
    xDistance: 0,
    yDistance: -pixels,
    gestureSourceType: "touch",
    speed: 800,
  });
  await cdp.detach();
}

const panelCount = () => page.locator(PANEL).count();

try {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="producer-card"]', { timeout: 45000 });

  const triggers = page.locator(TRIGGER);
  const n = await triggers.count();
  if (n === 0) {
    record("PRECONDITION", "INVALID", `0 ${TRIGGER} on ${BASE}/ — no card has enough badges to overflow. Cannot test.`);
    throw new Error("precondition");
  }
  record("PRECONDITION", "PASS", `${n} badge-overflow trigger(s) present; touch emulation on (hasTouch, isMobile, 375x812)`);

  // ---------- Steps 1+2: tap an ABOVE-FOLD trigger, panel opens ----------
  const first = triggers.first();
  await first.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400); // let that scroll settle BEFORE opening
  const box = await first.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(350);

  const openedCount = await panelCount();
  const expanded = await first.getAttribute("aria-expanded");
  await page.screenshot({ path: `${OUT}/1-panel-open-375.png` });
  if (openedCount === 1) {
    record("STEP 1+2 tap opens panel", "PASS", `panel count=1, trigger aria-expanded=${expanded}`);
  } else {
    record("STEP 1+2 tap opens panel", "FAIL", `panel count=${openedCount} (expected 1), aria-expanded=${expanded}`);
    throw new Error("step2");
  }

  // ---------- Step 3: touch-scroll dismisses (GONE, not repositioned) ----------
  const beforeY = await page.evaluate(() => window.scrollY);
  const panelBoxBefore = await page.locator(PANEL).boundingBox();
  await touchScroll(220);
  await page.waitForTimeout(500);
  const afterY = await page.evaluate(() => window.scrollY);
  const remaining = await panelCount();
  await page.screenshot({ path: `${OUT}/2-after-touch-scroll-375.png` });

  if (afterY === beforeY) {
    record("STEP 3 touch-scroll dismisses", "INVALID", `page did not move (scrollY stayed ${beforeY}) — the gesture never scrolled, so this proves nothing`);
    throw new Error("step3-invalid");
  } else if (remaining === 0) {
    record("STEP 3 touch-scroll dismisses", "PASS", `scrollY ${beforeY}→${afterY}; panel count=0 — removed from DOM, not repositioned (open box was ${Math.round(panelBoxBefore.y)}px)`);
  } else {
    const after = await page.locator(PANEL).boundingBox();
    record("STEP 3 touch-scroll dismisses", "FAIL", `scrollY ${beforeY}→${afterY} but panel count=${remaining}; box y ${Math.round(panelBoxBefore.y)}→${after ? Math.round(after.y) : "n/a"} (repositioned/clamped instead of dismissed)`);
    throw new Error("step3");
  }

  // ---------- Step 4: BELOW-FOLD trigger — the case the first fix broke ----------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="producer-card"]', { timeout: 45000 });
  await page.waitForTimeout(600);

  // Find a trigger genuinely below the fold; do NOT pre-scroll it into view —
  // the delayed scroll-into-view caused BY the tap is the thing under test.
  const belowIdx = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    const vh = window.innerHeight;
    for (let i = 0; i < els.length; i++) {
      if (els[i].getBoundingClientRect().top > vh) return i;
    }
    return -1;
  }, TRIGGER);

  if (belowIdx === -1) {
    record("STEP 4 below-fold tap", "INVALID", "no badge-overflow trigger sits below the fold on this page — the 150ms scroll-into-view case cannot be exercised here");
  } else {
    const target = triggers.nth(belowIdx);
    const yAtClick = await page.evaluate(() => window.scrollY);
    // focus()+click() in page context: focus triggers the browser's own
    // scroll-into-view, which is what emits the delayed scroll event.
    await target.evaluate((el) => { el.focus(); el.click(); });

    // Sample across the window in which the delayed scroll lands.
    const samples = [];
    for (const t of [80, 160, 260, 400, 650]) {
      await page.waitForTimeout(t === 80 ? 80 : t - samples[samples.length - 1].t);
      samples.push({ t, y: await page.evaluate(() => window.scrollY), panels: await panelCount() });
    }
    const moved = samples[samples.length - 1].y !== yAtClick;
    const survived = samples.every((s) => s.panels === 1);
    await page.screenshot({ path: `${OUT}/3-belowfold-after-open-375.png` });
    const trace = samples.map((s) => `${s.t}ms:y=${s.y},panels=${s.panels}`).join(" ");

    if (!moved) {
      record("STEP 4a survives tap-induced scroll", "INVALID", `scroll-into-view never fired (scrollY stayed ${yAtClick}) — the regression case was not reproduced. ${trace}`);
    } else if (survived) {
      record("STEP 4a survives tap-induced scroll", "PASS", `scrollY ${yAtClick}→${samples[samples.length - 1].y} from the tap itself; panel stayed open throughout. ${trace}`);
    } else {
      record("STEP 4a survives tap-induced scroll", "FAIL", `panel closed during the tap-induced scroll — the MEH-1871 regression. ${trace}`);
      throw new Error("step4a");
    }

    if (await panelCount() === 1) {
      const b4 = await page.evaluate(() => window.scrollY);
      await touchScroll(200);
      await page.waitForTimeout(500);
      const af = await page.evaluate(() => window.scrollY);
      const left = await panelCount();
      await page.screenshot({ path: `${OUT}/4-belowfold-after-real-scroll-375.png` });
      if (af === b4) {
        record("STEP 4b real scroll dismisses", "INVALID", `page did not move (scrollY ${b4}) — gesture failed, proves nothing`);
      } else if (left === 0) {
        record("STEP 4b real scroll dismisses", "PASS", `scrollY ${b4}→${af}; panel count=0`);
      } else {
        record("STEP 4b real scroll dismisses", "FAIL", `scrollY ${b4}→${af} but panel count=${left} — survived a real scroll`);
      }
    } else {
      record("STEP 4b real scroll dismisses", "SKIP", "panel already closed after 4a");
    }
  }
} catch (e) {
  if (!["precondition", "step2", "step3", "step3-invalid", "step4a"].includes(e.message)) {
    record("HARNESS", "FAIL", `unexpected error: ${e.message}`);
  }
} finally {
  console.log("\n===== SUMMARY =====");
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.step}`);
  console.log(`\nArtifacts: ${OUT}/`);
  console.log("LIMIT: Chromium touch emulation only. WebKit / real iOS momentum scroll NOT covered (MEH-1788).");
  await browser.close();
}
