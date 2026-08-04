/**
 * MEH-1901 self-QA — product detail sheet screenshots + DOM pins.
 *
 * The CC sandbox has no backend, so /producer/[id] cannot be SSR-populated and
 * the live route renders nothing to photograph. This loads the markup dumped by
 * __tests__/qa-meh1901-markup.test.jsx (the REAL components, rendered against a
 * fixture producer) beside the app's own built Tailwind CSS, so the pixels come
 * from the shipped stylesheet and not from a hand-written approximation.
 * Component-markup harness, MEH-1463 precedent.
 *
 * Pins (each printed PASS/FAIL, exit 1 on any FAIL):
 *   P1  the 2000-char description is present in the sheet DOM, in full
 *   P2  the description element carries NO line-clamp and IS inside the
 *       overflow-y-auto scroller, whose scrollHeight exceeds its clientHeight
 *       (i.e. it genuinely scrolls, not merely "is scrollable in principle")
 *   P3  diet chips = exactly the true flags (טבעוני · ללא גלוטן), no others
 *   P4  the WhatsApp CTA href carries the encoded product name
 *   P5  every grid row is a <button> and clears a 44px tap target
 *
 * Usage: node e2e/qa-meh1901-sheet.mjs [outDir]
 * Prereq: MEH1901_QA=1 npx vitest run __tests__/qa-meh1901-markup.test.jsx
 *         && npm run build   (for the CSS)
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1901";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

mkdirSync(OUT, { recursive: true });

// The app's own compiled stylesheet — largest CSS chunk in the build output.
const cssDir = ".next/static/chunks";
const cssFile = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ f, size: statSync(join(cssDir, f)).size }))
  .sort((a, b) => b.size - a.size)[0];
if (!cssFile) throw new Error("no built CSS found — run `npm run build` first");
const css = readFileSync(join(cssDir, cssFile.f), "utf8");
console.log(`css: ${cssFile.f} (${cssFile.size} bytes)`);

const page = (bodyHtml, extra = "") => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${css}</style>
<style>body{margin:0;background:#FBF9F4;font-family:system-ui,sans-serif}${extra}</style>
</head><body>${bodyHtml}</body></html>`;

const rowsHtml = readFileSync(`${OUT}/rows.html`, "utf8");
const sheetHtml = readFileSync(`${OUT}/sheet.html`, "utf8");
const photoHtml = readFileSync(`${OUT}/sheet-photo.html`, "utf8");

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});

// ---- sheet, mobile 375 + desktop 1440 --------------------------------------
for (const [label, width, height] of [
  ["375", 375, 812],
  ["1440", 1440, 900],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(page(sheetHtml));
  await p.screenshot({ path: `${OUT}/sheet-open-${label}.png` });

  // Both image states get photographed — the placeholder fork is only visible
  // by eye, and shooting one state is how the first pass missed it entirely.
  const pp = await ctx.newPage();
  await pp.setContent(page(photoHtml));
  await pp.screenshot({ path: `${OUT}/sheet-photo-${label}.png` });
  await pp.close();

  if (label === "375") {
    const probe = await p.evaluate(() => {
      const desc = document.querySelector('[data-testid="product-sheet-description"]');
      const scroller = document.querySelector('[data-testid="product-sheet-scroll"]');
      const chips = Array.from(
        document.querySelectorAll('[data-testid="product-sheet-diet"] li'),
      ).map((li) => li.textContent.trim());
      const cta = document.querySelector('[data-testid="product-sheet-wa-cta"]');
      return {
        descLen: desc ? desc.textContent.length : -1,
        descClass: desc ? desc.className : "",
        insideScroller: !!(desc && scroller && scroller.contains(desc)),
        scrollerOverflow: scroller ? getComputedStyle(scroller).overflowY : "",
        scrollH: scroller ? scroller.scrollHeight : 0,
        clientH: scroller ? scroller.clientHeight : 0,
        chips,
        href: cta ? cta.getAttribute("href") : null,
      };
    });

    record(
      "P1 full 2000-char description present",
      probe.descLen >= 1900,
      `description length in DOM = ${probe.descLen} chars`,
    );
    record(
      "P2 unclamped + genuinely scrolling",
      !/line-clamp/.test(probe.descClass) &&
        probe.insideScroller &&
        probe.scrollerOverflow === "auto" &&
        probe.scrollH > probe.clientH,
      `class="${probe.descClass}" · overflow-y=${probe.scrollerOverflow} · ` +
        `scrollHeight ${probe.scrollH} > clientHeight ${probe.clientH} = ` +
        `${probe.scrollH > probe.clientH}`,
    );
    record(
      "P3 diet chips = only the true flags",
      probe.chips.length === 2 &&
        probe.chips.includes("טבעוני") &&
        probe.chips.includes("ללא גלוטן"),
      `chips = [${probe.chips.join(" · ")}] (is_vegetarian/is_lactose_free are false)`,
    );
    record(
      "P4 WhatsApp href carries the product name",
      !!probe.href && probe.href.includes(encodeURIComponent("גרנולה ביתית")),
      `href = ${(probe.href || "").slice(0, 110)}…`,
    );
  }
  await ctx.close();
}

// ---- product rows + chevron, mobile 375 ------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(page(rowsHtml));
  await p.screenshot({ path: `${OUT}/row-chevron-375.png`, fullPage: true });

  const rows = await p.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="product-row"]')).map((r) => ({
      tag: r.tagName,
      h: Math.round(r.getBoundingClientRect().height),
      clamp2: !!r.querySelector("p.line-clamp-2"),
      clamp1: !!r.querySelector("p.line-clamp-1"),
    })),
  );
  record(
    "P5 rows are buttons ≥44px with a two-line clamp",
    rows.length > 0 &&
      rows.every((r) => r.tag === "BUTTON" && r.h >= 44 && !r.clamp1) &&
      rows.some((r) => r.clamp2),
    `${rows.length} row(s): ${rows.map((r) => `${r.tag}@${r.h}px`).join(", ")} · ` +
      `line-clamp-1 present anywhere = ${rows.some((r) => r.clamp1)}`,
  );
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pins passed`);
if (failed.length) process.exit(1);
