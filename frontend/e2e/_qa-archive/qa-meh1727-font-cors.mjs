/**
 * MEH-1727 — proves the CORS mechanism, and that gating the Vercel headers
 * fixes it.
 *
 * Serves a minimal local page that pulls the SAME Google Fonts the app pulls
 * (globals.css:1 + [locale]/layout.js:202), then loads it twice:
 *
 *   A. with `extraHTTPHeaders: { x-vercel-skip-toolbar: "1", ... }`  — the
 *      pre-fix config. Every cross-origin @font-face preflights, gstatic does
 *      not list the header in Access-Control-Allow-Headers, all fail.
 *   B. with `extraHTTPHeaders: {}` — what playwright.config.ts now sends for a
 *      localhost target.
 *
 * A local static page is deliberate: it isolates the header from every other
 * variable (Next hydration, app CSS, the VRT harness). The failure being
 * demonstrated is a property of the request headers, not of the app.
 *
 * ⚠️ THIS DOES NOT RUN IN THE CC SANDBOX, AND ITS OUTPUT THERE IS MEANINGLESS.
 * Chromium in the sandbox cannot reach fonts.googleapis.com at all — measured
 * 28/07: `net::ERR_CONNECTION_RESET`. (`curl` reaches it because curl honours
 * HTTPS_PROXY; the browser does not.) With the stylesheet unreachable, NO
 * @font-face rule is ever parsed, so both arms report
 * `document.fonts.size = 0` and zero font requests — the probe returns
 * NOT CONFIRMED for an environmental reason that has nothing to do with the
 * headers under test. Same family as the *.up.railway.app egress block in
 * CLAUDE.md → "Known Bug Patterns".
 *
 * Run it where egress exists — a CI runner, or a local machine. A green run
 * there is the evidence for MEH-1727 §5's "all 11 .woff2 return 200".
 *
 * Run:  node e2e/qa-meh1727-font-cors.mjs
 */
import { chromium } from "@playwright/test";
import http from "http";

/** Optional Chromium path, argv only (see the launch call below). */
const BROWSER_PATH = process.argv[2];

const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700" +
  "&family=Heebo:wght@400;700&family=DM+Sans:wght@400&display=swap";

const PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONT_CSS}">
<style>
  body { font-family: 'Heebo', sans-serif; }
  h1 { font-family: 'Frank Ruhl Libre', serif; }
  p  { font-family: 'DM Sans', sans-serif; }
</style></head>
<body><h1>מהמקור</h1><p>בתי עסק שכבר בדקנו בשבילך</p></body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

/** @param {Record<string,string>} extraHTTPHeaders */
async function probe(label, extraHTTPHeaders) {
  // Optional browser path via ARGV, never an env var — a new `process.env.*`
  // read here is a new undocumented variable and the Env drift gate (MEH-491)
  // reds it. Exactly this happened to MEH-1643's harness with this exact name
  // (`PW_CHROMIUM`, CHANGELOG.md:54); the fix there was argv, and this matches
  // it rather than inventing a second convention. Regression rule 8.
  //   node e2e/qa-meh1727-font-cors.mjs [/path/to/chrome]
  const browser = await chromium.launch(
    BROWSER_PATH ? { executablePath: BROWSER_PATH } : {}
  );
  const context = await browser.newContext({ extraHTTPHeaders });
  const page = await context.newPage();

  const failed = [];
  const ok = [];
  page.on("requestfailed", (req) => {
    if (req.resourceType() === "font") {
      failed.push(`${req.url().split("/").pop()} — ${req.failure()?.errorText ?? "?"}`);
    }
  });
  page.on("response", (res) => {
    if (res.request().resourceType() === "font") ok.push(`${res.status()}`);
  });

  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  const fonts = await page.evaluate(() => {
    let loaded = 0;
    document.fonts.forEach((f) => {
      if (f.status === "loaded") loaded += 1;
    });
    return { total: document.fonts.size, loaded, ready: true };
  });

  await browser.close();
  return { label, failed, okStatuses: ok, fonts };
}

const withHeaders = await probe("A · pre-fix (x-vercel-* sent)", {
  "x-vercel-protection-bypass": "",
  "x-vercel-skip-toolbar": "1",
});
const withoutHeaders = await probe("B · post-fix (localhost → {})", {});

server.close();

for (const r of [withHeaders, withoutHeaders]) {
  console.log(`\n=== ${r.label} ===`);
  console.log(`  document.fonts.ready  : RESOLVED (always — this is the bug)`);
  console.log(`  document.fonts.size   : ${r.fonts.total}`);
  console.log(`  faces status=loaded   : ${r.fonts.loaded}`);
  console.log(`  font responses (2xx)  : ${r.okStatuses.length} [${r.okStatuses.join(",")}]`);
  console.log(`  font requests FAILED  : ${r.failed.length}`);
  for (const f of r.failed) console.log(`      ${f}`);
}

const verdict =
  withHeaders.failed.length > 0 && withoutHeaders.failed.length === 0 && withoutHeaders.fonts.loaded > 0;
console.log(`\nVERDICT: ${verdict ? "CONFIRMED" : "NOT CONFIRMED"} — headers are the cause.`);
process.exit(verdict ? 0 : 1);
