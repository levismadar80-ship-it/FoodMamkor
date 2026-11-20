/**
 * MEH-2029 — which typeface actually renders each glyph run.
 *
 * The instrument is CDP `CSS.getPlatformFontsForNode`, the same one MEH-1831
 * used: it reports the font the compositor actually reached for, per glyph run,
 * which is the only thing that can distinguish "Heebo is in the chain" from
 * "Heebo rendered the Hebrew". A computed `font-family` string cannot — it lists
 * candidates, not the winner.
 *
 * Usage:  node e2e/qa-meh2029-font-resolution.mjs [baseUrl]
 * Exits 1 if the CONTROL fails. The control is the whole point: it queries a
 * node whose typeface is not in question (a headline, which must resolve to
 * Frank Ruhl Libre). If the control comes back empty, every other line in the
 * output is void — an empty `fonts` array is also what a dead probe prints.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3010";

/** Each probe: a page, a selector, and what the selector is meant to prove. */
const PROBES = [
  {
    page: "/",
    selector: "h1",
    label: "home h1 (headline / Frank Ruhl Libre)",
    role: "control",
    expect: /frank ruhl|david libre/i,
  },
  { page: "/", selector: "main p", label: "home body paragraph", role: "subject" },
  { page: "/login", selector: "label", label: "login field label", role: "subject" },
  { page: "/about", selector: "main p", label: "about body paragraph", role: "subject" },
];

const HEBREW = /[֐-׿]/;

async function main() {
  // The sandbox ships a full Chromium at a pinned path but not the headless
  // shell this Playwright build expects, and `playwright install` is banned
  // here (ORDERS §6). Point at the binary that exists when it does.
  const pinned = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({
    args: ["--ssl-version-max=tls1.2"],
    ...(existsSync(pinned) ? { executablePath: pinned } : {}),
  });
  const context = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");

  const rows = [];
  for (const probe of PROBES) {
    await page.goto(`${BASE}${probe.page}`, { waitUntil: "load", timeout: 60_000 });
    // Gate on the webfonts being ready rather than on the network going quiet
    // (`networkidle` is banned in this repo — .claude/rules/testing.md).
    await page.evaluate(() => document.fonts.ready);

    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    let nodeId = 0;
    try {
      const found = await cdp.send("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: probe.selector,
      });
      // Pick the first match that actually contains Hebrew text, so the reported
      // run is a Hebrew run and not a stray latin word inside the same element.
      for (const id of found.nodeIds) {
        const { node } = await cdp.send("DOM.describeNode", { nodeId: id, depth: 1 });
        const text = (node.children || []).map((c) => c.nodeValue || "").join("");
        if (HEBREW.test(text) || probe.role === "control") {
          nodeId = id;
          break;
        }
      }
    } catch {
      /* fall through to the empty-node report below */
    }

    if (!nodeId) {
      rows.push({ ...probe, fonts: [], note: "selector matched nothing" });
      continue;
    }
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    rows.push({ ...probe, fonts });
  }

  await browser.close();

  console.log(`\nMEH-2029 platform-font resolution — ${BASE}\n`);
  for (const r of rows) {
    const names = r.fonts.map((f) => `${f.familyName} (${f.glyphCount} glyphs)`).join(", ") || "(none)";
    console.log(`${r.role === "control" ? "CONTROL" : "subject"}  ${r.label}\n          ${names}`);
  }

  const control = rows.find((r) => r.role === "control");
  const controlNames = control.fonts.map((f) => f.familyName).join(" ");
  if (!control.fonts.length || !control.expect.test(controlNames)) {
    console.error(
      `\n✗ CONTROL FAILED — expected ${control.expect} in "${controlNames || "(none)"}".\n` +
        `  Every "(none)" and every subject line above is VOID: a probe that cannot\n` +
        `  see a font it is pointed straight at proves nothing about the ones it can't.\n`,
    );
    process.exit(1);
  }
  console.log(`\n✓ control passed — the probe can see a typeface it is pointed at.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
