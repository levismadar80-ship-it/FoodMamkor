/**
 * MEH-1917 self-QA — the two-layer order-window section.
 *
 * Chromium, mobile viewport (375×812 @2x) ONLY. MEH-1788: WebKit cannot be
 * installed in the CC sandbox (403), so there is NO Safari coverage and none is
 * claimed.
 *
 * Loads the markup dumped by __tests__/qa-meh1917-markup.test.jsx (the REAL
 * block, clock pinned to a Wednesday) beside the app's own built Tailwind CSS.
 *
 * Pins (each printed PASS/FAIL, exit 1 on any FAIL):
 *   P1  collapsed → the compressed summary is visible and the week panel is not
 *   P2  expanded  → one row per OPEN day (5), no merged "ראשון–חמישי" span
 *   P3  today is marked on exactly one row, and it is Wednesday
 *   P4  a split day stacks its two ranges on separate lines (measured: the
 *       second range's top is below the first's, not beside it)
 *   P5  times render humanised (no "09:") and the numerals stay dir=ltr
 *   P6  the toggle clears a 44px tap target, and an unmerged window shows none
 *
 * Usage: node e2e/qa-meh1917-order-window.mjs [outDir]
 * Prereq: MEH1917_QA=1 npx vitest run __tests__/qa-meh1917-markup.test.jsx
 *         && npm run build   (for the CSS)
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1917";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

mkdirSync(OUT, { recursive: true });

const cssDir = ".next/static/chunks";
const cssFile = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ f, size: statSync(join(cssDir, f)).size }))
  .sort((a, b) => b.size - a.size)[0];
if (!cssFile) throw new Error("no built CSS found — run `npm run build` first");
const css = readFileSync(join(cssDir, cssFile.f), "utf8");
console.log(`css: ${cssFile.f} (${cssFile.size} bytes)`);

const page = (bodyHtml) => `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${css}</style>
<style>body{margin:0;background:#FBF9F4;font-family:system-ui,sans-serif;padding:12px}</style>
</head><body>${bodyHtml}</body></html>`;

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const probe = () => {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
  const toggle = document.querySelector('[data-testid="order-window-week-toggle"]');
  const weekRows = [...document.querySelectorAll('[data-testid="order-window-week-row"]')];
  return {
    summaryRows: [...document.querySelectorAll('[data-testid="order-window-schedule-row"]')].map(txt),
    hasPanel: !!document.querySelector('[data-testid="order-window-week"]'),
    toggleText: txt(toggle),
    toggleH: toggle ? Math.round(toggle.getBoundingClientRect().height) : null,
    weekRows: weekRows.map((r) => ({
      day: r.getAttribute("data-day"),
      today: r.getAttribute("data-today"),
      text: txt(r),
      // Geometry of the time spans — stacked means each starts on its own line.
      rangeTops: [...r.querySelectorAll("span.whitespace-nowrap")].map((s) =>
        Math.round(s.getBoundingClientRect().top),
      ),
      ltr: !!r.querySelector('[dir="ltr"]'),
    })),
    todayChips: document.querySelectorAll('[data-testid="order-window-today-chip"]').length,
    bodyText: document.body.textContent.replace(/\s+/g, " ").trim(),
  };
};

const browser = await chromium.launch({
  ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

const shots = {};
for (const label of ["collapsed", "expanded", "unmerged"]) {
  const p = await ctx.newPage();
  await p.setContent(page(readFileSync(`${OUT}/order-window-${label}.html`, "utf8")));
  await p.screenshot({ path: `${OUT}/order-window-${label}-375.png`, fullPage: true });
  shots[label] = await p.evaluate(probe);
  await p.close();
}

const c = shots.collapsed;
record(
  "P1 collapsed → compressed summary shown, week panel absent",
  c.summaryRows.length > 0 && !c.hasPanel && c.weekRows.length === 0 && !!c.toggleText,
  `summary rows = ${JSON.stringify(c.summaryRows)} · panel present = ${c.hasPanel} · toggle = "${c.toggleText}"`,
);

const e = shots.expanded;
record(
  "P2 expanded → one row per open day, no merged span, summary REPLACED not stacked",
  e.hasPanel &&
    e.weekRows.length === 5 &&
    !e.weekRows.some((r) => /ראשון–|–חמישי/.test(r.text)) &&
    e.summaryRows.length === 0,
  `${e.weekRows.length} week row(s): ${e.weekRows.map((r) => r.text).join(" | ")}\n      ` +
    `summary rows still on screen while expanded = ${e.summaryRows.length} (must be 0)`,
);

const marked = e.weekRows.filter((r) => r.today === "true");
record(
  "P3 exactly one row marked today, and it is Wednesday (day index 3)",
  marked.length === 1 && marked[0].day === "3" && e.todayChips === 1,
  `marked = ${marked.length} · data-day = ${marked.map((r) => r.day).join()} · chips = ${e.todayChips}`,
);

const split = e.weekRows.find((r) => r.rangeTops.length > 1);
record(
  "P4 a split day stacks its ranges on separate lines",
  !!split && split.rangeTops[1] > split.rangeTops[0],
  split
    ? `day ${split.day} range tops = [${split.rangeTops.join(", ")}] → second is ${
        split.rangeTops[1] - split.rangeTops[0]
      }px below the first`
    : "no multi-range row found in the expanded panel",
);

record(
  "P5 times humanised (no leading-zero hour) and numerals dir-isolated",
  !e.bodyText.includes("09:") && e.bodyText.includes("9:00") && e.weekRows.every((r) => r.ltr),
  `contains "09:" = ${e.bodyText.includes("09:")} · contains "9:00" = ${e.bodyText.includes(
    "9:00",
  )} · every week row has a dir=ltr time span = ${e.weekRows.every((r) => r.ltr)}`,
);

const u = shots.unmerged;
record(
  "P6 toggle ≥44px, and an unmerged window offers no disclosure at all",
  c.toggleH >= 44 && u.toggleText === null && !u.hasPanel && u.summaryRows.length === 2,
  `toggle height = ${c.toggleH}px · unmerged toggle = ${u.toggleText} · unmerged summary rows = ${u.summaryRows.length}`,
);

await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pins passed`);
if (failed.length) process.exit(1);
