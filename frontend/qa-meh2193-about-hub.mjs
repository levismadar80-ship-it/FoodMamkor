/**
 * MEH-2193 self-QA harness — /about hub exits, fact block, business strip,
 * and the data-gated counter, at 375 and 1440.
 *
 * Two things this harness refuses to do, both because a screenshot is not the
 * evidence — the verified state is:
 *
 *  1. It ASSERTS the new markup is present before it photographs anything, and
 *     exits non-zero if it is not. A capture harness that writes N PNGs and
 *     exits 0 having photographed an error boundary is a documented failure in
 *     this repo; the assertions are what separate the two.
 *  2. It runs a CONTROL first (C0) that must find the block on a page where it
 *     is known to exist. If the control finds nothing, every later "hidden"
 *     result in this run is void — a null that is also the reassuring answer.
 *
 * The counter is captured in BOTH of its states, because the hidden one is the
 * default here (no local backend) and a run that only ever saw "hidden" cannot
 * distinguish a working gate from a dead component.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// QA_BASE_URL is the repo's established harness knob and is on
// check_env_drift.sh's SYSTEM_EXCLUDE list precisely because it configures the
// TEST RUNNER, not the app. An earlier version of this file invented QA_BASE
// and QA_OUT, which are the same class of thing under names the gate does not
// know — so Env drift correctly failed the required CI gate. The fix is to use
// the sanctioned name and hardcode the output dir, NOT to widen the exclude
// list or add harness knobs to .env.example (which that script's own comments
// call actively wrong: it would tell a developer to configure something the
// app never reads).
const BASE = process.env.QA_BASE_URL || "http://localhost:3211";
const OUT = "../qa-artifacts/MEH-2193";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const REQUIRED = [
  "about-updated-at",
  "about-exit-story",
  "about-exit-comparison",
  "about-exit-benefits",
  "about-biz-strip",
  "how-we-choose-process-link",
];

let failures = 0;
const ran = [];

function check(label, ok, detail = "") {
  ran.push(label);
  if (ok) {
    console.log(`  PASS  ${label}${detail ? " — " + detail : ""}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
}

// The sandbox ships chromium build 1194 while this Playwright pins 1234, so the
// bundled resolver misses. Point it at the installed binary instead of
// downloading one (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set here).
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

try {
  // ---- C0: control. The block must be findable on a page where it exists. ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/about`, { waitUntil: "domcontentloaded" });
    const n = await page.getByTestId("how-we-choose-process-link").count();
    check("C0 control: block is findable on /about", n === 1, `count=${n}`);
    if (n !== 1) {
      console.log("\n  !! CONTROL FAILED — every 'hidden' result below is VOID. !!\n");
    }
    await page.close();
  }

  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.width}x${vp.height}]`);

    // ---- default state: no backend, so the counter must be absent ----
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${BASE}/about`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200); // let FadeInSection reveal + the count fetch settle

    for (const id of REQUIRED) {
      const c = await page.getByTestId(id).count();
      check(`${vp.name} · exactly one ${id}`, c === 1, `count=${c}`);
    }

    // Exit hrefs land where the card says they land.
    for (const [id, href] of [
      ["about-exit-story", "/producers"],
      ["about-exit-comparison", "/about/process"],
      ["about-exit-benefits", "/map"],
      ["about-biz-strip", "/about/for-businesses"],
    ]) {
      const got = await page.getByTestId(id).getAttribute("href");
      check(`${vp.name} · ${id} -> ${href}`, got === href, `href=${got}`);
    }

    // Exits are links, never buttons (the card's editorial-tone constraint).
    const tag = await page.getByTestId("about-exit-story").evaluate((el) => el.tagName);
    check(`${vp.name} · exits are <a>, not <button>`, tag === "A", `tag=${tag}`);

    const hiddenCount = await page.getByTestId("how-we-choose-count").count();
    check(`${vp.name} · counter hidden with no backend`, hiddenCount === 0, `count=${hiddenCount}`);

    // A fullPage capture of /about is near-useless as evidence: FadeInSection
    // leaves un-revealed sections at opacity:0 while they still occupy height
    // (MEH-1514), so most of the frame comes out blank. Capture each new
    // element scrolled into view instead — and assert it is actually VISIBLE,
    // not merely present, so a photograph of a transparent section cannot pass
    // for a photograph of a rendered one.
    for (const id of ["about-updated-at", "about-exit-story", "about-exit-comparison", "about-exit-benefits", "about-biz-strip"]) {
      const el = page.getByTestId(id);
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      const visible = await el.isVisible();
      const opacity = await el.evaluate((node) => {
        let cur = node;
        while (cur && cur !== document.body) {
          const o = Number(getComputedStyle(cur).opacity);
          if (o < 0.99) return o;
          cur = cur.parentElement;
        }
        return 1;
      });
      check(`${vp.name} · ${id} visible (opacity >= 0.99)`, visible && opacity >= 0.99, `visible=${visible} opacity=${opacity}`);
      await page.screenshot({ path: `${OUT}/${vp.name}-${id}.png` });
    }
    await page.screenshot({ path: `${OUT}/about-${vp.name}-full.png`, fullPage: true });
    await page.close();

    // ---- counter-visible state: stub the endpoint at 12 (>= 10) ----
    const page2 = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page2.route("**/producers/count", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 12 }) })
    );
    await page2.goto(`${BASE}/about`, { waitUntil: "domcontentloaded" });
    const line = page2.getByTestId("how-we-choose-count");
    await line.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    const shown = await line.count();
    check(`${vp.name} · counter visible when the endpoint returns 12`, shown === 1, `count=${shown}`);
    if (shown === 1) {
      const txt = (await line.textContent()) || "";
      check(`${vp.name} · counter text carries the number`, txt.includes("12"), JSON.stringify(txt));
    }
    // Frame the fact block so the counter is legible in the capture.
    const block = page2.getByTestId("how-we-choose-process-link");
    await block.scrollIntoViewIfNeeded();
    await page2.waitForTimeout(700);
    await page2.screenshot({ path: `${OUT}/about-${vp.name}-counter-12.png` });
    await page2.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${ran.length} assertions ran · ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
