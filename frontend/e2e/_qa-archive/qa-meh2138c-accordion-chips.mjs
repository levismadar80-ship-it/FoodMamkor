/**
 * MEH-2138 chunk C self-QA — the «חובה» / «רשות» chip on every accordion header.
 *
 * vitest already proves WHICH cards claim to be required. What it cannot show,
 * because jsdom does no layout, is the two things this chip can get wrong on a
 * real surface:
 *   1. Does the chip FIT beside the title at 375px, or does it push the chevron
 *      off-screen / wrap the header to two lines?
 *   2. Does it COLLIDE with the title under RTL, where the chip sits after
 *      Hebrew text whose inline end is the opposite side from LTR?
 *
 * Case 0 is a control with a known answer, run FIRST: it asserts the probe finds
 * a non-zero-size chip. Two zero-size boxes never intersect, so a collision
 * check against `{0,0,0,0}` passes identically for a correct header and a
 * completely broken one — the exact failure MEH-2148's harness shipped.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2138c-accordion-chips.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2138c";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Read from he.json rather than retyped — a retyped string is a second owner,
// and it passes while the rendered one is wrong.
const HE = JSON.parse(fs.readFileSync("./messages/he.json", "utf8"));
const ACC = HE.dashboard.producer.edit_accordion;
const REQUIRED_LABEL = ACC.chip_required;
const OPTIONAL_LABEL = ACC.chip_optional;

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
  status: "draft",
  description: "לחם מחמצת יומי",
  short_description: "מחמצת יומית",
  city: "תל אביב",
  phone: "0501234567",
  whatsapp: "0501234567",
  categories: [{ id: 1, name: "לחמים ואפייה", slug: "bread" }],
  products: [],
  images: [],
  locations: [],
  delivery_areas: [],
  price_range: null,
  top_product_name: null,
  top_product_id: null,
  ...over,
});

async function stub(page, prod) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "owner@mehamakor.online",
        name: "בעלת עסק",
        role: "producer",
      }),
    }),
  );
  // EXACT path — `**/producers/me**` also swallows /products, /locations and
  // ten more subroutes, answering each with the producer OBJECT; the page then
  // calls .map on it and renders its error boundary, which reads exactly like
  // "the accordion is not visible" (learned on the chunk-A harness).
  await page.route(
    (url) => url.pathname.endsWith("/producers/me"),
    (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(prod) }),
  );
  await page.addInitScript(() => localStorage.setItem("token", "qa-token"));
}

/**
 * Every rendered chip in the visible group, with its box and its geometric
 * relationship to the title beside it.
 */
function readChips(page) {
  return page.evaluate(() => {
    const out = [];
    for (const chip of document.querySelectorAll('[data-testid^="section-chip-"]')) {
      const btn = chip.closest("button");
      if (!btn || btn.offsetParent === null) continue; // hidden group
      const titleEl = chip.previousElementSibling;
      const c = chip.getBoundingClientRect();
      const t = titleEl ? titleEl.getBoundingClientRect() : null;
      const caret = btn.querySelector("svg, [data-testid='caret']");
      const k = caret ? caret.getBoundingClientRect() : null;
      out.push({
        anchor: chip.dataset.testid.replace("section-chip-", ""),
        label: chip.textContent.trim(),
        w: Math.round(c.width),
        h: Math.round(c.height),
        // Overlap with the title box. Zero-size boxes never intersect, which is
        // why case 0 gates this whole reading.
        overlapsTitle:
          !!t && c.left < t.right - 1 && t.left < c.right - 1 && c.top < t.bottom - 1 && t.top < c.bottom - 1,
        // The chevron must stay inside the viewport — the header is one row.
        caretEdge: k ? Math.round(k.right) : null,
        headerH: Math.round(btn.getBoundingClientRect().height),
      });
    }
    return { chips: out, viewportW: window.innerWidth };
  });
}

async function open(browser, width, prod) {
  const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 900 } });
  await stub(page, prod);
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE:", m.text().slice(0, 300));
  });
  // ?group=profile — the edit page opens on a HUB of four groups; the accordion
  // cards are present-but-hidden until a group is entered.
  await page.goto(`${BASE}/producer/dashboard/edit?group=profile`, {
    waitUntil: "domcontentloaded",
  });
  try {
    await page
      .locator('[data-testid="accordion-images"]')
      .waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
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

  // ── case 0: control ────────────────────────────────────────────────────────
  const ctlPage = await open(browser, 1440, producer());
  const ctl = await readChips(ctlPage);
  const sized = ctl.chips.filter((c) => c.w > 0 && c.h > 0);
  check(
    "0. CONTROL: chips are found AND have non-zero boxes",
    ctl.chips.length >= 5 && sized.length === ctl.chips.length,
    ctl.chips.length >= 5 && sized.length === ctl.chips.length
      ? `${ctl.chips.length} chips, all sized`
      : `found=${ctl.chips.length} sized=${sized.length} — ⛔ CONTROL FAILED: ` +
        "a zero-size box never intersects anything, so every overlap PASS below is void",
  );
  await ctlPage.close();

  for (const width of [375, 1440]) {
    const page = await open(browser, width, producer());
    const r = await readChips(page);

    check(`${width}: every visible card carries a chip`, r.chips.length >= 5, `${r.chips.length} chips`);

    const labelled = r.chips.filter((c) => c.label === REQUIRED_LABEL || c.label === OPTIONAL_LABEL);
    check(
      `${width}: every chip reads «${REQUIRED_LABEL}» or «${OPTIONAL_LABEL}» — no raw key path`,
      labelled.length === r.chips.length,
      `${labelled.length}/${r.chips.length}; got ${JSON.stringify([...new Set(r.chips.map((c) => c.label))])}`,
    );

    const collided = r.chips.filter((c) => c.overlapsTitle);
    check(`${width}: no chip overlaps its title under RTL`, collided.length === 0,
      collided.length ? JSON.stringify(collided.map((c) => c.anchor)) : "0 collisions");

    const spilled = r.chips.filter((c) => c.caretEdge !== null && c.caretEdge > r.viewportW);
    check(`${width}: the chevron stays inside the viewport`, spilled.length === 0,
      spilled.length ? JSON.stringify(spilled.map((c) => `${c.anchor}@${c.caretEdge}`)) : `viewport=${r.viewportW}`);

    // A header that wrapped to two lines is ~2x the single-line height. Not a
    // hard pixel budget — a threshold that only a genuine wrap crosses.
    const tall = r.chips.filter((c) => c.headerH > 140);
    check(`${width}: no header blew up (title + chip stay on one row)`, tall.length === 0,
      `max header height=${Math.max(...r.chips.map((c) => c.headerH))}px`);

    await page.screenshot({ path: `${OUT}/accordion-chips-${width}.png`, fullPage: false });
    console.log(`  → ${OUT}/accordion-chips-${width}.png`);
    console.log(`  chips: ${JSON.stringify(r.chips.map((c) => `${c.anchor}=${c.label}`))}`);

    await page.close();
  }

  await browser.close();
  // Derived, never stated — a literal would go stale the moment a case is added.
  console.log(`\n${failures ? "FAIL" : "PASS"} — ${ran.length - failures}/${ran.length} assertions`);
  process.exit(failures ? 1 : 0);
}

main();
