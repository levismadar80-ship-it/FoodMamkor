#!/usr/bin/env node
/**
 * Module:   scripts/checks/console-sweep.mjs
 * Purpose:  Sweep every route at two viewports and report console errors /
 *           warnings / uncaught page errors / failed requests, classified
 *           (hydration · react-key · deprecation · network · third-party).
 *           Produces the MEH-1966 matrix and is rerunnable to prove a fix.
 * Does NOT: gate CI. It is `.mjs`, and `run-all.sh` discovers only executable
 *           `*.sh` at depth 1, so the dispatcher will never pick this up — by
 *           design. Guards there must be ~1s and network-free; this needs a
 *           running app and takes minutes. Run it by hand, or from a job that
 *           has already booted the stack.
 * Related:  docs/E2E-LOCATORS.md (data-testid rule used by --dashboard login),
 *           backend/scripts/seed_demo_business.py (the seeded owner),
 *           scripts/checks/README.md (why this is not a guard).
 * History:  MEH-1966 (creation).
 *
 * Usage:
 *   node scripts/checks/console-sweep.mjs --base http://localhost:3000
 *   node scripts/checks/console-sweep.mjs --dashboard --base http://localhost:3400
 *   node scripts/checks/console-sweep.mjs --self-test        # no browser needed
 *
 * Exit codes: 0 = swept (findings are data, not failure) · 1 = self-test or
 * control failed · 2 = refused to report (see the NODE_ENV guard below).
 *
 * ── The NODE_ENV guard, and why it is not optional ──────────────────────────
 * On the first MEH-1966 run this sweep reported 18 of 18 routes returning 404.
 * It looked like a site-wide outage. The cause was `NODE_ENV=development`
 * exported into the sweep's own environment; a control run with the default
 * environment served every one of those routes at 200. Next.js does not error
 * on a manually-set NODE_ENV — it just resolves routes differently, and the
 * 404s read exactly like a real finding.
 *
 * So the script REFUSES to report 404s (exit 2) when either signal is present:
 * NODE_ENV set in this process, or a majority of routes 404'ing. Note the
 * footgun actually lived on the SERVER's environment, not the sweep's — which
 * is why the majority-404 trigger exists and is the load-bearing one; checking
 * only our own NODE_ENV would have missed the original case. `--control` lifts
 * the refusal, and is meant to be passed only after re-running against a
 * default-env server. Same shape as "validate a probe on a case whose answer
 * you already know before trusting its red".
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const BASE = val("--base", process.env.SWEEP_BASE || "http://localhost:3000");
const OUT = val("--out", process.env.SWEEP_OUT || "");
const DASHBOARD = has("--dashboard");
const SELF_TEST = has("--self-test");
const CONTROL = has("--control");

const PUBLIC_ROUTES = [
  "/", "/about", "/map", "/producers", "/search", "/login", "/register",
  "/register/producer", "/forgot-password", "/contact", "/privacy", "/terms",
  "/accessibility", "/events", "/experiences", "/group-buys", "/join",
];
const DASHBOARD_ROUTES = [
  "/producer/dashboard", "/producer/dashboard/edit", "/producer/dashboard/tools",
  "/producer/dashboard/insights", "/producer/dashboard/events",
  "/producer/dashboard/events/new", "/producer/dashboard/experiences",
  "/producer/dashboard/group-buys", "/producer/dashboard/recipes",
  "/producer/dashboard/followers", "/settings", "/messages", "/favorites",
];
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false },
];

const ENV_PATTERNS = [
  "__nextjs", "hot-reloader", "webpack-hmr", "turbopack-hmr", "react-refresh",
  "/_next/static/development", "Download the React DevTools",
];
const THIRD_PARTY_HOSTS = [
  "clarity.ms", "posthog", "googletagmanager", "google-analytics", "sentry.io",
  "cloudinary.com", "fonts.googleapis", "fonts.gstatic", "accounts.google",
  "gstatic.com", "va.vercel-scripts", "tile.openstreetmap", "unsplash",
];

/** Sole classifier. --self-test exercises THIS function, never a copy. */
export function classify(kind, text, url = "") {
  const hay = `${text} ${url}`;
  if (ENV_PATTERNS.some((p) => hay.includes(p))) return "env-artifact";
  if (THIRD_PARTY_HOSTS.some((p) => hay.includes(p))) return "third-party";
  if (/hydrat|did not match|server rendered|Text content does not match/i.test(text))
    return "hydration";
  if (/unique "key"|each child in a list|duplicate key/i.test(text)) return "react-key";
  if (/deprecat|will be removed|legacy|is not supported in React/i.test(text))
    return "deprecation";
  if (/Warning:|validateDOMNesting|cannot appear as a descendant/i.test(text))
    return "react-warning";
  if (kind === "requestfailed" || kind === "httpstatus") return "network";
  return kind === "pageerror" ? "page-error" : "other";
}

// ── self-test ───────────────────────────────────────────────────────────────
// A classifier that cannot tell a correct state from a broken one makes every
// later number unreadable, so this runs first and independently of any browser.
if (SELF_TEST) {
  const CASES = [
    ["console.error", 'Warning: Text content did not match. Server: "A"', "", "hydration"],
    ["console.error", 'Warning: Each child in a list should have a unique "key" prop.', "", "react-key"],
    ["console.warn", "componentWillMount is deprecated and will be removed", "", "deprecation"],
    ["pageerror", "Map container is already initialized.", "", "page-error"],
    ["httpstatus", "HTTP 422", "http://localhost:3000/api/experiences/count", "network"],
    ["requestfailed", "net::ERR_TUNNEL_CONNECTION_FAILED",
      "https://res.cloudinary.com/x/image/upload/y.jpg", "third-party"],
    ["console.error", "Refused to load the script 'https://va.vercel-scripts.com/v1/x.js'",
      "", "third-party"],
    ["console.warn", "[Fast Refresh] rebuilding", "http://x/_next/static/development/a.js",
      "env-artifact"],
    // Negative control: ordinary text must NOT be swept into a finding class.
    ["console.error", "Something ordinary happened", "", "other"],
  ];
  let bad = 0;
  for (const [kind, text, url, want] of CASES) {
    const got = classify(kind, text, url);
    if (got !== want) { bad++; console.error(`FAIL want=${want} got=${got} :: ${text.slice(0, 60)}`); }
  }
  // Third-party must win over hydration when both cues are present, otherwise a
  // blocked CDN script would masquerade as a hydration finding.
  if (classify("console.error", "did not match", "https://res.cloudinary.com/a.png") !== "third-party") {
    bad++; console.error("FAIL precedence: third-party must outrank hydration");
  }
  console.log(bad === 0 ? `self-test PASS (${CASES.length + 1} cases)` : `self-test FAIL (${bad})`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── NODE_ENV footgun guard ──────────────────────────────────────────────────
const NODE_ENV_SET = Object.prototype.hasOwnProperty.call(process.env, "NODE_ENV");
if (NODE_ENV_SET && !CONTROL) {
  console.warn(
    `\n⚠  NODE_ENV is set to "${process.env.NODE_ENV}" in this process.\n` +
    `   Route resolution can differ under a manually-set NODE_ENV — this is\n` +
    `   what made an earlier run report 18/18 routes as 404 (MEH-1966).\n` +
    `   Any 404s found below will be WITHHELD unless --control is passed.\n`,
  );
}

// ── browser resolution ──────────────────────────────────────────────────────
// Resolve from the script's own location AND from the caller's cwd: playwright
// lives in frontend/node_modules, while this file sits in scripts/checks/, so
// the script-relative require alone never finds it.
const requireHere = createRequire(import.meta.url);
const requireCwd = createRequire(join(process.cwd(), "__resolve__.js"));
let chromium;
for (const [req, name] of [
  [requireCwd, "playwright"], [requireCwd, "@playwright/test"],
  [requireHere, "playwright"], [requireHere, "@playwright/test"],
]) {
  try { ({ chromium } = req(name)); break; } catch { /* try the next candidate */ }
}
if (!chromium) {
  console.error("playwright not resolvable — run from frontend/ (where it is installed),");
  console.error("or set NODE_PATH, or `npm i -D playwright` in the cwd.");
  process.exit(1);
}
const launchOpts = { args: ["--ssl-version-max=tls1.2"] };
if (process.env.SWEEP_CHROMIUM_PATH) launchOpts.executablePath = process.env.SWEEP_CHROMIUM_PATH;

const ROUTES = DASHBOARD ? DASHBOARD_ROUTES : PUBLIC_ROUTES;
const events = [];
const notFound = new Set();

function record(route, viewport, kind, text, url, extra = {}) {
  events.push({
    route, viewport, kind,
    text: String(text).replace(/\s+/g, " ").slice(0, 400),
    url: String(url || "").slice(0, 220),
    cls: classify(kind, String(text), String(url || "")),
    ...extra,
  });
}

const browser = await chromium.launch(launchOpts);

// ── optional authenticated setup ────────────────────────────────────────────
let storageState;
if (DASHBOARD) {
  const email = process.env.SWEEP_EMAIL || "demo-owner@example.com";
  const password = process.env.SWEEP_PASSWORD || process.env.DEMO_OWNER_PASSWORD;
  if (!password) {
    console.error("--dashboard needs SWEEP_PASSWORD (or DEMO_OWNER_PASSWORD) for the seeded owner.");
    await browser.close();
    process.exit(1);
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.fill('[data-testid="login-email"]', email);
  await p.fill('[data-testid="login-password"]', password);
  // Waiting for the button to enable proves the fills reached React state; a
  // generic input selector once matched the wrong node and left it disabled.
  await p.waitForFunction(
    () => !document.querySelector('[data-testid="login-submit"]')?.disabled, { timeout: 30000 });
  await Promise.all([
    p.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90000 }).catch(() => {}),
    p.click('[data-testid="login-submit"]'),
  ]);
  await p.waitForTimeout(3000);
  const landed = new URL(p.url()).pathname;
  storageState = await ctx.storageState();
  await ctx.close();
  if (landed === "/login") {
    console.error("ABORT: login did not take — refusing to sweep unauthenticated.");
    console.error("An unauthenticated sweep reports a clean console for N copies of /login.");
    await browser.close();
    process.exit(1);
  }
  console.log(`login -> ${landed}`);
}

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile, hasTouch: vp.isMobile, locale: "he-IL",
      ...(storageState ? { storageState } : {}),
    });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning")
        record(route, vp.name, `console.${t}`, m.text(), m.location()?.url);
    });
    page.on("pageerror", (e) => record(route, vp.name, "pageerror", e.message, ""));
    page.on("requestfailed", (r) =>
      record(route, vp.name, "requestfailed", r.failure()?.errorText || "failed", r.url()));
    page.on("response", (r) => {
      if (r.status() >= 400) {
        if (r.status() === 404 && r.url().startsWith(BASE)) notFound.add(route);
        record(route, vp.name, "httpstatus", `HTTP ${r.status()}`, r.url(), { status: r.status() });
      }
    });

    let finalPath = "";
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(2500);
      finalPath = new URL(page.url()).pathname;
    } catch (e) {
      record(route, vp.name, "navigation", `GOTO FAILED: ${e.message}`, BASE + route);
    }
    // A dashboard route that bounced to /login yields a clean console for the
    // wrong page — recorded, never counted as a quiet pass.
    if (DASHBOARD && finalPath.endsWith("/login"))
      record(route, vp.name, "authbounce", "REDIRECTED TO /login — cell not measured", finalPath);

    await ctx.close();
    process.stderr.write(`  ${vp.name.padEnd(7)} ${route}\n`);
  }
}
await browser.close();

// ── the guard fires here, before anything is reported ───────────────────────
// Two independent triggers, because the original footgun lived on the SERVER's
// environment, not this process's — so checking our own NODE_ENV alone would
// miss the exact case that produced it.
//   (a) NODE_ENV set here — correlates with an operator who exported it into
//       the shell that also started the server.
//   (b) a majority of routes 404 — the signature of an environment problem
//       rather than a genuine broken route. A real regression breaks a route
//       or two; it does not break 18 of 18.
const MASS_404 = notFound.size > ROUTES.length / 2;
if (notFound.size > 0 && (NODE_ENV_SET || MASS_404) && !CONTROL) {
  console.error(`\n✋ REFUSING TO REPORT ${notFound.size}/${ROUTES.length} route(s) as 404.`);
  if (NODE_ENV_SET)
    console.error(`   • NODE_ENV="${process.env.NODE_ENV}" is set in this process.`);
  if (MASS_404)
    console.error(`   • A majority of routes 404'd — that shape is environmental far more`);
  console.error(`     often than it is real (MEH-1966: 18/18 "404s" were a set NODE_ENV`);
  console.error(`     on the dev server; a default-env control served every one at 200).`);
  console.error(`\n   Run the control before treating these as findings — restart the app`);
  console.error(`   server with a DEFAULT environment (no exported NODE_ENV), then:\n`);
  console.error(`     env -u NODE_ENV node scripts/checks/console-sweep.mjs --base ${BASE}\n`);
  console.error(`   Withheld: ${[...notFound].join(", ")}`);
  console.error(`   (--control reports them anyway, once you have actually done that run.)`);
  process.exit(2);
}
if (notFound.size > 0)
  console.log(`\nnote: ${notFound.size} route(s) returned 404 — confirm against a` +
    ` default-env server before filing: ${[...notFound].join(", ")}`);

const payload = { base: BASE, mode: DASHBOARD ? "dashboard" : "public", routes: ROUTES.length, events };
if (OUT) { writeFileSync(OUT, JSON.stringify(payload, null, 2)); console.log(`wrote ${OUT}`); }

const byCls = {};
for (const e of events) (byCls[e.cls] ||= []).push(e);
console.log(`\n=== ${events.length} events · ${ROUTES.length} routes × ${VIEWPORTS.length} viewports ===`);
for (const [cls, list] of Object.entries(byCls).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${cls} — ${list.length}`);
  const seen = new Map();
  for (const e of list) {
    const key = `${e.text.slice(0, 130)}|${e.url.split("?")[0].slice(0, 110)}`;
    if (!seen.has(key)) seen.set(key, { ...e, count: 0, routes: new Set() });
    const s = seen.get(key);
    s.count++; s.routes.add(`${e.route}@${e.viewport}`);
  }
  for (const s of [...seen.values()].sort((a, b) => b.count - a.count)) {
    console.log(`  [${String(s.count).padStart(2)}x] ${s.text.slice(0, 160)}`);
    if (s.url) console.log(`        url: ${s.url.slice(0, 125)}`);
    console.log(`        on: ${[...s.routes].slice(0, 5).join(", ")}${s.routes.size > 5 ? ` +${s.routes.size - 5}` : ""}`);
  }
}
if (events.length === 0) console.log("\nno console events recorded.");
void spawnSync; // reserved for a future --control child run
