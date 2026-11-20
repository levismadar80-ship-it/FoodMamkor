/**
 * MEH-2138 self-QA — the pricing accordion's empty state.
 *
 * A copy-only change, so the risk is not "does it compile" but two things a
 * diff cannot show:
 *   1. Does the new string actually REACH the surface? A key edited in the
 *      wrong nesting level type-checks fine and renders the raw key path.
 *   2. Does the string FIT? Hebrew «לא חובה — …» is 46 chars against the old
 *      27, on a one-line summary inside a collapsed accordion header at 375px.
 *      A promise the reader cannot finish reading is not a clarification.
 *
 * Case 0 is a control with a known answer, run FIRST: it asserts the probe
 * reads the SUPPLIED summary for an accordion whose value IS set (price +
 * signature product). If the probe reports the empty-state string there too,
 * it is reading something other than the summary and every later PASS is void.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2138-pricing-optional-copy.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2138";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXPECTED_EMPTY = "לא חובה — מחיר ומוצר מוביל יוצגו בעמוד העסק כשיוגדרו";

let failures = 0;
const ran = [];
const check = (label, ok, detail) => {
  ran.push(label);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

const producer = (over = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית הבוקר",
  slug: "morning-bakery",
  status: "approved",
  description: "לחם מחמצת יומי",
  short_description: "מחמצת יומית",
  city: "תל אביב",
  phone: "0501234567",
  whatsapp: "0501234567",
  categories: [{ id: 1, name: "לחמים ואפייה" }],
  products: [],
  images: [],
  locations: [],
  delivery_areas: [],
  price_range: null,
  top_product_name: null,
  ...over,
});

async function stub(page, prod) {
  // Registered FIRST: Playwright matches routes in REVERSE registration order,
  // so a catch-all added last swallows every specific handler after it.
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, email: "owner@mehamakor.online", name: "בעלת עסק", role: "producer" }),
    })
  );
  // EXACT path, not `**/producers/me**`. That glob also matches
  // /producers/me/products, /producers/me/locations and ten more subroutes, so
  // the first version of this harness answered every one of them with the
  // producer OBJECT — the page called `.map` on it and rendered its error
  // boundary («משהו השתבש»), which reads exactly like "the accordion is not
  // visible". The locator timeout named the wrong thing; the console error
  // (`c?.map is not a function`) named the right one.
  await page.route(
    (url) => url.pathname.endsWith("/producers/me"),
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prod) })
  );
  await page.addInitScript(() => localStorage.setItem("token", "qa-token"));
}

/** Reads the pricing accordion's rendered summary line + its overflow state. */
function readSummary(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-testid="accordion-pricing"]');
    if (!btn) return { found: false };
    // The summary is the muted one-liner under the heading, inside the button.
    const spans = [...btn.querySelectorAll("span")];
    const summary = spans.find((s) => s.className.includes("text-fg-muted") && s.textContent.trim());
    if (!summary) return { found: true, summary: null };
    const r = summary.getBoundingClientRect();
    return {
      found: true,
      summary: summary.textContent.trim(),
      // scrollWidth > clientWidth means the line is clipped/ellipsised.
      clipped: summary.scrollWidth > summary.clientWidth + 1,
      w: Math.round(r.width),
      scrollW: summary.scrollWidth,
      clientW: summary.clientWidth,
    };
  });
}

async function open(browser, width, prod) {
  const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 900 } });
  await stub(page, prod);
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("CONSOLE:", m.text().slice(0, 300)); });
  // ?group=profile — the edit page opens on a HUB of four groups; the pricing
  // accordion lives inside "profile" and is present-but-hidden until that group
  // is entered (page.js:187,197,229). Without the param the locator times out on
  // an element that exists, which reads like a missing accordion.
  await page.goto(`${BASE}/producer/dashboard/edit?group=profile`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator('[data-testid="accordion-pricing"]').waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    // A timeout here says "not visible", which is also what a redirect, an auth
    // gate or an error boundary produces. Dump what IS on the page so the next
    // reader diagnoses the real state instead of the locator.
    const seen = await page.evaluate(() => ({
      url: location.href,
      testids: [...document.querySelectorAll("[data-testid]")].map((n) => n.dataset.testid).slice(0, 40),
      text: document.body.innerText.slice(0, 400),
    }));
    console.error("DIAGNOSTIC — what the page actually rendered:", JSON.stringify(seen, null, 1));
    throw err;
  }
  await page.waitForTimeout(300);
  return page;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ── case 0: control. An accordion whose value IS set must NOT read as empty. ──
  const ctlPage = await open(browser, 1440, producer({ price_range: "₪20-₪40", top_product_name: "חלה" }));
  const ctl = await readSummary(ctlPage);
  await ctlPage.close();
  check(
    "0. control: a pricing accordion WITH values does not render the empty-state string",
    ctl.found && ctl.summary && ctl.summary !== EXPECTED_EMPTY && ctl.summary.includes("חלה"),
    `summary=${JSON.stringify(ctl.summary)}` +
      (ctl.found && ctl.summary && ctl.summary !== EXPECTED_EMPTY
        ? ""
        : " — ⛔ CONTROL FAILED: the probe is not reading the summary; every PASS below is void")
  );

  for (const width of [375, 1440]) {
    const page = await open(browser, width, producer());
    const r = await readSummary(page);

    check(`${width}: the pricing accordion renders a summary`, r.found && !!r.summary, JSON.stringify(r.summary));
    check(
      `${width}: it is the NEW approved string, byte-for-byte`,
      r.summary === EXPECTED_EMPTY,
      `got=${JSON.stringify(r.summary)}`
    );
    check(
      `${width}: the string is NOT a raw key path (i.e. the key resolved)`,
      !!r.summary && !r.summary.includes("edit_accordion.") && !r.summary.includes("pricing_summary_empty"),
      `got=${JSON.stringify(r.summary)}`
    );
    check(
      `${width}: the line is not clipped — the reader can finish the sentence`,
      r.clipped === false,
      `rendered=${r.w}px scrollWidth=${r.scrollW} clientWidth=${r.clientW}`
    );

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/pricing-empty-${width}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/pricing-empty-${width}-viewport.png` });
    console.log(`      screenshots → ${OUT}/pricing-empty-${width}{,-viewport}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — ${ran.length} assertions, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
