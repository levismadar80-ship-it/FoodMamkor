/**
 * QA harness — MEH-2159 view beacon.
 *
 * Proves the merge gate for the ticket: loading a producer page fires
 * EXACTLY ONE `POST /api/producers/{id}/view`, on BOTH routes, at BOTH
 * viewports. Before this change `/{slug}` fired zero and `/producer/{uuid}`
 * fired two (SSR + client).
 *
 * Run against a local stack (see the PR body for the exact commands):
 *   backend  uvicorn app.main:app --port 8000
 *   frontend next start -p 3000
 *   node e2e/qa-meh2159-view-beacon.mjs
 *
 * ── Why this file has a CONTROL, and why it runs first ────────────────────
 * "0 POSTs to /view" is produced by two different worlds: the beacon is
 * broken, or the page never rendered at all. Those are indistinguishable at
 * the call site, and one of them is the answer this run is hoping for on the
 * before/after comparison. So every navigation asserts the producer's name is
 * actually on screen BEFORE its beacon count is allowed to mean anything, and
 * a failed control aborts the whole run rather than printing a tidy zero.
 * Repo precedent: a slug navigation that rendered "לא מצאנו את בית העסק" and
 * would otherwise have reported three clean "zero wa.me links" lines.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PRODUCER_ID =
  process.env.QA_PRODUCER_ID || "79d66fb7-b4f3-49db-badb-229f1d9c30f9";
const SLUG = process.env.QA_PRODUCER_SLUG || "meh2159-beacon-qa";
const EXPECTED_NAME = process.env.QA_PRODUCER_NAME || "עסק בדיקת ביקון";
const OUT = path.resolve(process.cwd(), "../qa-artifacts/MEH-2159");

const VIEWPORTS = [
  { label: "375", width: 375, height: 812 },
  { label: "1440", width: 1440, height: 900 },
];

const ROUTES = [
  { label: "slug", path: `/${SLUG}?from=search`, expectReferrer: "search" },
  { label: "uuid", path: `/producer/${PRODUCER_ID}`, expectReferrer: null },
];

const failures = [];
const rows = [];

function check(name, ok, detail) {
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function run() {
  await fs.mkdir(OUT, { recursive: true });
  // The sandbox ships Chromium build 1194 while this repo's @playwright/test
  // pins 1234, so the default resolution misses. Point at the pre-installed
  // binary rather than downloading one (the environment forbids
  // `playwright install`). CI is unaffected — it resolves normally.
  const executablePath =
    process.env.QA_CHROMIUM ||
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({ executablePath });

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: "he-IL",
      });
      const page = await ctx.newPage();

      // Record every request the page issues, so the PR can show the whole
      // list rather than a count somebody has to take on trust.
      const requests = [];
      page.on("request", (r) => {
        requests.push({ method: r.method(), url: r.url(), body: r.postData() });
      });

      const label = `${route.label}-${vp.label}`;
      await page.goto(`${BASE}${route.path}`, { waitUntil: "load" });

      // ---- CONTROL: the page really rendered this producer -------------
      // Gated on the <h1>, not on a substring of the HTML: the bundled i18n
      // dictionary contains both the producer name and the not-found string,
      // so a body-text grep cannot tell a rendered page from a 404 shell.
      let heading = "";
      try {
        heading = await page
          .locator("h1")
          .first()
          .innerText({ timeout: 10_000 });
      } catch {
        heading = "<no h1 within 10s>";
      }
      const rendered = heading.includes(EXPECTED_NAME);
      check(
        `[${label}] CONTROL: producer page rendered`,
        rendered,
        `h1="${heading.trim().slice(0, 60)}"`,
      );
      if (!rendered) {
        console.log(
          `\n!! CONTROL FAILED for ${label}. Every beacon count in this run is VOID —\n` +
            `   a page that did not render cannot be evidence about how many\n` +
            `   beacons a rendered page fires.\n`,
        );
        await ctx.close();
        continue;
      }

      // The beacon is fire-and-forget; give it a bounded window to land.
      // Bounded and caught deliberately (networkidle is banned, MEH-215):
      // far above a healthy settle, so a good run is unaffected and only the
      // pathological one is capped.
      await page
        .waitForRequest((r) => r.url().includes("/view") && r.method() === "POST", {
          timeout: 5_000,
        })
        .catch(() => {});
      await page.waitForTimeout(1_500);

      const viewPosts = requests.filter(
        (r) => r.method === "POST" && r.url.includes(`/producers/`) && r.url.endsWith("/view"),
      );

      check(
        `[${label}] exactly 1 POST /view`,
        viewPosts.length === 1,
        `got ${viewPosts.length}`,
      );

      if (viewPosts.length === 1) {
        check(
          `[${label}] beacon targets the right producer`,
          viewPosts[0].url.includes(PRODUCER_ID),
          viewPosts[0].url,
        );
        let parsed = null;
        try {
          parsed = JSON.parse(viewPosts[0].body || "{}");
        } catch {
          /* reported by the assertion below */
        }
        check(
          `[${label}] referrer === ${JSON.stringify(route.expectReferrer)}`,
          parsed !== null && parsed.referrer === route.expectReferrer,
          `body=${viewPosts[0].body}`,
        );
      }

      const shot = path.join(OUT, `${label}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      rows.push({
        route: route.label,
        viewport: vp.label,
        heading: heading.trim().slice(0, 40),
        viewPosts: viewPosts.length,
        body: viewPosts[0]?.body ?? null,
        allRequests: requests
          .filter((r) => r.url.includes("/api/"))
          .map((r) => `${r.method} ${r.url.replace(BASE, "")}`),
      });

      await ctx.close();
    }
  }

  await browser.close();

  console.log("\n=== network calls to /api per run ===");
  for (const r of rows) {
    console.log(`\n--- ${r.route} @ ${r.viewport}px  (h1: ${r.heading}) ---`);
    for (const c of r.allRequests) console.log(`  ${c}`);
    console.log(`  => POST /view count: ${r.viewPosts}   body: ${r.body}`);
  }

  await fs.writeFile(
    path.join(OUT, "network-calls.json"),
    JSON.stringify(rows, null, 2),
    "utf8",
  );

  console.log(
    `\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURE(S)`} — ` +
      `${rows.length}/4 navigations completed their control.`,
  );
  if (rows.length !== 4) {
    console.log(
      "NOTE: fewer than 4 navigations produced evidence — this run is INCOMPLETE.",
    );
  }
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(failures.length === 0 && rows.length === 4 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
