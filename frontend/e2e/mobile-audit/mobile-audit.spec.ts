/**
 * MEH-233 — Mobile responsiveness audit (Audit 7/7). AUDIT-ONLY — captures
 * screenshots + structured findings; makes ZERO layout fixes.
 *
 * For each route × the active viewport (project) this:
 *   1. blocks external font/image/media hosts (sandbox can't reach them and
 *      they hang the page),
 *   2. navigates + lets layout settle,
 *   3. writes a full-page screenshot to ../docs/audits/screenshots/MEH-233/,
 *   4. runs the 7 Phase-C checks in-page and records findings.
 *
 * Findings per viewport are written to
 * ../docs/audits/MEH-233-findings__<project>.json; a separate node step
 * (scripts/build-mobile-audit-report.mjs) merges them into the markdown report.
 *
 * NOTE: this run targets a LOCAL frontend build with NO backend, so API-driven
 * content (producer lists, /producer/[id], /events, /favorites) renders as
 * loading/empty/error states. Structural checks (overflow, nav, header/footer,
 * tap targets, modals) are still valid; content-density overflow is a KNOWN
 * blind spot recorded in the report.
 */
import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { runLayoutChecks } from "../_screen-checks.mjs";

const SHOT_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "audits",
  "screenshots",
  "MEH-233"
);
const OUT_DIR = path.resolve(__dirname, "..", "..", "..", "docs", "audits");

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Finding = {
  route: string;
  viewport: string;
  check: number;
  checkName: string;
  severity: Severity;
  detail: string;
  screenshot: string;
};

// Phase B routes — every path verified to exist in frontend/app/[locale]/ in
// Phase A. he is the default locale (localePrefix "as-needed") → no /he prefix.
// /producer/[id] uses a placeholder id (no backend → expected empty/not-found).
const ROUTES: { path: string; slug: string; note?: string }[] = [
  { path: "/", slug: "home" },
  { path: "/map", slug: "map" },
  { path: "/login", slug: "login" },
  { path: "/register", slug: "register" },
  { path: "/register/producer", slug: "register-producer" },
  { path: "/producer/1", slug: "producer-detail", note: "placeholder id, no backend" },
  { path: "/favorites", slug: "favorites" },
  { path: "/settings", slug: "settings" },
  { path: "/admin", slug: "admin", note: "best-effort, no admin login" },
  { path: "/events", slug: "events" },
  { path: "/about", slug: "about" },
];

const findings: Finding[] = [];

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(() => {
  const project = test.info().project.name;
  const file = path.join(OUT_DIR, `MEH-233-findings__${project}.json`);
  fs.writeFileSync(file, JSON.stringify(findings, null, 2));
  console.log(`\n=== ${findings.length} findings (${project}) → ${file} ===`);
});

async function blockExternal(page: Page) {
  // Sandbox cannot reach external CDNs (fonts, Cloudinary, Unsplash, Google
  // Maps/GSI). Abort them so the page doesn't hang on the network.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const isLocal = url.includes("localhost:3000") || url.startsWith("data:") || url.startsWith("blob:");
    if (isLocal) return route.continue();
    const type = route.request().resourceType();
    if (["image", "font", "media", "stylesheet"].includes(type)) return route.abort();
    // Allow other cross-origin (rare) to fail fast rather than hang.
    return route.abort();
  });
}

// The 7 Phase-C checks moved to ../_screen-checks.mjs (MEH-3816, one owner;
// the screenshot-review skill runs the same code).
const runChecks = runLayoutChecks;

for (const route of ROUTES) {
  test(`audit ${route.path}`, async ({ page }, testInfo) => {
    const viewport = testInfo.project.name;
    await blockExternal(page);

    const resp = await page
      .goto(route.path, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    const status = resp ? resp.status() : 0;

    // Let client components hydrate + layout settle.
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));

    const shotName = `${route.slug}__${viewport}.png`;
    await page
      .screenshot({ path: path.join(SHOT_DIR, shotName), fullPage: true })
      .catch(() => {});

    const result = await runChecks(page, viewport);
    for (const f of result.out) {
      findings.push({
        route: route.path,
        viewport,
        check: f.check,
        checkName: f.checkName,
        severity: f.severity as Severity,
        detail: f.detail,
        screenshot: shotName,
      });
    }

    // Record an info row when the route returned non-200 (audit context, not a
    // layout failure — keeps the report honest about which surfaces were real).
    if (status !== 200) {
      findings.push({
        route: route.path,
        viewport,
        check: 0,
        checkName: "Route status",
        severity: "LOW",
        detail: `HTTP ${status}${route.note ? ` (${route.note})` : ""}`,
        screenshot: shotName,
      });
    }

    // AUDIT-ONLY: never fail the test on findings — we always want the run to
    // complete and emit every screenshot. expect is a smoke guard only.
    expect(result.W).toBeGreaterThan(0);
  });
}
