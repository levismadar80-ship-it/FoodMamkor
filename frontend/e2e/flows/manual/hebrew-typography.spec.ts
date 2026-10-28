import { test, expect, type Page } from "../_cloudinary-stub";

/**
 * Spec:     manual/hebrew-typography (MEH-2488)
 * Purpose:  site-wide Hebrew typesetting, found by a computed-style sweep of 32
 *           public routes at 375 + 1440 (Sapir 28/10: «תחקור אם יש עוד בעיות
 *           כאלו באתר»):
 *             1. Hebrew set in `.font-english` must render in the brand face.
 *                Cormorant ships latin glyphs only, and its size-adjusted
 *                fallback (`local(Times New Roman)`, no unicode-range) caught
 *                every Hebrew glyph, so «היכרות אישית» rendered in a system
 *                serif (Liberation Serif here; whatever the phone has there).
 *             2. Headings never end on a one-word line (`text-wrap: balance`).
 *           The letter-spacing half lives in home.spec.ts (trust band) because
 *           it needs that file's API mocks.
 * Touches:  static SSG routes only. No API writes.
 * Fonts:    measured with CDP `CSS.getPlatformFontsForNode` — the faces the
 *           renderer actually used, not the declared stack. Both projects are
 *           Chromium (playwright.config.ts), so CDP is always available.
 */

const FIRST_PAINT = { timeout: 15_000 };

async function renderedFonts(page: Page, selector: string): Promise<{ familyName: string; glyphCount: number }[]> {
  await page.locator(selector).first().waitFor({ state: "visible", ...FIRST_PAINT });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  expect(nodeId, `${selector} exists`).toBeTruthy();
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await cdp.detach();
  return fonts.map((f: { familyName: string; glyphCount: number }) => ({ familyName: f.familyName, glyphCount: f.glyphCount }));
}

/** Lines a heading occupies, and the width of its last line as a share of the box. */
async function lastLine(page: Page, selector: string): Promise<{ lines: number; lastShare: number; text: string }> {
  return page.locator(selector).first().evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1);
    const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
    const lastTop = Math.max(...tops);
    const lastWidth = rects.filter((r) => Math.round(r.top) === lastTop).reduce((a, r) => a + r.width, 0);
    return { lines: tops.length, lastShare: lastWidth / el.getBoundingClientRect().width, text: el.textContent ?? "" };
  });
}

test.describe("manual › Hebrew typography (MEH-2488)", () => {
  test("/about/process: Hebrew inside .font-english renders in Frank Ruhl Libre, never a system serif", async ({ page }) => {
    await page.goto("/about/process");
    for (const selector of ['[data-testid="process-hero"] em', "p.font-english"]) {
      const text = (await page.locator(selector).first().textContent()) ?? "";
      expect(text, `${selector} carries Hebrew — else this check is vacuous`).toMatch(/[֐-׿]/);
      const fonts = await renderedFonts(page, selector);
      const frank = fonts.find((f) => /Frank Ruhl/i.test(f.familyName));
      expect(frank?.glyphCount ?? 0, `${selector}: Hebrew glyphs in Frank Ruhl (${JSON.stringify(fonts)})`).toBeGreaterThan(0);
      const stray = fonts.filter((f) => !/Frank Ruhl|Cormorant/i.test(f.familyName));
      expect(stray, `${selector}: no glyph may fall to a system face`).toEqual([]);
    }
  });

  // Control: the reorder must not take the LATIN runs away from Cormorant — the
  // reason `.font-english` exists (numerals, English twin).
  test("/en/about/process: Latin inside .font-english still renders in Cormorant", async ({ page }) => {
    await page.goto("/en/about/process");
    const selector = '[data-testid="process-hero"] em';
    const text = (await page.locator(selector).first().textContent()) ?? "";
    expect(text).toMatch(/[A-Za-z]/);
    expect(text).not.toMatch(/[֐-׿]/);
    const fonts = await renderedFonts(page, selector);
    const cormorant = fonts.find((f) => /Cormorant/i.test(f.familyName));
    const total = fonts.reduce((a, f) => a + f.glyphCount, 0);
    expect(cormorant?.glyphCount ?? 0, JSON.stringify(fonts)).toBe(total);
  });

  test("a guide headline at 375 wraps without a one-word last line", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/about/for-businesses/guides/business-story");
    const h1 = "main h1";
    await page.locator(h1).first().waitFor({ state: "visible", ...FIRST_PAINT });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const m = await lastLine(page, h1);
    expect(m.lines, `"${m.text}" must wrap at 375, else balance has nothing to do`).toBeGreaterThanOrEqual(2);
    expect(m.lastShare, `"${m.text}" last line is ${Math.round(m.lastShare * 100)}% of the box`).toBeGreaterThan(0.3);
  });
});
