import { test, expect, type Page } from "./_cloudinary-stub";

/**
 * Spec:     site-sanity (MEH-2493)
 * Purpose:  the computed-style sweep that found MEH-2487 and MEH-2488, kept as a
 *           permanent gate so those defect classes cannot come back on any
 *           static page. Big sites run their one-off audits as CI checks for the
 *           same reason; one route per class (about.spec, hebrew-typography.spec)
 *           does not stop the next page from regressing.
 *
 *           Per route, over everything inside <main>:
 *             1. no Hebrew in a computed italic — no Hebrew face we ship has an
 *                italic, so the browser fakes a slant (MEH-2487);
 *             2. no letter-spaced Hebrew (DESIGN.md; MEH-2488);
 *             3. no Hebrew glyph rendered in a system face — measured with CDP
 *                `CSS.getPlatformFontsForNode`, the faces actually used, once per
 *                distinct (family, weight, style) so the walk stays cheap — one
 *                key resolves Hebrew to one face, so a sample per key is enough; the
 *                probe goes on the element of that key with the fewest typed
 *                symbols, so a symbol allowance cannot hide a stray face
 *                (MEH-2488: Hebrew inside .font-english fell to Liberation Serif);
 *             4. no active line-clamp switched off by its display (MEH-2487:
 *                `sm:block` beat `line-clamp-2`);
 *             5. no horizontal page scroll;
 *           Checks 6–7 cover every control in the document (header, footer and
 *           nav pill included), not only <main>:
 *             6. no interactive control outside the viewport's width — a control
 *                inside a horizontal scroller (a chip row) is skipped, it is
 *                reachable by scrolling (MEH-2514: «סינון» at x −11.6 at 320);
 *             7. no covered control — each one is scrolled to the viewport's
 *                middle and the element at its centre must be the control, a
 *                descendant, or its <label> (the MEH-2506 ✕ over «סינון»).
 *                Fixed chrome (nav pill, chat launcher) is out of scope at the
 *                middle by design; those overlaps are per-surface specs
 *                (MEH-2510 map.spec, MEH-2512 chat).
 *           And a second pass at 320×568 on the mobile project (checks 5 + 6)
 *           — the width the 28/10 phone sweep found both map bugs at (MEH-2515).
 * Control:  each route must render > 10 Hebrew-bearing elements in <main>, so a
 *           page that failed to render cannot pass every check by being empty;
 *           checks 6–7 must have measured > 3 controls, for the same reason.
 *           Every check is soft, so one failing route reports all of them.
 * Browser:  Chromium only — the face probe is CDP, which WebKit does not expose.
 * Routes:   static editorial and auth pages only — no API data, so the gate is
 *           deterministic. Both projects (375 mobile, 1440 desktop) run it.
 */

const ROUTES = [
  "/about",
  "/about/process",
  "/about/why-local",
  "/about/for-businesses",
  "/about/for-businesses/guides",
  "/about/for-businesses/guides/business-story",
  "/about/for-businesses/guides/customer-messages",
  "/about/for-businesses/guides/product-photography",
  "/accessibility",
  "/privacy",
  "/terms",
  "/join",
  "/register/producer",
];

// Faces allowed to render text in a Hebrew-bearing element: the two Hebrew
// faces, plus the latin faces that set the digits and latin runs beside them.
// Source of truth: app/fonts.js — a face added there turns every route red here,
// naming the face in the failure, until it is added to this list.
const BRAND_FACES = /^(Frank Ruhl Libre|Heebo|DM Sans|Cormorant Garamond)/i;

type Sweep = {
  hebrewCount: number;
  italic: string[];
  tracking: string[];
  clampOff: string[];
  overflowX: number;
  fontProbes: { id: string; symbols: number }[];
};

async function sweep(page: Page): Promise<Sweep> {
  return page.evaluate(() => {
    const HEB = /[֐-׿]/;
    const out: Sweep = { hebrewCount: 0, italic: [], tracking: [], clampOff: [], overflowX: 0, fontProbes: [] };
    const byKey = new Map<string, { el: HTMLElement; symbols: number }>();
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden") continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      const label = `${el.tagName.toLowerCase()} «${own.slice(0, 30)}»`;
      if (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && !["-webkit-box", "-webkit-inline-box", "flow-root"].includes(cs.display)) {
        out.clampOff.push(`${label} display=${cs.display}`);
      }
      if (!HEB.test(own)) continue;
      out.hebrewCount += 1;
      if (cs.fontStyle !== "normal") out.italic.push(label);
      if (parseFloat(cs.letterSpacing) > 0) out.tracking.push(`${label} ${cs.letterSpacing}`);
      const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`;
      // Typed symbols («←», «★») have no glyph in any brand face and fall to a
      // system face by design; only glyphs beyond their count are a finding.
      const symbols = [...own].filter((ch) => !/[\u0590-\u05FFA-Za-z0-9\s.,:;!?'"()\[\]\-–—·״׳/&%+@#*]/.test(ch)).length;
      const prev = byKey.get(key);
      if (!prev || symbols < prev.symbols) byKey.set(key, { el, symbols });
    }
    let probe = 0;
    for (const { el, symbols } of byKey.values()) {
      probe += 1;
      el.setAttribute("data-sanity-probe", String(probe));
      out.fontProbes.push({ id: String(probe), symbols });
    }
    out.overflowX = document.documentElement.scrollWidth - window.innerWidth;
    return out;
  });
}

type Layout = { controls: number; offscreen: string[]; covered: string[]; overflowX: number };

/**
 * Checks 5–7 (MEH-2515). `withCovered` is off for the 320 pass: the hit-test
 * scrolls every control, and covered-ness is not width-specific the way
 * off-screen is.
 */
async function layout(page: Page, withCovered: boolean): Promise<Layout> {
  return page.evaluate((withCovered) => {
    const CONTROL = "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch]";
    const out = { controls: 0, offscreen: [] as string[], covered: [] as string[], overflowX: 0 };
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}»`;
    // Reachable by scrolling something other than the page: a chip row.
    const inScroller = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if ((ox === "auto" || ox === "scroll") && a.scrollWidth > a.clientWidth) return true;
      }
      return false;
    };
    // The whole document, not just <main>: the header, footer and nav pill are
    // where a phone-width control most often falls off (and a static page has
    // as few as one control in <main>, too few for the control below).
    const controls = [...document.querySelectorAll<HTMLElement>(CONTROL)].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // ≤ 1px boxes are sr-only (skip links, visually-hidden inputs).
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && !el.closest("[aria-hidden=true], [inert]");
    });
    out.controls = controls.length;
    const vw = document.documentElement.clientWidth;
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if ((r.left < -0.5 || r.right > vw + 0.5) && !inScroller(el)) {
        out.offscreen.push(`${label(el)} x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      }
    }
    if (withCovered) {
      const html = document.documentElement;
      const prior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      for (const el of controls) {
        if (inScroller(el)) continue;
        el.scrollIntoView({ block: "center", inline: "nearest" });
        // The FIRST line box, not the bounding rect: a link that wraps has a
        // bounding-rect centre between its two fragments, on the paragraph.
        const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) continue; // taller than the viewport
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!hit || el.contains(hit)) continue;
        // Fixed/sticky chrome is out of scope (header above): a control near a
        // page edge cannot be centred and may legitimately sit under the nav
        // pill. Skip a hit inside fixed chrome the control is not part of.
        let chrome: Element | null = hit;
        while (chrome && !["fixed", "sticky"].includes(getComputedStyle(chrome).position)) chrome = chrome.parentElement;
        if (chrome && !chrome.contains(el)) continue;
        const labels = (el as HTMLInputElement).labels;
        if (labels && [...labels].some((l) => l.contains(hit))) continue;
        out.covered.push(`${label(el)} under ${label(hit)}`);
      }
      window.scrollTo(0, 0);
      html.style.scrollBehavior = prior;
    }
    out.overflowX = document.documentElement.scrollWidth - window.innerWidth;
    return out;
  }, withCovered);
}

async function strayFaces(page: Page, probes: Sweep["fontProbes"]): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const stray: string[] = [];
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    for (const { id, symbols } of probes) {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-sanity-probe="${id}"]` });
      if (!nodeId) continue;
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      const off = (fonts as { familyName: string; glyphCount: number }[]).filter((f) => !BRAND_FACES.test(f.familyName));
      const glyphs = off.reduce((a, f) => a + f.glyphCount, 0);
      if (glyphs > symbols) stray.push(`probe ${id}: ${off.map((f) => `${f.familyName} ×${f.glyphCount}`).join(", ")} (symbols ${symbols})`);
    }
  } finally {
    await cdp.detach();
  }
  await page.evaluate(() => document.querySelectorAll("[data-sanity-probe]").forEach((el) => el.removeAttribute("data-sanity-probe")));
  return stray;
}

test.describe("site sanity — Hebrew typesetting and layout on every static page (MEH-2493)", () => {
  // The probe's null is also its reassuring answer, so it ships with a control
  // (testing.md): plant one control of each defect class and require that
  // `layout` names both — if it ever stops seeing, this goes red first.
  test("control: the layout probe catches an off-screen and a covered control", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "same engine as the sweep");
    await page.goto("/about");
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const off = document.createElement("button");
      off.textContent = "planted-offscreen";
      // fixed: hanging off the left edge without widening the page, so the
      // rest of the layout (and every other control's position) is untouched.
      // rtl-ok: a physical left is the point — off the viewport's left edge.
      off.style.cssText = "position:fixed;top:200px;left:-60px;width:80px;height:30px";
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;margin:24px 0";
      const covered = document.createElement("button");
      covered.textContent = "planted-covered";
      const lid = document.createElement("div");
      lid.style.cssText = "position:absolute;inset:0;background:transparent";
      wrap.append(covered, lid);
      main.prepend(off, wrap);
    });
    const l = await layout(page, true);
    expect(l.offscreen.join(" | ")).toContain("planted-offscreen");
    expect(l.covered.join(" | ")).toContain("planted-covered");
  });

  for (const path of ROUTES) {
    test(`${path}`, async ({ page, browserName }, info) => {
      test.skip(browserName !== "chromium", "the face probe is CDP, Chromium only");
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const s = await sweep(page);
      expect(s.hebrewCount, "control: the page renders Hebrew in <main>").toBeGreaterThan(10);
      expect.soft(s.italic, "Hebrew in a faked italic").toEqual([]);
      expect.soft(s.tracking, "letter-spaced Hebrew").toEqual([]);
      expect.soft(s.clampOff, "line-clamp switched off by display").toEqual([]);
      expect.soft(s.overflowX, "horizontal page scroll (px)").toBeLessThanOrEqual(0);
      expect(s.fontProbes.length, "control: at least one font probe ran").toBeGreaterThan(0);
      expect.soft(await strayFaces(page, s.fontProbes), "Hebrew-bearing text in a non-brand face").toEqual([]);

      const l = await layout(page, true);
      expect(l.controls, "control: the layout checks measured controls").toBeGreaterThan(3);
      expect.soft(l.offscreen, "control outside the viewport width").toEqual([]);
      expect.soft(l.covered, "control covered at its centre").toEqual([]);

      // MEH-2515: 320 is where the 28/10 sweep found the off-screen class.
      // Gated on the device, not the project's name, so a rename cannot
      // silently skip the pass (CI review, #3764).
      if (info.project.use.isMobile) {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const n = await layout(page, false);
        expect(n.controls, "control (320): the layout checks measured controls").toBeGreaterThan(3);
        expect.soft(n.offscreen, "control outside the viewport width at 320").toEqual([]);
        expect.soft(n.overflowX, "horizontal page scroll at 320 (px)").toBeLessThanOrEqual(0);
      }
    });
  }
});
