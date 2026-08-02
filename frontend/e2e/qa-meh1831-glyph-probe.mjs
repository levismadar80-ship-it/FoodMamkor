/**
 * MEH-1831 — which font ACTUALLY renders each glyph?
 *
 * `getComputedStyle().fontFamily` returns the declared stack, not the resolved
 * face, so it cannot answer this: every element below reports the same stack
 * whether the browser landed on DM Sans, on Heebo, or on a system fallback.
 * CDP's CSS.getPlatformFontsForNode reports the faces the renderer actually
 * used, per glyph run.
 *
 * The question it settles: `globals.css:1` @imports Heebo from Google Fonts.
 * DM Sans ships latin only, so Hebrew body text may be falling through to
 * Heebo — in which case dropping that @import is a typography change, not a
 * dead-weight removal.
 *
 * PROBE VALIDATION (.claude/rules/testing.md — validate a probe on a case whose
 * answer you already know): the latin-glyph control below must report a DM Sans
 * face. If it does not, the probe is broken and its Hebrew verdict is worthless.
 */

import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// Hardcoded + existsSync, matching the other qa-* harnesses here. An env var
// would be registered by the env-drift gate as an undocumented variable; this
// is a local-run convenience, not app configuration.
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");

await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// Inject two controls with known-correct answers, plus the real body text.
await page.evaluate(() => {
  const mk = (id, text, cls) => {
    const el = document.createElement("p");
    el.id = id;
    el.textContent = text;
    if (cls) el.className = cls;
    document.body.appendChild(el);
    return el;
  };
  mk("probe-latin", "Mehamakor local food");        // control: must be DM Sans
  mk("probe-hebrew", "עסקים מקומיים מהמקור");        // the question
  mk("probe-english-cls", "Mehamakor", "font-english"); // control: Cormorant
});

// CSS.getPlatformFontsForNode reports faces the renderer actually PAINTED, so
// a node that was never in the viewport comes back empty — which reads exactly
// like "no font matched". Scroll each probe into view and let a frame land
// before asking. (The first run of this harness returned `(none)` for the latin
// control for precisely this reason, and its validation gate caught it.)
for (const id of ["probe-latin", "probe-hebrew", "probe-english-cls"]) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
}
await page.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
);

async function facesFor(selector) {
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  if (!nodeId) return `(no node for ${selector})`;
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  return fonts.map((f) => `${f.familyName} x${f.glyphCount}`).join(", ") || "(none)";
}

const heading = await facesFor("h1, h2");
const latin = await facesFor("#probe-latin");
const hebrew = await facesFor("#probe-hebrew");
const english = await facesFor("#probe-english-cls");

console.log("PROBE CONTROL  latin body text  ->", latin);
console.log("PROBE CONTROL  .font-english    ->", english);
console.log("SUBJECT        hebrew body text ->", hebrew);
console.log("SUBJECT        h1/h2 heading    ->", heading);

const controlOk = /DM Sans/i.test(latin);
console.log(
  `\nPROBE VALIDATION: ${controlOk ? "PASS" : "FAIL"} — latin control ` +
    `${controlOk ? "resolved to DM Sans as expected" : "did NOT resolve to DM Sans; verdict below is NOT trustworthy"}`,
);
console.log(`HEBREW BODY RESOLVES TO: ${hebrew}`);

await browser.close();
