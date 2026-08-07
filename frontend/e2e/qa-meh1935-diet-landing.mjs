/**
 * Module:   qa-meh1935-diet-landing
 * Purpose:  Self-QA harness for MEH-1935 — drives the Vercel preview at a
 *           390x844 mobile viewport and asserts the six checks Sapir asked for
 *           on /producers/diet/vegan, plus the closed-gate 404 on
 *           /producers/diet/no-added-sugar.
 * Touches:  network (the preview URL only). Writes screenshots to
 *           qa-artifacts/MEH-1935/.
 * Does NOT: run in CI, and does NOT cover WebKit/Safari — Chromium only
 *           (see MEH-1788). Not a substitute for the e2e suite.
 * History:  MEH-1935 (creation, 2026-08-07).
 *
 * Usage: node e2e/qa-meh1935-diet-landing.mjs <preview-base-url>
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2];
if (!BASE) {
  console.error("usage: node e2e/qa-meh1935-diet-landing.mjs <preview-base-url>");
  process.exit(2);
}
const OUT = "../qa-artifacts/MEH-1935";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// .claude/rules/testing.md: the CC sandbox's Chromium offers a TLS-1.3
// ClientHello that the Vercel edge drops, surfacing as ERR_CONNECTION_CLOSED.
// Capping at TLS 1.2 lets the handshake complete. Sandbox-only.
// The repo pins a newer @playwright/test than the sandbox's preinstalled
// browsers (expects build 1234, /opt/pw-browsers has 1194), so point at the
// installed binary rather than running `playwright install`.
// Hardcoded for the same reason as the stub's port: an env var here enters the
// app's env contract as far as the "Env drift" guard is concerned, and QA
// scaffolding has no business in .env.example. Edit the literal if the
// sandbox's browser build moves.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "he-IL",
});
const page = await ctx.newPage();

// ---------- /producers/diet/vegan ----------
const veganUrl = `${BASE}/producers/diet/vegan`;
const resp = await page.goto(veganUrl, { waitUntil: "networkidle", timeout: 60000 });
check("vegan page returns 200", resp?.status() === 200, `status=${resp?.status()}`);

// 1. RTL
const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
check("RTL — <html dir>", dir === "rtl", `dir=${dir}`);

// 2. H1 comes from ATTRIBUTE_LABELS
const h1 = (await page.locator("h1").first().textContent())?.trim();
check("H1 is the chip label", h1 === "טבעוני", `h1="${h1}"`);

// 3. sibling chips link to the sibling diet pages
const chipHrefs = await page
  .locator('nav[aria-label] a[href*="/producers/diet/"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
const siblingOk =
  chipHrefs.length > 0 && chipHrefs.every((h) => /\/producers\/diet\/[a-z-]+$/.test(h));
check(
  "sibling chips link to sibling diet pages",
  siblingOk,
  `${chipHrefs.length} chips: ${chipHrefs.join(", ")}`,
);
check(
  "no chip points at the current page (self-link)",
  !chipHrefs.some((h) => h.endsWith("/vegan")),
  "",
);
// §B: a chip must never point at a sub-threshold cell (that would be a 404).
// Verify by actually requesting each one rather than trusting the render.
const chipStatuses = [];
for (const href of chipHrefs) {
  const u = href.startsWith("http") ? href : `${BASE}${href}`;
  const r = await page.request.get(u);
  chipStatuses.push(`${href}=${r.status()}`);
}
check(
  "every sibling chip resolves 200 (no chip to a 404 cell)",
  chipStatuses.every((s) => s.endsWith("=200")),
  chipStatuses.join(" · "),
);

// 4. honesty line
const honesty = "הסימון לפי הצהרת בית העסק על מוצרים בקטלוג שלו.";
check(
  "copy-honesty line rendered",
  (await page.getByText(honesty, { exact: false }).count()) > 0,
);

// 5. FAQ present. NOTE: this FAQ is a static <dl>, not a disclosure widget —
// there is nothing to expand, so "opens" is verified as "both Q and A are
// visible without interaction".
const dts = await page.locator("dl dt").allTextContents();
const dds = await page.locator("dl dd").allTextContents();
const firstAnswerVisible =
  dds.length > 0 && (await page.locator("dl dd").first().isVisible());
check(
  "FAQ questions + answers rendered and visible (static, not a disclosure)",
  dts.length >= 2 && dds.length === dts.length && firstAnswerVisible,
  `${dts.length} Q / ${dds.length} A`,
);

// 6. grid loaded
const cards = await page.locator("a[href^='/'], article").count();
const gridCount = await page
  .locator("div.grid")
  .first()
  .evaluate((el) => el.children.length)
  .catch(() => 0);
check("producer grid rendered with items", gridCount > 0, `${gridCount} cards`);

// 7. no horizontal overflow
const overflow = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
check(
  "no horizontal overflow at 390px",
  overflow.scrollWidth <= overflow.clientWidth + 1,
  `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
);

// 8. JSON-LD present and parseable
const ld = await page
  .locator('script[type="application/ld+json"]')
  .allTextContents();
let ldTypes = [];
try {
  for (const blob of ld) {
    const parsed = JSON.parse(blob);
    if (parsed["@graph"]) ldTypes.push(...parsed["@graph"].map((n) => n["@type"]));
  }
} catch (e) {
  ldTypes = [`PARSE ERROR: ${e.message}`];
}
check(
  "JSON-LD graph carries ItemList + FAQPage + BreadcrumbList",
  ["ItemList", "FAQPage", "BreadcrumbList"].every((t) => ldTypes.includes(t)),
  ldTypes.join(", "),
);

await page.screenshot({ path: `${OUT}/vegan-390-top.png` });
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/vegan-390-bottom.png` });

// ---------- /producers/diet/no-added-sugar (gate closed) ----------
const nasUrl = `${BASE}/producers/diet/no-added-sugar`;
const nasResp = await page.goto(nasUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
check(
  "no-added-sugar returns a REAL 404 (gate closed, columns not shipped)",
  nasResp?.status() === 404,
  `status=${nasResp?.status()}`,
);
await page.screenshot({ path: `${OUT}/no-added-sugar-390-404.png` });

// low-carb is the same closed gate — cheap to confirm both.
const lcResp = await page.request.get(`${BASE}/producers/diet/low-carb`);
check("low-carb also 404s", lcResp.status() === 404, `status=${lcResp.status()}`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? `\nFAILED: ${failed.map((f) => f.name).join(" | ")}` : ""),
);
process.exit(failed.length ? 1 : 0);
