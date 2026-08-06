/**
 * MEH-1916 self-QA — ProductSheet CTA per primary_contact_method.
 *
 * Chromium, mobile viewport (375×812 @2x) ONLY. MEH-1788: WebKit cannot be
 * installed in the CC sandbox (403), so there is NO Safari coverage here and
 * none is claimed.
 *
 * Loads the markup dumped by __tests__/qa-meh1916-markup.test.jsx (the REAL
 * component) beside the app's own built Tailwind CSS, so the pixels come from
 * the shipped stylesheet rather than a hand-written approximation.
 *
 * Pins (each printed PASS/FAIL, exit 1 on any FAIL):
 *   P1  website primary → "להזמנה באתר", UTM-tagged href, target=_blank,
 *       rel="noopener" (noreferrer dropped — MEH-1525)
 *   P2  website primary → a SECOND, quieter WA node exists, is not a button-
 *       styled CTA, and sits below the primary
 *   P3  whatsapp primary → exactly ONE CTA, btn-whatsapp, no secondary
 *   P4  website + no phone → the primary still renders and NO wa.me link exists
 *   P5  every CTA node clears a 44px tap target
 *
 * Usage: node e2e/qa-meh1916-cta.mjs [outDir]
 * Prereq: MEH1916_QA=1 npx vitest run __tests__/qa-meh1916-markup.test.jsx
 *         && npm run build   (for the CSS)
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "../qa-artifacts/MEH-1916";
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
<style>body{margin:0;background:#FBF9F4;font-family:system-ui,sans-serif}</style>
</head><body>${bodyHtml}</body></html>`;

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

// Read the CTA layer out of a rendered sheet. Deliberately reads the DOM the
// browser actually built — not the source — so a class that never reached the
// stylesheet, or a node that never mounted, shows up as an absence here.
const probeCta = () => {
  const pick = (sel) => document.querySelector(sel);
  const describe = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      testid: el.getAttribute("data-testid"),
      method: el.getAttribute("data-method"),
      text: el.textContent.trim(),
      href: el.getAttribute("href"),
      target: el.getAttribute("target"),
      rel: el.getAttribute("rel"),
      cls: el.className,
      h: Math.round(r.height),
      top: Math.round(r.top),
      bg: cs.backgroundColor,
      underline: cs.textDecorationLine,
    };
  };
  return {
    primary: describe(pick('[data-testid="product-sheet-cta"]')),
    waPrimary: describe(pick('[data-testid="product-sheet-wa-cta"]')),
    secondary: describe(pick('[data-testid="product-sheet-wa-secondary"]')),
    waLinkCount: document.querySelectorAll("a[href*='wa.me']").length,
    ctaCount: document.querySelectorAll(
      '[data-testid="product-sheet-cta"],[data-testid="product-sheet-wa-cta"],[data-testid="product-sheet-wa-secondary"]',
    ).length,
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
for (const label of ["website", "whatsapp", "website-nophone"]) {
  const p = await ctx.newPage();
  await p.setContent(page(readFileSync(`${OUT}/sheet-${label}.html`, "utf8")));
  await p.screenshot({ path: `${OUT}/sheet-${label}-375.png` });
  shots[label] = await p.evaluate(probeCta);
  await p.close();
}

const w = shots.website;
record(
  "P1 website primary → locked label + UTM + new tab + rel drops noreferrer",
  !!w.primary &&
    w.primary.method === "website" &&
    w.primary.text.includes("להזמנה באתר") &&
    (w.primary.href || "").includes("utm_source=mehamakor") &&
    (w.primary.href || "").includes("utm_medium=referral") &&
    w.primary.target === "_blank" &&
    w.primary.rel === "noopener",
  w.primary
    ? `text="${w.primary.text}" · rel="${w.primary.rel}" · target=${w.primary.target}\n      href=${w.primary.href}`
    : "no primary CTA node rendered",
);

record(
  "P2 website primary → WA survives as a QUIET secondary below it",
  !!w.secondary &&
    !!w.primary &&
    w.secondary.top > w.primary.top &&
    w.secondary.underline.includes("underline") &&
    // A transparent background is what makes it read as a text link rather than
    // a second button competing with the channel she chose.
    /rgba\(0, 0, 0, 0\)|transparent/.test(w.secondary.bg) &&
    !w.secondary.cls.includes("btn-whatsapp"),
  w.secondary
    ? `text="${w.secondary.text}" · bg=${w.secondary.bg} · decoration=${w.secondary.underline} · ` +
      `top ${w.secondary.top} > primary top ${w.primary.top}`
    : "no secondary WA node rendered",
);

const wa = shots.whatsapp;
record(
  "P3 whatsapp primary → exactly one CTA, btn-whatsapp, no secondary",
  wa.ctaCount === 1 &&
    !!wa.waPrimary &&
    wa.waPrimary.cls.includes("btn-whatsapp") &&
    wa.secondary === null &&
    wa.waLinkCount === 1,
  `CTA nodes = ${wa.ctaCount} · wa.me links = ${wa.waLinkCount} · ` +
    `class contains btn-whatsapp = ${!!wa.waPrimary && wa.waPrimary.cls.includes("btn-whatsapp")}`,
);

const np = shots["website-nophone"];
record(
  "P4 website + no phone → primary renders, zero wa.me links (the dead end is closed)",
  !!np.primary && np.primary.method === "website" && np.waLinkCount === 0 && np.secondary === null,
  np.primary
    ? `primary method=${np.primary.method} · wa.me links = ${np.waLinkCount} · secondary = ${np.secondary}`
    : "no CTA rendered at all — this is the dead end MEH-1916 exists to close",
);

const allNodes = Object.entries(shots).flatMap(([label, s]) =>
  [s.primary, s.waPrimary, s.secondary]
    .filter(Boolean)
    .map((n) => ({ label, id: n.testid, h: n.h })),
);
record(
  "P5 every CTA node clears a 44px tap target",
  allNodes.length > 0 && allNodes.every((n) => n.h >= 44),
  allNodes.map((n) => `${n.label}/${n.id}=${n.h}px`).join(" · "),
);

await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} pins passed`);
if (failed.length) process.exit(1);
