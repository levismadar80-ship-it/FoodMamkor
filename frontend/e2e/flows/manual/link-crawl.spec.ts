/**
 * Module:   link-crawl.spec
 * Purpose:  MEH-2864 («ייעול הבדיקות», item 1) — the broken-link crawl runs
 *           HERE, against the local `next start` the E2E job already serves
 *           (e2e.yml: PLAYWRIGHT_BASE_URL=http://localhost:3000), not against
 *           the live site after every push. Zero requests to Vercel. It runs
 *           wherever E2E runs: every staging push, and a PR labelled
 *           `run-e2e` — so a broken link CAN go red before the merge, but E2E
 *           is not a required gate (testing.md, MEH-716/2779). The post-deploy
 *           job keeps only `link-check --smoke` (≤10 URLs) against Vercel.
 * How:      runs scripts/link-check.mjs as a child process and asserts its
 *           exit code; its own report (mode, pages, broken links with their
 *           referrers, «requests to Vercel: 0») is attached to the test.
 * Pacing:   the local server renders against the SHARED staging backend
 *           (e2e.yml), whose per-IP limits are 120/min on /producers and
 *           by-slug, while the other E2E worker hits it too. So the crawl is
 *           capped (--max-pages=400) and paced (--delay-ms=600, ≤100 pages a
 *           minute), and never retried: a retry would double that load.
 *           Measure one real CI run before raising either number.
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

// One attempt only — see «Pacing» above.
test.describe.configure({ retries: 0 });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SCRIPT = path.resolve(__dirname, "../../../../scripts/link-check.mjs");

test("every internal link on the local build answers (local crawl, no Vercel requests)", async ({ baseURL }, testInfo) => {
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

  const run = spawnSync(process.execPath, [SCRIPT, base, "--max-pages=400", "--delay-ms=600"], {
    encoding: "utf8",
    timeout: 14 * 60_000,
  });
  const report = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  // A killed or unstartable child says so, instead of a misleading "no report".
  expect(run.error, `link-check did not run: ${run.error?.message}`).toBeUndefined();
  expect(run.signal, `link-check was killed by ${run.signal} (the 14-minute cap?) — partial report:\n${report}`).toBeNull();
  await testInfo.attach("link-check report", { body: report, contentType: "text/plain" });
  console.log(report);

  expect(report, "the crawler printed no report — did it run?").toContain("crawled:");
  expect(run.status, `link-check exited ${run.status} — broken links (with referrers) are in the report above`).toBe(0);
});
