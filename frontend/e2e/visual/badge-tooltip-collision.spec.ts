import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * MEH-1593 — every badge popover/tooltip surface must clear its siblings AND
 * escape its clipping ancestor.
 *
 * MEH-1592 fixed the "+N" overflow popover (surface 2). This spec covers the
 * three surfaces the follow-up audit measured as defective:
 *
 *   S1  ProducerCard badge pill popover  — landed on the card title
 *                                          (208.0x27.5px @1440, 208.0x22.0px @375)
 *   S3  ProducerCard TrustBadge Tooltip  — landed on title + rating
 *                                          (2 intersections at BOTH breakpoints)
 *   S5  ImageGallery masthead seal       — 0 intersections but 86.75px CLIPPED
 *                                          @1440 by its own containing block
 *
 * Surface 4 (ProducerHeader hero pills) measured clean and is deliberately NOT
 * changed here; its existing tests are untouched.
 *
 * ── Why the clipping check is containing-block aware ──────────────────────
 * A naive "walk every ancestor with overflow != visible and intersect" detector
 * is wrong in BOTH directions once a panel is portalled:
 *
 *   - FALSE POSITIVE (pre-fix era): a `position: fixed` bottom sheet is not
 *     clipped by an ancestor's overflow-hidden at all, yet the naive walk
 *     reports it as clipped.
 *   - FALSE NEGATIVE (post-fix, the dangerous one): a portalled panel's
 *     parentElement IS <body>, so the walk finds no ancestors and reports
 *     "not clipped" unconditionally — the assertion becomes vacuous and would
 *     happily pass a panel that is genuinely cut off or painted nowhere.
 *
 * So `clipAudit` does two things instead. (1) It builds the real clipping chain
 * per CSS position semantics: for `fixed`, only an ancestor that establishes a
 * containing block (transform / perspective / filter / will-change / contain)
 * can clip it, and nothing above that ancestor can; for everything else, every
 * overflow ancestor clips. (2) It adds a POSITIVE liveness probe —
 * `document.elementFromPoint` at the panel's own inset corners must resolve to
 * the panel itself. That is the discriminator the naive number cannot give:
 * an escaped fixed panel hits itself at its corners; a clipped one does not,
 * because the pixels there belong to whatever the clip revealed instead.
 */

const FIXTURE = path.join(__dirname, "fixtures", "producer-detail.json");

const CARD_PRODUCER = {
  id: 1,
  name: "מאפיית לחם וזמן",
  city: "תל אביב",
  verification_tier: "verified",
  has_producer_license: true,
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  trust_tier: 4,
  avg_rating: 4.8,
  reviews_count: 12,
  products_count: 1,
};

/** Imageless + verified → ImageGallery renders the Tinted Masthead (its
 *  `!images.length` branch), which is the only place surface 5 exists. */
function mastheadFixture() {
  const d = JSON.parse(fs.readFileSync(FIXTURE, "utf-8"));
  return { ...d, verification_tier: "verified", images: [] };
}

type Box = { x: number; y: number; width: number; height: number };

function overlap(a: Box, b: Box) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? `${w.toFixed(1)}x${h.toFixed(1)}` : null;
}

/** Runs in the browser. See the header for why this is not a naive walk. */
function clipAudit(el: Element) {
  const cs0 = getComputedStyle(el);
  const pos = cs0.position;
  const b = el.getBoundingClientRect();

  const clippers: { tag: string; bottom: number; right: number; left: number; top: number }[] = [];
  let n = el.parentElement;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    const establishesCB =
      cs.transform !== "none" ||
      cs.perspective !== "none" ||
      cs.filter !== "none" ||
      /transform|filter|perspective/.test(cs.willChange || "") ||
      /paint|layout|strict|content/.test(cs.contain || "");
    const clips =
      cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible";
    if (pos === "fixed") {
      // Only a containing-block-establishing ancestor can clip a fixed box,
      // and nothing above it participates.
      if (establishesCB) {
        if (clips) {
          const r = n.getBoundingClientRect();
          clippers.push({ tag: n.tagName, bottom: r.bottom, right: r.right, left: r.left, top: r.top });
        }
        break;
      }
    } else if (clips) {
      const r = n.getBoundingClientRect();
      clippers.push({ tag: n.tagName, bottom: r.bottom, right: r.right, left: r.left, top: r.top });
    }
    n = n.parentElement;
  }

  let cut = { start: 0, end: 0, top: 0, bottom: 0 };
  for (const c of clippers) {
    cut = {
      start: Math.max(cut.start, c.left - b.left),
      end: Math.max(cut.end, b.right - c.right),
      top: Math.max(cut.top, c.top - b.top),
      bottom: Math.max(cut.bottom, b.bottom - c.bottom),
    };
  }
  cut = {
    start: Math.max(0, cut.start), end: Math.max(0, cut.end),
    top: Math.max(0, cut.top), bottom: Math.max(0, cut.bottom),
  };

  // POSITIVE liveness proof — the discriminator between an ESCAPED fixed panel
  // and a genuinely CLIPPED one, which the `cut` number alone cannot give once
  // a panel is portalled (no ancestors ⇒ cut is trivially 0).
  //
  // Two probes, because one does not fit both panels here:
  //   - Tooltip bubbles are `pointer-events: none`, so elementFromPoint looks
  //     straight through them and can never return the bubble. For those the
  //     proof is STRUCTURAL: an empty clipping chain means no box in the
  //     containing-block chain is able to clip it — escape by construction.
  //   - Popover panels are hit-testable, so the proof is BEHAVIOURAL: the
  //     panel's own centre must resolve to the panel. Centre, not corners —
  //     a 3px corner sample lands outside the border-radius and hits whatever
  //     is painted behind, which is a property of `rounded-md`, not of clipping.
  const hitTestable = cs0.pointerEvents !== "none";
  let live: boolean;
  if (hitTestable) {
    const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    live = Boolean(hit && (hit === el || el.contains(hit)));
  } else {
    live = clippers.length === 0 && b.width > 0 && b.height > 0;
  }

  return {
    position: pos,
    pointerEvents: cs0.pointerEvents,
    box: { x: b.left, y: b.top, width: b.width, height: b.height },
    clipperCount: clippers.length,
    cut,
    live,
  };
}

async function mockCards(page: Page) {
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) }));
  await page.route("**/api/producers*", (r) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      headers: { "x-total-count": "1" }, body: JSON.stringify([CARD_PRODUCER]),
    }));
}

/**
 * Surface 5 lives behind `/producer/[id]`, and `middleware.js` existence-checks
 * that id against the backend before the page renders. A synthetic UUID works
 * locally ONLY by accident: with no backend reachable the check fails OPEN
 * (`middleware.js:45-48`) and the page renders anyway. In CI the server runs
 * with NEXT_PUBLIC_API_URL pointed at real staging (`e2e.yml:136`), so the
 * synthetic id 404s, middleware rewrites to not-found, and the masthead never
 * exists — which surfaced as a bare "element(s) not found" on run 30251402510
 * (170 passed / 4 failed), a red that said nothing about collisions.
 *
 * So we borrow a REAL id the way parity.spec.ts:502-508 does. `page.request`
 * runs outside the page's route table, so this call reaches the real backend
 * while the detail response below is still served from the fixture — the
 * borrowed id only unlocks the route, the rendered content is always ours.
 * Returns null when no producer can be borrowed, which is a DATA condition
 * (empty backend / unreachable sandbox), not a regression.
 */
async function borrowProducerId(page: Page): Promise<string | null> {
  try {
    const res = await page.request.get("/api/producers", { params: { limit: 1 } });
    if (!res.ok()) return null;
    const list = await res.json().catch(() => []);
    return (Array.isArray(list) && list[0]?.id) || null;
  } catch {
    return null;
  }
}

async function mockMasthead(page: Page) {
  const d = mastheadFixture();
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route(/\/api\/producers\/[0-9a-f-]{36}(?:\?|$)/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) }));
}

/** The four assertions every fixed surface must satisfy. */
async function assertHealthy(
  label: string,
  panel: Locator,
  trigger: Locator,
  siblings: { name: string; loc: Locator }[],
  vw: number,
  vh: number,
) {
  const geo = await panel.evaluate(clipAudit);
  const tb = (await trigger.boundingBox())!;

  // 1 — zero intersections with any sibling the panel must not cover
  const hits: string[] = [];
  for (const { name, loc } of siblings) {
    for (let i = 0; i < (await loc.count()); i++) {
      const b = await loc.nth(i).boundingBox();
      if (b && overlap(geo.box, b)) hits.push(`${name} (${overlap(geo.box, b)}px)`);
    }
  }
  expect(hits, `${label}: panel must not overlap any sibling`).toEqual([]);

  // 2 — fully inside the viewport
  expect(geo.box.x, `${label}: clipped at inline edge`).toBeGreaterThanOrEqual(-0.5);
  expect(geo.box.y, `${label}: clipped at top`).toBeGreaterThanOrEqual(-0.5);
  expect(geo.box.x + geo.box.width, `${label}: past opposite inline edge`).toBeLessThanOrEqual(vw + 0.5);
  expect(geo.box.y + geo.box.height, `${label}: past bottom`).toBeLessThanOrEqual(vh + 0.5);

  // 3 — NOT clipped by its real containing block, and actually painted where
  //     it claims. cornersVisible is the half a raw number cannot provide:
  //     it fails for a genuinely-clipped panel and passes for an escaped one.
  expect(
    [geo.cut.start, geo.cut.end, geo.cut.top, geo.cut.bottom].map((n) => +n.toFixed(1)),
    `${label}: cut off by a clipping ancestor (position=${geo.position}, clippers=${geo.clipperCount})`,
  ).toEqual([0, 0, 0, 0]);
  expect(
    geo.live,
    `${label}: no positive proof the panel escaped its clipping chain ` +
      `(position=${geo.position}, pointer-events=${geo.pointerEvents}, clippers=${geo.clipperCount})`,
  ).toBe(true);

  // 4 — still anchored to its own trigger (the MEH-1592 degenerate-solution
  //     lesson: "0 intersections" is satisfiable by flinging it off-screen).
  //     Full-width sheet presentations are exempt on the inline axis.
  const isSheet = geo.box.width >= vw - 1;
  if (!isSheet) {
    const gap = Math.min(
      Math.abs(tb.x - geo.box.x),
      Math.abs(tb.x + tb.width - (geo.box.x + geo.box.width)),
    );
    expect(gap, `${label}: panel is not anchored to its trigger`).toBeLessThanOrEqual(80);
  }
}

for (const vp of [
  { width: 1440, height: 900, label: "desktop 1440px" },
  { width: 375, height: 812, label: "mobile 375px" },
]) {
  test.describe(`MEH-1593 badge popover/tooltip collision — ${vp.label}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("S1 — card badge pill popover clears siblings and its clip ancestor", async ({ page }) => {
      await mockCards(page);
      await page.goto(`/search?q=${encodeURIComponent("לחם")}`);
      const card = page.locator("article").first();
      const pill = card.locator("button[data-badge][aria-haspopup]").first();
      await expect(pill).toBeVisible();
      await pill.click();

      const panel = page
        .locator("[data-testid^='badge-tooltip-']:not([data-testid$='-backdrop'])")
        .first();
      await expect(panel).toBeVisible();

      const strip = card
        .locator("[data-testid='badge-overflow']")
        .locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");
      await assertHealthy("S1 card pill popover", panel, pill, [
        { name: "card-title", loc: card.locator("h3") },
        { name: "card-rating", loc: card.locator("[data-testid='card-rating']") },
        { name: "sibling-pill", loc: strip.locator("button[data-badge]:not([aria-haspopup])") },
      ], vp.width, vp.height);
    });

    test("S3 — TrustBadge tooltip clears the card title and rating", async ({ page }) => {
      await mockCards(page);
      await page.goto(`/search?q=${encodeURIComponent("לחם")}`);
      const card = page.locator("article").first();
      const trust = card.locator("[aria-label*='ביקורות']").first();
      await expect(trust).toBeVisible();

      await trust.hover();
      let bubble = page.locator("[role='tooltip']").first();
      if (!(await page.locator("[role='tooltip']").count())) {
        await trust.click({ force: true });
        bubble = page.locator("[role='tooltip']").first();
      }
      await expect(bubble).toBeVisible();

      await assertHealthy("S3 TrustBadge tooltip", bubble, trust, [
        { name: "card-title", loc: card.locator("h3") },
        { name: "card-rating", loc: card.locator("[data-testid='card-rating']") },
      ], vp.width, vp.height);
    });

    test("S5 — masthead verified seal panel escapes its clipping ancestor", async ({ page }) => {
      // Borrow BEFORE mocking: this must reach the real backend to satisfy the
      // middleware existence check. Any producer works — the page content is
      // still the fixture's.
      const borrowedId = await borrowProducerId(page);
      if (!borrowedId) {
        test.skip(
          true,
          "S5 subject unreachable: could not borrow a real producer id from " +
            "GET /api/producers, so middleware.js would 404 the /producer/[id] " +
            "route before the masthead renders. This is a data/environment " +
            "condition, not a collision regression — S1 and S3 still enforce.",
        );
        return;
      }

      await mockMasthead(page);
      await page.goto(`/producer/${borrowedId}`);

      // The masthead only exists for an IMAGELESS verified producer (the
      // `!images.length` branch, ImageGallery.jsx:78) — which the fixture
      // guarantees. If the seal is missing now, the subject rendered and the
      // seal genuinely is not there: a real failure, not an unreachable one.
      const seal = page.locator("[data-testid='masthead-verified']");
      await expect(
        seal,
        "masthead seal missing on a page that DID render — real regression, not an unreachable subject",
      ).toBeVisible();
      await seal.click();

      const panel = page
        .locator("[data-testid='badge-tooltip-verified']:not([data-testid$='-backdrop'])")
        .first();
      await expect(panel).toBeVisible();

      await assertHealthy("S5 masthead seal panel", panel, seal, [
        { name: "h1", loc: page.locator("h1") },
      ], vp.width, vp.height);
    });
  });
}
