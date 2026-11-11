#!/usr/bin/env node
/**
 * Module:   static-routes-guard
 * Purpose:  MEH-2878 — fail the CI build if a page type that should be served
 *           from the cache (● SSG / ISR) has gone back to rendering on every
 *           request (ƒ). One server-side next-intl call without a locale in a
 *           shared file (app/[locale]/loading.js, until MEH-2878) silently made
 *           88 of 89 routes per-request, and nothing reported it.
 * How:      after `next build`, reads .next/prerender-manifest.json and checks
 *           that every route in static-routes.expected.json is prerendered.
 *           Prints each route's revalidate value. A prerendered route that is
 *           not in the list is printed (not failed) — add it to lock it in.
 * Runs:     as `postbuild` (npm runs it after `npm run build`), in CI only.
 *           Exits 0 on Vercel (VERCEL_ENV set) so it can never block a deploy,
 *           and outside CI unless run with --force. No env var of its own: the
 *           env-drift guard (MEH-491) would ask for it in .env.example.
 * Usage:    node scripts/static-routes-guard.mjs [--self-test | --force]
 * History:  MEH-2878 (creation).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = path.join(ROOT, "static-routes.expected.json");

/** Pure: expected routes missing from the manifest, and prerendered extras. */
export function checkRoutes(expected, manifestRoutes) {
  const have = new Set(Object.keys(manifestRoutes));
  const missing = expected.filter((r) => !have.has(r));
  const extra = [...have].filter((r) => !expected.includes(r)).sort();
  return { missing, extra };
}

function selfTest() {
  const cases = [
    ["all expected present → nothing missing", checkRoutes(["/he/about"], { "/he/about": {} }).missing.length, 0],
    ["a route gone dynamic → reported missing", checkRoutes(["/he/about", "/he/join"], { "/he/about": {} }).missing.join(), "/he/join"],
    ["a new prerendered route → extra, not missing", checkRoutes([], { "/he/new": {} }).extra.join(), "/he/new"],
    ["empty manifest → every expected route missing", checkRoutes(["/a", "/b"], {}).missing.length, 2],
  ];
  let bad = 0;
  for (const [name, got, want] of cases) {
    const ok = got === want;
    console.log(`${ok ? "PASS" : "FAIL"}  self-test: ${name}${ok ? "" : ` (got ${got}, want ${want})`}`);
    if (!ok) bad += 1;
  }
  const list = JSON.parse(readFileSync(EXPECTED, "utf8"));
  const listOk = Array.isArray(list) && list.length > 0;
  console.log(`${listOk ? "PASS" : "FAIL"}  self-test: static-routes.expected.json lists ${list.length} routes`);
  process.exit(bad === 0 && listOk ? 0 : 1);
}

function revalidateLabel(entry) {
  if (!entry) return "MISSING — renders on every request";
  const rev = entry.initialRevalidateSeconds === false ? "static (no revalidate)" : `revalidate ${entry.initialRevalidateSeconds}s`;
  // A page that calls notFound() at build is still "prerendered" — as a 404.
  // Say so, so a page that turned into a 404 is visible (MEH-2878 review).
  return entry.initialStatus && entry.initialStatus !== 200 ? `${rev} · prerendered as HTTP ${entry.initialStatus}` : rev;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (process.env.VERCEL_ENV) {
    console.log("static-routes-guard: skipped on Vercel (never blocks a deploy)");
    return;
  }
  if (!process.env.CI && !process.argv.includes("--force")) {
    console.log("static-routes-guard: skipped outside CI (--force runs it locally)");
    return;
  }
  const manifestPath = path.join(ROOT, ".next", "prerender-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("static-routes-guard: FAIL — .next/prerender-manifest.json not found. Did `next build` run?");
    process.exit(1);
  }
  const routes = JSON.parse(readFileSync(manifestPath, "utf8")).routes || {};
  const expected = JSON.parse(readFileSync(EXPECTED, "utf8"));
  const { missing, extra } = checkRoutes(expected, routes);

  console.log(`static-routes-guard: ${expected.length} routes must be served from the cache (SSG/ISR)`);
  for (const r of expected) {
    console.log(`  ${routes[r] ? "ok  " : "FAIL"}  ${r.padEnd(52)} ${revalidateLabel(routes[r])}`);
  }
  if (extra.length) {
    console.log(`\nAlso prerendered, not locked in static-routes.expected.json (${extra.length}):`);
    for (const r of extra) console.log(`  +     ${r}  ${revalidateLabel(routes[r])}`);
  }
  if (missing.length) {
    console.error(
      `\nstatic-routes-guard: FAIL — ${missing.length} route(s) now render on every request:\n` +
        missing.map((r) => `  ${r}`).join("\n") +
        "\nSomething made them dynamic: headers()/cookies(), a next-intl server call without a locale " +
        "(getTranslations/getMessages/getLocale), a no-store fetch, searchParams. " +
        "Put `export const dynamic = \"error\"` on one of them and rebuild to get the culprit's stack.",
    );
    process.exit(1);
  }
  console.log("\nstatic-routes-guard: OK");
}

main();
