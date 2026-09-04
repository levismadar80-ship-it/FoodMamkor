/**
 * MEH-2203 — axe-core audit across the five core routes, report-only.
 *
 * Purpose:  Put the accessibility statement ("פועלות להתאים לת״י 5568 ברמת AA",
 *           he.json) on a measurement instead of an assumption. REPORT ONLY —
 *           this script fixes nothing and opens no tickets.
 * Touches:  nothing in the app. Writes qa-artifacts/MEH-2203/ only.
 *
 * WHY STAGING AND NOT A LOCAL `next start` (deviation from the card, stated):
 *   The card says "vs local next start + seed". There is no backend or seeded
 *   DB in the CC sandbox, so a local server renders empty states and error
 *   boundaries — axe would faithfully audit a surface that does not exist in
 *   production, and report a clean-looking result. That is the #2786 failure
 *   (six PNGs, six successes, exit 0, photographing an error boundary).
 *   Staging is the deployed surface the statement actually describes.
 *
 * THE TWO CONTROLS, AND WHY EACH EXISTS
 *   A "0 violations" line has three possible causes: the page is accessible,
 *   the page never rendered, or axe never ran. Two of those are failures that
 *   read as the reassuring answer (.claude/rules/testing.md — "a probe whose
 *   null output is also its reassuring output is not evidence").
 *     CONTROL A (render): http 200, no error boundary, non-zero body box.
 *     CONTROL B (axe liveness): results.passes.length > 0. axe that analysed
 *       nothing returns violations:[] AND passes:[] — indistinguishable from a
 *       perfect page at the call site.
 *   If either control fails for a row, that row's numbers are VOID and are
 *   printed as VOID, never as zero.
 */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "https://staging.mehamakor.online";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const CONTEXT_OPTS = BYPASS
  ? { extraHTTPHeaders: { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } }
  : {};

const host = (() => { try { return new URL(BASE).hostname; } catch { return ""; } })();
const isLocal = host === "127.0.0.1" || host === "localhost";

if (/(^|\.)mehamakor\.co\.il$/.test(host)) {
  console.error(`REFUSING to audit production (${host}). Use staging.`);
  process.exit(2);
}
if (!isLocal && !BYPASS) {
  console.error(`REFUSING: ${BASE} is remote and VERCEL_AUTOMATION_BYPASS_SECRET is unset — every page would be the SSO screen.`);
  process.exit(2);
}

const OUT = "qa-artifacts/MEH-2203";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const log = [];
const say = (s) => { console.log(s); log.push(s); };

async function renderControl(page) {
  return page.evaluate(() => {
    const b = document.body;
    const box = b?.getBoundingClientRect?.() || { width: 0, height: 0 };
    const text = b?.innerText || "";
    return {
      w: Math.round(box.width),
      h: Math.round(box.height),
      errorBoundary: text.includes("משהו השתבש"),
      chars: text.length,
    };
  });
}

const rows = [];

(async () => {
  // --ssl-version-max=tls1.2: the sandbox's Chromium offers a TLS-1.3
  // ClientHello the Vercel edge drops (MEH-938/942, re-confirmed MEH-2118).
  // The repo pins a Playwright whose browser build the sandbox does not carry
  // (wants 1234, has 1194). The environment documents executablePath as the
  // sanctioned route rather than `playwright install`.
  // Use the sandbox build only IF PRESENT, else let Playwright resolve its own.
  // That is the house pattern across ~20 harnesses here — see
  // e2e/qa-meh2108-citysearch-occlusion.mjs:608 and the note above it.
  // An env-var override was written here first and is reverted: it reddened
  // `Env drift (.env.example)`, which BLOCKS on any env var read in code and
  // undocumented in a .env.example. Documenting it would mean ADDING an env
  // var — regression rule 8 requires those be listed and confirmed first — for
  // a portability fallback the repo already solves without one. The gate's
  // exclude list carries PLAYWRIGHT_CHROMIUM_PATH, not the name used here.
  // Do not spell that override out even in prose: check_env_drift.sh greps raw
  // text and cannot tell code from a comment, so naming it literally re-reds
  // the gate.
  const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({
    ...(existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}),
    args: ["--ssl-version-max=tls1.2"],
  });

  // Discover a real producer slug through the /api proxy rather than hardcoding.
  let slug = null;
  {
    const ctx = await browser.newContext(CONTEXT_OPTS);
    const p = await ctx.newPage();
    const r = await p.goto(`${BASE}/api/producers?limit=1`, { waitUntil: "domcontentloaded" });
    try {
      const j = JSON.parse(await p.evaluate(() => document.body.innerText));
      // The endpoint returns a BARE ARRAY. An earlier version of this line read
      // `j.items || j.producers || j.results` and reported slug=NONE against a
      // catalogue of 17 — a wrong key whose output reads exactly like "no data",
      // which is why the run below prints the discovered slug rather than only
      // its absence.
      const list = Array.isArray(j) ? j : (j.items || j.producers || j.results || []);
      slug = list[0]?.slug || null;
    } catch { /* leave null; reported below */ }
    say(`slug discovery: http=${r?.status()} slug=${slug ?? "NONE"}`);
    await ctx.close();
  }

  const ROUTES = [
    ["home", "/he"],
    ["producers", "/he/producers"],
    ["map", "/he/map"],
    ...(slug ? [["producer-detail", `/he/${slug}`]] : []),
    ["register-producer", "/he/register/producer"],
  ];
  if (!slug) say("WARNING: no producer slug discovered — the producer-detail row is ABSENT, not passing.");

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ ...CONTEXT_OPTS, viewport: { width: vp.width, height: vp.height } });
    for (const [label, path] of ROUTES) {
      const page = await ctx.newPage();
      let row = { vp: vp.name, label, path, status: null, void: null, violations: null, passes: null, byImpact: {}, detail: [] };
      try {
        const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        row.status = resp?.status() ?? 0;
        await page.waitForTimeout(1500);
        const ctrlA = await renderControl(page);
        if (row.status !== 200 || ctrlA.errorBoundary || ctrlA.w === 0 || ctrlA.h === 0) {
          row.void = `CONTROL A failed — http=${row.status} errorBoundary=${ctrlA.errorBoundary} box=${ctrlA.w}x${ctrlA.h}`;
        } else {
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          if (!results.passes || results.passes.length === 0) {
            row.void = `CONTROL B failed — axe returned passes=0, so violations=${results.violations?.length ?? "?"} is not a measurement`;
          } else {
            row.violations = results.violations.length;
            row.passes = results.passes.length;
            for (const v of results.violations) {
              row.byImpact[v.impact || "unknown"] = (row.byImpact[v.impact || "unknown"] || 0) + 1;
              row.detail.push({
                id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
                count: v.nodes.length,
                // Every node, not just the first. A report that says "7 nodes"
                // and shows one is an artifact asserting coverage it does not
                // have -- the reader cannot act on the other six.
                nodes: v.nodes.map((n) => ({
                  target: n.target?.join(" ") || "",
                  summary: (n.failureSummary || "").replace(/\s+/g, " ").trim(),
                  html: (n.html || "").slice(0, 200),
                })),
              });
            }
          }
        }
      } catch (e) {
        row.void = `EXCEPTION — ${String(e).slice(0, 160)}`;
      }
      rows.push(row);
      say(`${row.void ? "VOID " : "ok   "} ${vp.name.padEnd(13)} ${label.padEnd(18)} http=${row.status} ` +
          (row.void ? row.void : `violations=${row.violations} passes=${row.passes} ${JSON.stringify(row.byImpact)}`));
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();

  writeFileSync(`${OUT}/axe-run.log`, log.join("\n") + "\n");
  writeFileSync(`${OUT}/axe-raw.json`, JSON.stringify(rows, null, 2));
  console.log(`\nwrote ${OUT}/axe-run.log + axe-raw.json`);
  const voids = rows.filter((r) => r.void).length;
  console.log(`rows=${rows.length} void=${voids} measured=${rows.length - voids}`);
})();
