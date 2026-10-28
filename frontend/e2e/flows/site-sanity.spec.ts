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
 *                distinct (family, weight, style) so the walk stays cheap
 *                (MEH-2488: Hebrew inside .font-english fell to Liberation Serif);
 *             4. no active line-clamp switched off by its display (MEH-2487:
 *                `sm:block` beat `line-clamp-2`);
 *             5. no horizontal page scroll.
 * Control:  each route must render > 10 Hebrew-bearing elements in <main>, so a
 *           page that failed to render cannot pass every check by being empty.
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
    const seen = new Set<string>();
    let probe = 0;
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
      if (!seen.has(key)) {
        seen.add(key);
        probe += 1;
        el.setAttribute("data-sanity-probe", String(probe));
        // Typed symbols («←», «★») have no glyph in any brand face and fall to a
        // system face by design; only glyphs beyond their count are a finding.
        const symbols = [...own].filter((ch) => !/[\u0590-\u05FFA-Za-z0-9\s.,:;!?'"()\[\]\-–—·״׳/&%+@#*]/.test(ch)).length;
        out.fontProbes.push({ id: String(probe), symbols });
      }
    }
    out.overflowX = document.documentElement.scrollWidth - window.innerWidth;
    return out;
  });
}

async function strayFaces(page: Page, probes: Sweep["fontProbes"]): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const stray: string[] = [];
  for (const { id, symbols } of probes) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-sanity-probe="${id}"]` });
    if (!nodeId) continue;
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const off = (fonts as { familyName: string; glyphCount: number }[]).filter((f) => !BRAND_FACES.test(f.familyName));
    const glyphs = off.reduce((a, f) => a + f.glyphCount, 0);
    if (glyphs > symbols) stray.push(`probe ${id}: ${off.map((f) => `${f.familyName} ×${f.glyphCount}`).join(", ")} (symbols ${symbols})`);
  }
  await cdp.detach();
  return stray;
}

test.describe("site sanity — Hebrew typesetting and layout on every static page (MEH-2493)", () => {
  for (const path of ROUTES) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const s = await sweep(page);
      expect(s.hebrewCount, "control: the page renders Hebrew in <main>").toBeGreaterThan(10);
      expect(s.italic, "Hebrew in a faked italic").toEqual([]);
      expect(s.tracking, "letter-spaced Hebrew").toEqual([]);
      expect(s.clampOff, "line-clamp switched off by display").toEqual([]);
      expect(s.overflowX, "horizontal page scroll (px)").toBeLessThanOrEqual(0);
      expect(s.fontProbes.length, "control: at least one font probe ran").toBeGreaterThan(0);
      expect(await strayFaces(page, s.fontProbes), "Hebrew-bearing text in a non-brand face").toEqual([]);
    });
  }
});
