/**
 * MEH-2798 — the computed colour of every reachable CollectionNotice, plus a
 * 375px shot of each.
 *
 * A screenshot of "grey vs slightly-different-grey" is weak evidence for a
 * colour change; the COMPUTED VALUE is not. So this reports both, and the
 * computed value is the claim.
 *
 * Run against a local `next start` (no backend needed for these three routes):
 *   node qa-meh2798-notice-tone.mjs <after|before>
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const LABEL = process.argv[2] || "after";
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3210";
const OUT = `../qa-artifacts/MEH-2798`;

// Every surface a default-tone notice is reachable on without a backend, plus
// the footer newsletter, which is the ON-DARK tone and must NOT change.
const SURFACES = [
  { route: "/forgot-password", testId: "forgot-collection-notice", tone: "default" },
  { route: "/contact", testId: "contact-collection-notice", tone: "default" },
  { route: "/recommend", testId: "recommend-collection-notice", tone: "default" },
  { route: "/forgot-password", testId: "newsletter-collection-notice", tone: "on-dark" },
];

await mkdir(OUT, { recursive: true });
// The repo pins a playwright whose headless shell is not installed in this
// sandbox; /opt/pw-browsers/chromium is the one that is. Per the environment
// notes, executablePath is the sanctioned way to use it.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--headless"],
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 900 },
  deviceScaleFactor: 2,
  locale: "he-IL",
  reducedMotion: "reduce",
});
const page = await ctx.newPage();

let missing = 0;
console.log(`\n=== ${LABEL} — computed colour of each notice ===\n`);
for (const s of SURFACES) {
  await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
  const el = page.locator(`[data-testid="${s.testId}"]`).first();
  if (!(await el.count())) {
    console.log(`  ✗ ${s.testId.padEnd(32)} NOT ON ${s.route}`);
    missing += 1;
    continue;
  }
  await el.scrollIntoViewIfNeeded();
  const info = await el.evaluate((n) => ({
    color: getComputedStyle(n).color,
    cls: n.className,
  }));
  console.log(`  ${s.testId.padEnd(32)} tone=${s.tone.padEnd(8)} color=${info.color}`);
  console.log(`      class: ${info.cls}`);
  await el.screenshot({ path: `${OUT}/${LABEL}-${s.testId}.png` });
}
// CONTROL: a colour we know is emitted, so "a colour came back" is not just
// the browser's default black on every read.
await page.goto(`${BASE}/forgot-password`, { waitUntil: "domcontentloaded" });
const ctrl = await page.locator("a[href='/privacy']").first().evaluate((n) => getComputedStyle(n).color);
console.log(`\n  CONTROL  the notice's /privacy link (text-primary) = ${ctrl}`);
console.log(`           if this equals the notice colour above, the read is not discriminating.`);

await browser.close();
if (missing) {
  console.log(`\n${missing} surface(s) not found — see above.`);
}
