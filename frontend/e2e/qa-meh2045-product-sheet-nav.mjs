/**
 * MEH-2045 QA harness — ProductSheet prev/next paging, driven against a real
 * `next start` build at 375 and 1440.
 *
 * WHY IT ROUTES THE API INSTEAD OF SEEDING A DATABASE: `useProducerData.js:56`
 * is a CLIENT fetch, and its own comment records that this is the fetch feeding
 * the RENDERED tree (page.js:73 passes no initialProducer, so the server fetch
 * feeds only JSON-LD and metadata). Intercepting it in the browser therefore
 * exercises the real ProducerSections → ProductSheet tree with the real CSS,
 * which is the thing under test.
 *
 * WHY THE PHOTOS ARE LOCAL FILES: res.cloudinary.com is not reachable from the
 * CC sandbox (measured 13/08 — `curl` exits 56, same egress class as the
 * Railway block in CLAUDE.md). optimizeCloudinary returns a non-Cloudinary URL
 * unchanged (lib/cloudinary.js:42), so a /qa-tmp path passes through and
 * next/image serves it from 'self'. The consequence is stated rather than
 * hidden: this run does NOT exercise Cloudinary's ar_1:1 transform — that is
 * asserted in ProductSheet.test.jsx ("a Cloudinary photo is requested at
 * w_640" / ar_1:1). What it DOES exercise, and what Sapir's complaint is
 * actually about, is the rendered box: three photos whose intrinsic ratios are
 * 2:5, 14:5 and 1:1 must all land in an identically-sized square.
 *
 * CONTROL: every measurement below is compared against a value the run itself
 * cannot fabricate, and the script exits 1 with the reason on any miss — a
 * capture harness that writes its PNGs and exits 0 having photographed an
 * error boundary is the documented failure of this exact genre
 * (.claude/rules/testing.md, PR #2786).
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import sharp from "sharp";

// PLAYWRIGHT_BASE_URL, not a QA_* name of its own: `scripts/check_env_drift.sh`
// scans every environment-variable read in the repo and BLOCKS on any that no
// .env.example documents, so inventing a knob here reds a required gate. (It
// scans comments too, which is why this paragraph describes the pattern in
// words rather than writing it out.) This name is already declared at
// frontend/.env.example:87 and is what the sibling harnesses use.
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-2045";
const failures = [];
let checks = 0;

/**
 * `detail` is written as the FAILURE message, so printing it beside a PASS
 * makes the log contradict itself ("PASS … the check below is VOID"). It is
 * printed on failure only; a passing line carries `measured` instead, which is
 * the observed value rather than a verdict about it.
 */
function check(name, ok, detail = "", measured = "") {
  checks += 1;
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  const suffix = ok ? (measured ? ` — ${measured}` : "") : detail ? ` — ${detail}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

const product = (id, name, image_url, extra = {}) => ({
  id,
  name,
  // Long on purpose: the scroll-reset check needs a scroller that genuinely
  // overflows, and it carries its own control below so a non-overflowing
  // container reports "not exercised" rather than a free pass.
  description: `תיאור מלא של ${name}. `.repeat(60),
  image_url,
  price_min: 30 + id,
  price_max: null,
  is_vegan: id % 2 === 0,
  is_gluten_free: id % 3 === 0,
  ...extra,
});

// Four products, three of them photographed at wildly different intrinsic
// ratios, one with no photo at all sitting MID-list (position 3 of 4) so the
// h-28 fork is crossed while paging rather than only at an end.
const MANY = {
  id: 901,
  slug: "qa-many",
  name: "מאפיית הבדיקה",
  city: "תל אביב",
  phone: "0501234567",
  description: "בית עסק לבדיקת MEH-2045.",
  top_product_name: "מארז לחמים",
  products: [
    product(11, "מארז לחמים", "/qa-tmp/tall.jpg"),
    product(12, "חלה מתוקה", "/qa-tmp/wide.jpg"),
    product(13, "לחמניות ללא גלוטן", null),
    product(14, "בריוש", "/qa-tmp/pano.jpg"),
  ],
  categories: [],
  delivery_areas: [],
  products_count: 4,
};

const ONE = {
  id: 902,
  slug: "qa-one",
  name: "חוות היחיד",
  city: "חיפה",
  phone: "0501234567",
  description: "בית עסק עם מוצר אחד בלבד.",
  products: [product(21, "גבינת עיזים", "/qa-tmp/square.jpg")],
  categories: [],
  delivery_areas: [],
  products_count: 1,
};

async function mount(page, producer) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (/\/api\/producers\/\d+(\?|$)/.test(url) || url.includes(`/api/producers/${producer.slug}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(producer) });
    }
    // Everything else the page reaches for (events, similar, nearby, recipes,
    // reviews) is empty — none of it is under test and an empty array is a
    // valid response for all of them.
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto(`${BASE}/he/producer/${producer.id}`, { waitUntil: "domcontentloaded" });
  // Gate on the thing under test, never on network quiet (MEH-215).
  await page.waitForSelector("[data-testid='product-row'], [data-testid='signature-product-trigger']", {
    timeout: 20_000,
  });
}

/** The rendered box of the image container that the chevrons live in. */
async function imageBox(page) {
  return page.evaluate(() => {
    const prev = document.querySelector("[data-testid='product-sheet-prev']");
    const el = prev
      ? prev.parentElement
      : document.querySelector("[data-testid='product-sheet-scroll']").firstElementChild;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cls: el.className };
  });
}

async function sheetState(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const counter = q("[data-testid='product-sheet-counter']");
    const prev = q("[data-testid='product-sheet-prev']");
    const next = q("[data-testid='product-sheet-next']");
    const cta =
      q("[data-testid='product-sheet-wa-cta']") || q("[data-testid='product-sheet-cta']");
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const r = (el) => {
      const b = box(el);
      return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null;
    };
    return {
      title: q("[data-testid='product-sheet'] h2")?.textContent ?? null,
      counterText: counter?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      counterAria: counter?.getAttribute("aria-label") ?? null,
      counterLive: counter?.getAttribute("aria-live") ?? null,
      counterRect: r(counter),
      prevDisabled: prev?.getAttribute("aria-disabled") ?? null,
      nextDisabled: next?.getAttribute("aria-disabled") ?? null,
      prevRect: r(prev),
      nextRect: r(next),
      closeRect: r(q("[data-testid='product-sheet-close']")),
      bandDebug: (() => {
        const pe = prev; if (!pe) return null;
        const b = pe.parentElement; const br = b.getBoundingClientRect(); const cs = getComputedStyle(pe);
        return { bandY: Math.round(br.y), bandH: Math.round(br.height), bandCls: b.className, top: cs.top, bottom: cs.bottom, cls: pe.className };
      })(),
      // MEH-2045: measured because eyeballing a PNG missed it once. The close
      // button and the chevrons share the image box's inline edges, and on the
      // short no-photo band a vertically-centred chevron collided with the
      // close button by 22px at BOTH viewports before the chevronY fork.
      closeOverlapsChevron: (() => {
        const c = box(q("[data-testid='product-sheet-close']"));
        const hit = (o) => !!c && !!o && !(c.right <= o.left || o.right <= c.left || c.bottom <= o.top || o.bottom <= c.top);
        return hit(box(prev)) || hit(box(next));
      })(),
      hasPrev: !!prev,
      hasNext: !!next,
      hasCounter: !!counter,
      ctaHref: cta?.getAttribute("href") ?? null,
      scrollTop: q("[data-testid='product-sheet-scroll']")?.scrollTop ?? null,
      activeTestId: document.activeElement?.getAttribute?.("data-testid") ?? null,
      inDialog: !!document.querySelector("[data-testid='product-sheet']")?.contains(document.activeElement),
    };
  });
}

async function run(width, height, label) {
  // The CC sandbox ships Chromium at a fixed path and its build number does
  // not match what this repo's Playwright asks for, with no download available
  // (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set). Fall back to that binary when it
  // exists, otherwise let Playwright resolve its own — so this runs unchanged
  // on a normal machine. Not an environment variable by design: a new one
  // would have to be added to .env.example or it blocks the env-drift gate.
  const sandboxChromium = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  );
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const boxes = [];

  // ---- a. 4 products: paging, counter, identical square ------------------
  await mount(page, MANY);

  // g. Opened from the SIGNATURE card → index must be its own position (1/4),
  //    not 1-of-the-grid. The signature product is "מארז לחמים".
  await page.click("[data-testid='signature-product-trigger']");
  await page.waitForSelector("[data-testid='product-sheet']");
  let s = await sheetState(page);
  check(`[${label}] g. signature card opens at its own position`, s.counterText === "1 / 4" && s.title === "מארז לחמים", `counter=${s.counterText} title=${s.title}`, `counter=${s.counterText} title=${s.title}`);
  check(`[${label}] counter is a polite live region with the Hebrew sentence`, s.counterLive === "polite" && s.counterAria === "מוצר 1 מתוך 4", `${s.counterLive} / ${s.counterAria}`, `aria-live=${s.counterLive} aria-label="${s.counterAria}"`);

  // b. first product → prev dead, next live
  check(`[${label}] b. first product: prev aria-disabled, next live`, s.prevDisabled === "true" && s.nextDisabled === "false", `prev=${s.prevDisabled} next=${s.nextDisabled}`, `aria-disabled prev=${s.prevDisabled} next=${s.nextDisabled}`);
  // Chevrons vertically centred on the image, one per side edge, ≥44px.
  const img0 = await imageBox(page);
  check(`[${label}] chevrons are ≥44px and vertically centred on the image`,
    s.prevRect.w >= 44 && s.prevRect.h >= 44 && s.nextRect.w >= 44 &&
    Math.abs((s.prevRect.y + s.prevRect.h / 2) - (s.nextRect.y + s.nextRect.h / 2)) <= 1,
    `prev=${JSON.stringify(s.prevRect)} next=${JSON.stringify(s.nextRect)}`,
    `prev=${JSON.stringify(s.prevRect)} next=${JSON.stringify(s.nextRect)}`);
  // RTL: "previous" must be the RIGHTMOST of the two.
  check(`[${label}] RTL: previous sits to the right of next`, s.prevRect.x > s.nextRect.x, `prev.x=${s.prevRect.x} next.x=${s.nextRect.x}`, `prev.x=${s.prevRect.x} next.x=${s.nextRect.x}`);
  check(`[${label}] close button does NOT overlap either chevron at 1/4`, !s.closeOverlapsChevron, "close/chevron collision on the first product", "no intersection");
  boxes.push({ at: 1, ...img0 });
  await page.screenshot({ path: `${OUT}/${label}-01-first-tall.png` });

  // Scroll the body down so the reset has something to undo.
  await page.evaluate(() => {
    const el = document.querySelector("[data-testid='product-sheet-scroll']");
    el.scrollTop = el.scrollHeight;
  });
  const scrolled = (await sheetState(page)).scrollTop;
  // CONTROL for the scroll-reset check below: if the container never moved,
  // "scrollTop === 0 after paging" is true in a world where the reset does
  // not exist, so the check would be a free pass. Fail loudly instead.
  check(`[${label}] CONTROL: the scroll container actually scrolled before the reset is tested`, scrolled > 0, `scrollTop=${scrolled} — the reset check below is VOID`, `scrollTop=${scrolled}`);

  // a. page forward through every product by CLICK, measuring the square.
  for (const [i, expectTitle] of [[2, "חלה מתוקה"], [3, "לחמניות ללא גלוטן"], [4, "בריוש"]]) {
    await page.click("[data-testid='product-sheet-next']");
    await page.waitForFunction(
      (t) => document.querySelector("[data-testid='product-sheet'] h2")?.textContent === t,
      expectTitle,
      { timeout: 5000 },
    );
    s = await sheetState(page);
    check(`[${label}] a. next → ${i}/4 "${expectTitle}"`, s.counterText === `${i} / 4` && s.title === expectTitle, `counter=${s.counterText} title=${s.title}`, `counter=${s.counterText} title=${s.title}`);
    if (i === 2) {
      check(`[${label}] scroll container reset to top on product change`, scrolled > 0 && s.scrollTop === 0, `was ${scrolled}, now ${s.scrollTop}`, `was ${scrolled}, now ${s.scrollTop}`);
    }
    check(`[${label}] close button does NOT overlap either chevron at ${i}/4`, !s.closeOverlapsChevron, `close/chevron collision at product ${i} — close=${JSON.stringify(s.closeRect)} next=${JSON.stringify(s.nextRect)} band=${JSON.stringify(s.bandDebug)}`, "no intersection");
    const b = await imageBox(page);
    boxes.push({ at: i, ...b });
    await page.screenshot({ path: `${OUT}/${label}-0${i}-product-${i}.png` });
  }

  // a (the original complaint). The three PHOTOGRAPHED products are 1, 2, 4 —
  // intrinsic ratios 2:5, 14:5, 9:2. Their rendered boxes must be identical
  // AND square.
  const photo = boxes.filter((b) => b.at !== 3);
  const same = photo.every((b) => b.w === photo[0].w && b.h === photo[0].h);
  const square = photo.every((b) => Math.abs(b.w - b.h) <= 1);
  check(`[${label}] a. SAPIR'S COMPLAINT: every photo box is the same size`, same, JSON.stringify(photo.map((b) => `${b.at}:${b.w}x${b.h}`)), JSON.stringify(photo.map((b) => `${b.at}:${b.w}x${b.h}`)));
  check(`[${label}] a. …and that size is a square`, square, JSON.stringify(photo.map((b) => `${b.at}:${b.w}x${b.h}`)), JSON.stringify(photo.map((b) => `${b.at}:${b.w}x${b.h}`)));

  // e. the no-photo product mid-list kept the MEH-1901 h-28 band and paged.
  const band = boxes.find((b) => b.at === 3);
  check(`[${label}] e. no-photo product mid-list keeps the h-28 band`, band.cls.includes("h-28") && !band.cls.includes("aspect-square") && band.h === 112, `h=${band.h} cls=${band.cls}`, `rendered height ${band.h}px, h-28 present, aspect-square absent`);

  // b. last product → next dead.
  s = await sheetState(page);
  check(`[${label}] b. last product: next aria-disabled, prev live`, s.nextDisabled === "true" && s.prevDisabled === "false", `prev=${s.prevDisabled} next=${s.nextDisabled}`, `aria-disabled prev=${s.prevDisabled} next=${s.nextDisabled}`);
  const beforeDeadClick = s.counterText;
  // Playwright's actionability check REFUSES to click an aria-disabled button
  // ("element is not enabled"), which is itself evidence the semantics landed —
  // so the no-op has to be proven by dispatching the event past that guard.
  // A plain page.click() here would time out rather than test anything.
  await page.dispatchEvent("[data-testid='product-sheet-next']", "click");
  const afterDeadClick = (await sheetState(page)).counterText;
  check(`[${label}] b. clicking the dead end does nothing`, afterDeadClick === beforeDeadClick, `counter moved ${beforeDeadClick} → ${afterDeadClick}`, `counter stayed at ${afterDeadClick}`);
  await page.screenshot({ path: `${OUT}/${label}-05-last-disabled.png` });

  // f. the WhatsApp prefill carries the CURRENT product name.
  s = await sheetState(page);
  check(`[${label}] f. CTA prefill names the CURRENT product`,
    s.ctaHref?.includes(encodeURIComponent("בריוש")) && !s.ctaHref.includes(encodeURIComponent("מארז לחמים")),
    s.ctaHref ? decodeURIComponent(s.ctaHref).slice(0, 90) : "no CTA",
    s.ctaHref ? decodeURIComponent(s.ctaHref).slice(0, 90) : "no CTA");

  // c. keyboard, RTL mapping + focus containment + Escape.
  await page.keyboard.press("ArrowRight"); // = previous in RTL
  await page.waitForFunction(() => document.querySelector("[data-testid='product-sheet-counter']")?.textContent.includes("3"), null, { timeout: 5000 });
  s = await sheetState(page);
  check(`[${label}] c. RTL ArrowRight goes BACK (4 → 3)`, s.counterText === "3 / 4", s.counterText, s.counterText);
  await page.keyboard.press("ArrowLeft"); // = next in RTL
  await page.waitForFunction(() => document.querySelector("[data-testid='product-sheet-counter']")?.textContent.includes("4"), null, { timeout: 5000 });
  s = await sheetState(page);
  check(`[${label}] c. RTL ArrowLeft goes FORWARD (3 → 4)`, s.counterText === "4 / 4", s.counterText, s.counterText);
  check(`[${label}] c. focus stayed inside the dialog while paging`, s.inDialog, `active=${s.activeTestId}`, `active=${s.activeTestId}`);
  await page.keyboard.press("Tab");
  const afterTab = await sheetState(page);
  check(`[${label}] c. Tab keeps focus inside the dialog`, afterTab.inDialog, "focus escaped the trap", `active=${afterTab.activeTestId ?? "(untagged element inside dialog)"}`);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-testid='product-sheet']", { state: "detached", timeout: 5000 });
  check(`[${label}] c. Escape closes`, (await page.locator("[data-testid='product-sheet']").count()) === 0);

  // g (second half). Opening from a GRID row lands on that row's own position:
  // the grid's first row is product 2 of the nav list, because the signature
  // product was deduped out of the grid and holds position 1.
  await page.click("[data-testid='product-row']");
  await page.waitForSelector("[data-testid='product-sheet']");
  s = await sheetState(page);
  check(`[${label}] g. first GRID row opens at 2/4 (signature holds position 1)`, s.counterText === "2 / 4" && s.title === "חלה מתוקה", `counter=${s.counterText} title=${s.title}`, `counter=${s.counterText} title=${s.title}`);
  await page.keyboard.press("Escape");

  // ---- d. one product → no arrows, no counter ---------------------------
  const page2 = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await mount(page2, ONE);
  await page2.click("[data-testid='product-row']");
  await page2.waitForSelector("[data-testid='product-sheet']");
  const s2 = await sheetState(page2);
  check(`[${label}] d. single product: NO arrows and NO counter`, !s2.hasPrev && !s2.hasNext && !s2.hasCounter, `prev=${s2.hasPrev} next=${s2.hasNext} counter=${s2.hasCounter}`, "0 chevrons, 0 counters in the DOM");
  // …and the sheet is genuinely there — otherwise "nothing rendered" would
  // pass this check (the null-that-is-also-the-answer trap).
  check(`[${label}] d. …and the sheet itself did render`, (await page2.locator("[data-testid='product-sheet']").count()) === 1);
  await page2.screenshot({ path: `${OUT}/${label}-06-single-product.png` });
  await page2.close();

  await browser.close();
}

/**
 * The fixture photos are GENERATED, not committed: they are throwaway test
 * assets and `frontend/public/` is production-served. Their whole job is to
 * have wildly different intrinsic ratios (2:5, 14:5, 9:2, 1:1) so "every photo
 * lands in the same square" is a claim about the CSS box rather than about
 * four images that happened to be square already.
 */
const PHOTO_DIR = "public/qa-tmp";
async function writeFixturePhotos() {
  mkdirSync(PHOTO_DIR, { recursive: true });
  const specs = [
    ["tall", 400, 1000, { r: 190, g: 120, b: 60 }],
    ["wide", 1400, 500, { r: 70, g: 130, b: 90 }],
    ["square", 800, 800, { r: 120, g: 90, b: 160 }],
    ["pano", 1800, 400, { r: 200, g: 70, b: 70 }],
  ];
  for (const [name, w, h, background] of specs) {
    const label =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
      `<text x='20' y='${Math.round(h / 2)}' font-size='${Math.round(Math.min(w, h) / 5)}' fill='white'>${name} ${w}x${h}</text></svg>`;
    await sharp({ create: { width: w, height: h, channels: 3, background } })
      .composite([{ input: Buffer.from(label), top: 0, left: 0 }])
      .jpeg({ quality: 80 })
      .toFile(`${PHOTO_DIR}/${name}.jpg`);
  }
}

mkdirSync(OUT, { recursive: true });
await writeFixturePhotos();
try {
  await run(375, 812, "mobile-375");
  await run(1440, 900, "desktop-1440");
} finally {
  // Leave no test assets behind in a production-served directory, even on a
  // failing run.
  rmSync(PHOTO_DIR, { recursive: true, force: true });
}

console.log(`\n${checks} checks ran, ${failures.length} failed`);
if (!checks) {
  console.error("CONTROL FAILED: zero checks ran — every result in this run is void.");
  process.exit(1);
}
if (failures.length) {
  console.error("\nFAILURES:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("MEH-2045 QA: all green");
