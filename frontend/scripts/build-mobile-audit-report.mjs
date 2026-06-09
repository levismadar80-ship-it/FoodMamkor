#!/usr/bin/env node
/**
 * MEH-233 — merge per-viewport audit findings into the markdown report.
 * Reads docs/audits/MEH-233-findings__<viewport>.json (one per project) and
 * writes docs/audits/2026-06-mobile-audit-MEH-233.md.
 *
 * AUDIT-ONLY tooling — no production code, no layout changes.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.resolve(__dirname, "..", "..", "docs", "audits");
const REPORT = path.join(AUDIT_DIR, "2026-06-mobile-audit-MEH-233.md");
const SHOT_REL = "screenshots/MEH-233";

const VIEWPORTS = ["iphone-se", "galaxy", "iphone-14"];
const VIEWPORT_LABEL = {
  "iphone-se": "iPhone SE (375×667)",
  galaxy: "Galaxy (360×640)",
  "iphone-14": "iPhone 14 (390×844)",
};
const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEV_EMOJI = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "⚪" };

let all = [];
for (const vp of VIEWPORTS) {
  const f = path.join(AUDIT_DIR, `MEH-233-findings__${vp}.json`);
  if (fs.existsSync(f)) {
    all = all.concat(JSON.parse(fs.readFileSync(f, "utf8")));
  }
}

const realFindings = all.filter((f) => f.check !== 0);
const statusRows = all.filter((f) => f.check === 0);

const sevCount = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const f of realFindings) sevCount[f.severity]++;

const routes = [...new Set(all.map((f) => f.route))];

function routeStatus(route) {
  const s = statusRows.find((r) => r.route === route);
  return s ? s.detail : "HTTP 200";
}

const lines = [];
lines.push("# MEH-233 — Mobile Responsiveness Audit (Audit 7/7)");
lines.push("");
lines.push("> **AUDIT-ONLY.** Playwright + screenshots + findings. **No layout fixes** — each");
lines.push("> CRITICAL/HIGH below should be triaged by Sapir into a per-route sub-MEH.");
lines.push("");
lines.push(`- **Date:** 2026-06-08`);
lines.push(`- **Branch:** \`feature/meh-233-audit-mobile\``);
lines.push(`- **Spec:** \`frontend/e2e/mobile-audit/mobile-audit.spec.ts\``);
lines.push(`- **Config:** \`frontend/playwright.mobile-audit.config.ts\``);
lines.push(`- **Viewports:** iPhone SE 375×667 · Galaxy 360×640 · iPhone 14 390×844`);
lines.push(`- **Target:** LOCAL production build (\`npm run build && npm run start\`), Chromium 141.`);
lines.push("");
lines.push("## ⚠️ Environment caveat — no backend");
lines.push("");
lines.push("The sandbox cannot run the backend (Postgres + API), so API-driven content");
lines.push("(producer grids, `/producer/[id]`, `/events`, `/favorites`, admin tables) rendered as");
lines.push("**loading / empty / error states**. External CDNs (fonts, Cloudinary, Unsplash, Google");
lines.push("Maps/GSI) were blocked at the network layer. **Therefore:**");
lines.push("");
lines.push("- **Structural checks are valid** — overflow, nav cut-off, header/footer overlap,");
lines.push("  tap-target size, modal fit, `overflow:hidden` clipping all measure real rendered DOM.");
lines.push("- **Content-density overflow is a KNOWN BLIND SPOT** — long Hebrew product names, dense");
lines.push("  card grids, and real images may introduce overflow not visible here. A follow-up run");
lines.push("  against a seeded staging/preview env is recommended to close this gap.");
lines.push("- Routes that returned non-200 or rendered empty are flagged per-route below.");
lines.push("");
lines.push("## Severity summary");
lines.push("");
lines.push("| Severity | Count |");
lines.push("|---|---|");
lines.push(`| 🔴 CRITICAL | ${sevCount.CRITICAL} |`);
lines.push(`| 🟠 HIGH | ${sevCount.HIGH} |`);
lines.push(`| 🟡 MEDIUM | ${sevCount.MEDIUM} |`);
lines.push(`| ⚪ LOW | ${sevCount.LOW} |`);
lines.push(`| **Total findings** | **${realFindings.length}** |`);
lines.push("");
lines.push("Checks (Phase C): 1 horizontal-overflow · 2 unintentional-truncation · 3 tap-target<44px ·");
lines.push("4 clipped-by-overflow · 5 modal-exceeds-viewport · 6 header/footer-overlap · 7 nav-cut-off.");
lines.push("");

// Top 10 CRITICAL
lines.push("## Top 10 CRITICAL");
lines.push("");
const criticals = realFindings
  .filter((f) => f.severity === "CRITICAL")
  .sort((a, b) => a.route.localeCompare(b.route) || a.check - b.check);
if (criticals.length === 0) {
  lines.push("_No CRITICAL findings recorded in this run._");
} else {
  lines.push("| # | Route | Viewport | Check | Detail | Screenshot |");
  lines.push("|---|---|---|---|---|---|");
  criticals.slice(0, 10).forEach((f, i) => {
    lines.push(
      `| ${i + 1} | \`${f.route}\` | ${f.viewport} | ${f.checkName} | ${f.detail.replace(/\|/g, "\\|").slice(0, 160)} | [img](${SHOT_REL}/${f.screenshot}) |`
    );
  });
}
lines.push("");

// Per-route tables
lines.push("## Findings by route");
lines.push("");
for (const route of routes) {
  const rf = realFindings
    .filter((f) => f.route === route)
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.check - b.check);
  const slug = (all.find((f) => f.route === route)?.screenshot || "").split("__")[0];
  lines.push(`### \`${route}\` — ${routeStatus(route)}`);
  lines.push("");
  lines.push(
    `Screenshots: ${VIEWPORTS.map((vp) => `[${VIEWPORT_LABEL[vp]}](${SHOT_REL}/${slug}__${vp}.png)`).join(" · ")}`
  );
  lines.push("");
  if (rf.length === 0) {
    lines.push("✅ No structural findings.");
    lines.push("");
    continue;
  }
  lines.push("| Severity | Viewport | Check | Detail |");
  lines.push("|---|---|---|---|");
  for (const f of rf) {
    lines.push(
      `| ${SEV_EMOJI[f.severity]} ${f.severity} | ${f.viewport} | ${f.checkName} | ${f.detail.replace(/\|/g, "\\|").slice(0, 200)} |`
    );
  }
  lines.push("");
}

lines.push("## Method");
lines.push("");
lines.push("Each route was loaded per viewport; after a 2.5s settle the full page was screenshotted");
lines.push("and 7 checks ran against the live DOM (`getBoundingClientRect` + `getComputedStyle`).");
lines.push("Heuristic notes: check 2 ignores CSS `text-overflow:ellipsis`/`-webkit-line-clamp`");
lines.push("(intentional); check 3 counts every visible interactive element under 44px (icon-only");
lines.push("buttons included — triage may downgrade); check 6 only fires when a fixed/sticky bar's");
lines.push("band overlaps `<main>`'s top/bottom edge. Severity follows the MEH-233 Phase-C mapping.");
lines.push("");

fs.writeFileSync(REPORT, lines.join("\n"));
// eslint-disable-next-line no-console
console.log(`Report written → ${REPORT} (${realFindings.length} findings, ${sevCount.CRITICAL} CRITICAL)`);
