// MEH-1770 QA capture: /about/for-businesses FAQ set (8 -> 10 Q&As, 5 sections).
// Mobile 375x812, locale he. Captures: full page (all <details> expanded),
// the 5 category headings in sequence, and each single-item section.
// Asserts `ההבדל והאנשים` (the new 5th heading) renders on ONE line.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// Constants, not env reads: the "Env drift (.env.example)" gate fails any
// `process.env.X` that isn't documented in .env.example, and a throwaway QA
// harness has no business widening the project's env surface (regression
// rule 8). Edit these two lines directly if you need a different target.
const BASE = "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-1770";
// The sandbox image ships Chromium 1194; this repo's playwright pins 1234 and
// would otherwise demand `playwright install` (blocked here). Point at the
// preinstalled binary instead.
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const HEADINGS = [
  "כסף וערך",
  "שליטה ועמדה",
  "אמון במהמקור",
  "זמן ומאמץ",
  "ההבדל והאנשים",
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--ssl-version-max=tls1.2"],
});
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  locale: "he-IL",
});

await page.goto(`${BASE}/about/for-businesses`, { waitUntil: "networkidle" });

// Dismiss the cookie banner — it is `fixed`, so on a fullPage shot it stamps
// itself across the middle of the frame and hides the section under it.
const consent = page.getByRole("button", { name: /קבלו הכל|קבל/ }).first();
if (await consent.count()) {
  await consent.click();
  await page.waitForTimeout(400);
}

// Expand every accordion item so the full copy is in the frame.
await page.evaluate(() =>
  document.querySelectorAll("details").forEach((d) => (d.open = true)),
);
await page.waitForTimeout(300);

// The BottomNav / chat FAB are `fixed`, so on a fullPage shot (and on any crop
// that reaches the viewport floor) they stamp across the copy underneath. Hide
// them for the capture only — this changes nothing about the page under test.
await page.addStyleTag({
  content:
    "nav[class*='fixed'],[class*='fixed'][class*='bottom-'],#cookie-banner{display:none !important}",
});

const items = await page.locator("details").count();
const h2s = await page.locator("section h2").allInnerTexts();

await page.screenshot({ path: `${OUT}/faq-full-expanded-375.png`, fullPage: true });

// --- headings in sequence -------------------------------------------------
// Collapse again so the 5 headings sit close enough for one legible crop.
await page.evaluate(() =>
  document.querySelectorAll("details").forEach((d) => (d.open = false)),
);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/faq-5-headings-375.png`, fullPage: true });

// --- per-heading measurement + single-item section crops ------------------
const results = [];
for (const text of HEADINGS) {
  const h2 = page.locator("h2", { hasText: text }).first();
  const measured = await h2.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    const cs = getComputedStyle(el);
    return {
      lines: rects.length,
      textWidth: Math.round(range.getBoundingClientRect().width * 100) / 100,
      boxWidth: Math.round(el.getBoundingClientRect().width * 100) / 100,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      elHeight: Math.round(el.getBoundingClientRect().height * 100) / 100,
    };
  });
  results.push({ text, ...measured });
}

// Crop the two single-item sections (one <li> each).
for (const [text, slug] of [
  ["זמן ומאמץ", "section-time-effort"],
  ["ההבדל והאנשים", "section-difference"],
]) {
  // Scope to the h2's OWN parent <section>, not any ancestor that happens to
  // contain it — the page root is itself a <section>, so a `filter({has})`
  // match resolves to the whole page.
  const section = page
    .locator("h2", { hasText: text })
    .first()
    .locator("xpath=parent::section");
  await section.evaluate((el) =>
    el.querySelectorAll("details").forEach((d) => (d.open = true)),
  );
  await page.waitForTimeout(200);
  await section.screenshot({ path: `${OUT}/${slug}-375.png` });
}

console.log(JSON.stringify({ viewport: "375x812", locale: "he-IL", detailsCount: items, h2s, headings: results }, null, 2));

const fifth = results.find((r) => r.text === "ההבדל והאנשים");
await browser.close();

if (!fifth) {
  console.error("FAIL: heading 'ההבדל והאנשים' not found on the page");
  process.exit(1);
}
if (fifth.lines !== 1) {
  console.error(`FAIL: 'ההבדל והאנשים' wrapped onto ${fifth.lines} lines`);
  process.exit(1);
}
console.log(`\nPASS: 'ההבדל והאנשים' renders on 1 line — text width ${fifth.textWidth}px inside a ${fifth.boxWidth}px box.`);
