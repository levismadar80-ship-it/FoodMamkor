/**
 * MEH-1389 self-QA — the WhatsApp CTA passes WCAG AA contrast (>= 4.5:1).
 *
 * Run manually against a local `next start` (NOT part of the e2e suite):
 *   node e2e/qa-meh1389-whatsapp-contrast.mjs [baseURL] [producerSlug] [chromiumPath]
 *
 * WHY THIS RUNS ITS OWN AXE PASS INSTEAD OF TRUSTING THE SUITE:
 * `e2e/flows/12-axe-a11y.spec.ts` puts `color-contrast` in GATE_IGNORE_RULES
 * (deferred pairs from MEH-919 / MEH-815), so the CI a11y net is structurally
 * incapable of reporting this violation. A green suite is not evidence here —
 * the rule it would need to fire on is switched off. This probe re-enables it.
 *
 * WHY IT ALSO MEASURES THE RATIO DIRECTLY:
 * axe reporting zero color-contrast violations has two causes — the contrast is
 * fine, or the element was never on the page (the CTA only renders when the
 * producer has a phone). The element-count assertion runs FIRST and the ratio is
 * computed from the CTA's own computed styles, so a "0 violations" result cannot
 * be produced by an absent button.
 *
 * REUSES: frontend/e2e/qa-meh1852-admin-kashrut-labels.mjs (argv, never
 * process.env — the MEH-491 env-drift gate blocks undocumented env reads).
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";

const BASE = process.argv[2] || "http://localhost:3300";
const SLUG = process.argv[3] || "tases-ferments";
const OUT = new URL("../../qa-artifacts/MEH-1389", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const AA_NORMAL = 4.5;

const browser = await chromium.launch({
  executablePath: process.argv[4] || "/opt/pw-browsers/chromium",
});

const results = [];
let failures = 0;
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${label}: ${JSON.stringify({ actual, expected })}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`, { actual, expected });
};

// WCAG relative luminance + contrast, computed in the page from the CTA's own
// resolved rgb() values — not from the source hex, so a token that failed to
// compile would show up as a wrong number rather than a passing assertion.
const CONTRAST_FN = (el) => {
  const parse = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const cs = getComputedStyle(el);
  let bgEl = el, bg = cs.backgroundColor;
  while (bg === "rgba(0, 0, 0, 0)" && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = getComputedStyle(bgEl).backgroundColor; }
  const L1 = lum(parse(cs.color)), L2 = lum(parse(bg));
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return { fg: cs.color, bg, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
};

for (const [label, width, height] of [["mobile", 375, 812], ["desktop", 1440, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he/producer/${SLUG}`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForSelector('[data-testid="primary-contact-button"][data-method="whatsapp"]', { timeout: 15_000 }).catch(() => {});

  // There can be TWO whatsapp CTAs on this page — the ContactCard one and the
  // StickyContactBar one — and which is visible depends on viewport and scroll.
  // Measure the VISIBLE one: a hidden element still reports computed styles, so
  // picking .first() blindly would measure a button no user can see.
  const all = page.locator('[data-testid="primary-contact-button"][data-method="whatsapp"]');
  const count = await all.count();
  const cta = all.filter({ visible: true }).first();

  // ---- ASSERT THE SUBJECT EXISTS before reading any contrast result ----
  // Zero WhatsApp CTAs would make every assertion below pass vacuously.
  assert(`[${label}] whatsapp CTA present on the page`, count > 0, true);
  if (count === 0) { await ctx.close(); continue; }

  const m = await cta.evaluate(CONTRAST_FN);
  console.log(`[${label}] fg=${m.fg} bg=${m.bg} ratio=${m.ratio}:1`);
  results.push(`[${label}] measured fg=${m.fg} bg=${m.bg} ratio=${m.ratio}:1`);
  assert(`[${label}] CTA contrast >= ${AA_NORMAL}:1 (measured ${m.ratio})`, m.ratio >= AA_NORMAL, true);
  assert(`[${label}] CTA fill is the darkened WhatsApp green, not #25D366`, m.bg, "rgb(22, 128, 62)");

  // CONTROL — the same instrument, on a value whose answer is already known.
  // Force the OLD #25D366 fill onto the live element and re-measure. If this
  // does not come back ~1.98, the measurement above is not trustworthy either,
  // and the "after" number means nothing. It also gives the before/after pair
  // from one instrument rather than comparing a measurement to arithmetic.
  // `.btn-whatsapp` transitions background-color over 150ms, and
  // getComputedStyle mid-transition returns the CURRENT animated value — so a
  // naive override + immediate read reports the OLD colour and the control
  // silently "passes" by measuring the wrong paint. Kill the transition first.
  const before = await cta.evaluate((el, fn) => {
    const prevT = el.style.transition, prevBg = el.style.backgroundColor;
    el.style.setProperty("transition", "none", "important");
    el.style.setProperty("background-color", "#25D366", "important");
    const out = new Function("return " + fn)()(el);
    el.style.backgroundColor = prevBg;
    el.style.transition = prevT;
    return out;
  }, CONTRAST_FN.toString());
  console.log(`[${label}] CONTROL old #25D366 fill → ${before.ratio}:1`);
  results.push(`[${label}] CONTROL old #25D366 fill → ${before.ratio}:1 (pre-fix state)`);
  assert(`[${label}] control reproduces the pre-fix failure (< ${AA_NORMAL})`, before.ratio < AA_NORMAL, true);

  // Full axe pass with color-contrast ENABLED (the CI net ignores this rule).
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".leaflet-marker-icon")
    .analyze();
  const serious = axe.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""));
  const contrastNodes = serious.filter((v) => v.id === "color-contrast").flatMap((v) => v.nodes);

  // THE ASSERTION IS SCOPED TO THIS TICKET'S SUBJECT, and says so.
  // The page carries OTHER, pre-existing color-contrast violations on the
  // `accent` token (listed below). They are not btn-whatsapp and this ticket's
  // scope is "btn-whatsapp definition + its token only", so failing on them
  // would make this probe permanently red and useless as a regression gate.
  // They are REPORTED rather than swallowed — see the out-of-scope block.
  const ctaFlagged = contrastNodes.filter((n) => n.target.join(" ").includes("primary-contact-button"));
  assert(`[${label}] axe finds zero color-contrast violations on the whatsapp CTA`, ctaFlagged.length, 0);

  const outOfScope = contrastNodes.filter((n) => !n.target.join(" ").includes("primary-contact-button"));
  for (const n of outOfScope) {
    const ratio = (n.failureSummary ?? "").match(/contrast of ([\d.]+)/)?.[1] ?? "?";
    const line = `[axe][${label}] OUT-OF-SCOPE color-contrast ${ratio}:1 → ${n.target.join(" ")}`;
    console.log(line);
    results.push(line);
  }
  results.push(`[axe][${label}] out-of-scope serious color-contrast nodes: ${outOfScope.length}`);
  for (const v of serious.filter((v) => v.id !== "color-contrast")) {
    const line = `[axe][${label}] OTHER ${v.impact} ${v.id}: ${v.nodes.length} node(s)`;
    console.log(line);
    results.push(line);
  }

  await cta.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/producer-whatsapp-cta-${width}.png`, fullPage: false });
  await cta.screenshot({ path: `${OUT}/cta-closeup-${width}.png` }).catch(() => {
    console.log(`[${label}] close-up skipped (CTA not stably visible) — page shot still captured`);
  });
  await ctx.close();
}

results.push(`FAILURES: ${failures}`);
fs.writeFileSync(`${OUT}/probe-results.txt`, results.join("\n") + "\n");
await browser.close();
console.log("FAILURES", failures);
process.exit(failures === 0 ? 0 : 1);
