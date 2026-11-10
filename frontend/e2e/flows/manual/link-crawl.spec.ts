/**
 * Module:   link-crawl.spec
 * Purpose:  MEH-2864 («ייעול הבדיקות», item 1) — the full broken-link crawl
 *           runs HERE, against the local `next start` the E2E job already
 *           serves (e2e.yml: PLAYWRIGHT_BASE_URL=http://localhost:3000), not
 *           against the live site after every push. Zero requests to Vercel,
 *           and a broken internal link goes red before the merge rather than
 *           after it. The post-deploy job keeps only `link-check --smoke`
 *           (≤10 URLs) against Vercel.
 * How:      runs scripts/link-check.mjs as a child process and asserts its
 *           exit code; its own report (mode, pages, broken links with their
 *           referrers, «requests to Vercel: 0») is attached to the test.
 * Does NOT: run against a non-local base. A Vercel-hosted base would be the
 *           exact cost this card removes, so the spec SKIPS — the skip gates
 *           on the configured base URL, never on what the crawl finds.
 *           Runs once per E2E run (the `desktop` project), not per device.
 * Related:  scripts/link-check.mjs (the crawler, its --self-test, the
 *           blind-spot preflight) · .github/workflows/post-deploy-checks.yml.
 * History:  MEH-2864 (creation).
 */
import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SCRIPT = path.resolve(__dirname, "../../../../scripts/link-check.mjs");

test("every internal link on the local build answers (full crawl, 0 requests to Vercel)", async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one crawl per E2E run — the desktop project runs it");
  const base = process.env.PLAYWRIGHT_BASE_URL || baseURL || "";
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    host = "";
  }
  test.skip(!LOCAL_HOSTS.has(host), `base ${base || "(unset)"} is not a local next start — a crawl there would bill Vercel`);
  test.setTimeout(15 * 60_000);

  const run = spawnSync(process.execPath, [SCRIPT, base], { encoding: "utf8", timeout: 14 * 60_000 });
  const report = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  await testInfo.attach("link-check report", { body: report, contentType: "text/plain" });
  console.log(report);

  expect(report, "the crawler printed no report — did it run?").toContain("crawled:");
  expect(report).toContain("requests to Vercel: 0");
  expect(run.status, `link-check exited ${run.status} — broken links (with referrers) are in the report above`).toBe(0);
});
