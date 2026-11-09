#!/usr/bin/env node
/**
 * Module:   link-check
 * Purpose:  Crawl every internal link reachable from the site root against a
 *           running build, and report broken targets (4xx/5xx), redirect chains
 *           and dead in-page anchors. Repeatable: same command, same shape of
 *           answer, on any branch.
 * Does NOT: follow external hosts, and does NOT run under `scripts/checks/`.
 *           That directory is auto-discovered by `scripts/checks/run-all.sh`,
 *           so a file dropped there becomes a leg of the required Repo-guards
 *           gate — and MEH-1963 explicitly scopes CI wiring OUT of this card.
 *           Living at the scripts root keeps it a tool you run, not a gate that
 *           runs you. (The card's prompt names `scripts/checks/link-check.sh`;
 *           that path and its own "NOT wired to CI in this card" instruction
 *           cannot both hold, and the instruction is the one carrying intent.)
 * Related:  frontend/public/robots.txt (the Disallow set this honours),
 *           frontend/app/sitemap.js (the URL set robots must not contradict),
 *           MEH-1955 (robots/sitemap gap-check — the sibling half).
 * History:  MEH-1963 (creation) · MEH-2749 (Vercel bypass header from env, so
 *           the post-deploy workflow can crawl staging) · MEH-2864 (page
 *           budget: a staging target gets a 40-page sample, not a full crawl).
 *
 * Usage:  node scripts/link-check.mjs [baseURL] [--json] [--max-pages=N]
 *         node scripts/link-check.mjs --self-test
 *         default baseURL http://localhost:3000 (run `next start` first)
 *
 * PAGE BUDGET (MEH-2864)
 *   Every crawled page is a server render on whatever hosts the target. The
 *   post-deploy workflow ran this crawl (up to 2000 pages) on EVERY push to
 *   staging; at ~30 self-merges a day that is the main suspect for the Vercel
 *   Hobby team crossing its Fluid Active CPU limit and being suspended
 *   (09/11, production down with it). So the budget depends on the target:
 *     production / localhost → FULL, 2000 pages (production after a release;
 *                              a local `next start`, which costs nothing)
 *     anything else          → SAMPLE, 40 pages, breadth-first from /, one
 *                              page per pathname (query-string variants of a
 *                              route are not re-rendered)
 *   FULL needs a positive signal: IS_PRODUCTION=true, or a production / local
 *   host. IS_PRODUCTION=false, the staging host and any host we don't know all
 *   sample, so a missed signal costs coverage, never CPU. --max-pages=N
 *   overrides both. The run prints its mode, budget, pages fetched and HTTP
 *   requests made, so the cost of a run is on its own log. --self-test crawls a
 *   local 91-page fixture server in both modes, so the crawl loop itself — not
 *   only the budget function — is under test.
 *
 * EXIT CODES
 *   0 — no broken internal links
 *   1 — at least one broken link, or the base URL was unreachable
 *
 * WHY IT HONOURS robots.txt
 *   The disallowed paths are authenticated or noindex surfaces (/admin/,
 *   /settings, /producer/dashboard/). Crawling them anonymously yields
 *   redirects and guarded 404s that are correct behaviour, and reporting those
 *   as "broken" is exactly the false red that makes a checker get ignored.
 *   Longest-match wins, same as Google/Bing — so the `Allow: /register/producer`
 *   that MEH-1955 added must override the shorter `Disallow: /register`, and
 *   the resolver below implements that rather than assuming first-match.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const BASE = (args.find((a) => !a.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Read early: --self-test asserts against this exact file, and a `const` read
// further down would be in its temporal dead zone by the time the self-test
// block runs.
const robotsText = readFileSync(`${ROOT}frontend/public/robots.txt`, "utf8");

// ------------------------------------------------------------- page budget

const FULL_PAGES = 2000;
const STAGING_SAMPLE_PAGES = 40;
// The host post-deploy-checks.yml crawls on a staging push. --self-test reads
// that workflow and fails if its staging host is not in this set, so renaming
// the host there cannot silently put staging back on the full crawl.
const STAGING_HOSTS = new Set(["staging.mehamakor.online"]);
// Hosts allowed the full crawl without IS_PRODUCTION=true. Everything else
// samples: a missed signal must cost coverage, never another suspension.
const FULL_CRAWL_HOSTS = new Set(["mehamakor.co.il", "www.mehamakor.co.il", "localhost", "127.0.0.1", "[::1]", "::1"]);
const MAX_PAGES_FLAG = /^--max-pages=(\d+)$/;

/**
 * Decide how many pages this run may crawl. Pure: everything it reads is a
 * parameter, so --self-test drives it with fixtures and with the real workflow.
 * Returns { max, mode, reason } or { error }.
 */
function resolvePageBudget({ base, env, argv }) {
  const flag = argv.find((a) => a.startsWith("--max-pages"));
  if (flag) {
    const m = flag.match(MAX_PAGES_FLAG);
    const n = m ? Number(m[1]) : NaN;
    if (!m || n < 1) {
      return { error: `--max-pages needs a positive integer, written --max-pages=40 (got "${flag}")` };
    }
    return { max: n, mode: "flag", reason: `--max-pages=${n}` };
  }
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    host = "";
  }
  const sample = (why) => ({ max: STAGING_SAMPLE_PAGES, mode: "sample", reason: `${why} (MEH-2864)` });
  if (env.IS_PRODUCTION === "false") return sample("IS_PRODUCTION=false");
  if (STAGING_HOSTS.has(host)) return sample(`staging host ${host}`);
  if (env.IS_PRODUCTION === "true") return { max: FULL_PAGES, mode: "full", reason: "IS_PRODUCTION=true" };
  if (FULL_CRAWL_HOSTS.has(host)) return { max: FULL_PAGES, mode: "full", reason: `production/local host ${host}` };
  return sample(`unknown host ${host || "(unparseable)"}`);
}

// Declared here rather than beside the extractors: --self-test exercises the
// extractors, and a `const` regex declared below that block is in its temporal
// dead zone when it runs (measured — the first version threw exactly that).
// `matchAll` clones the regex internally, so sharing these /g literals across
// calls carries no `lastIndex` state.
const HREF_RE = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
const ID_RE = /\bid\s*=\s*["']([^"']+)["']/gi;
const NAME_RE = /<a\b[^>]*?\bname\s*=\s*["']([^"']+)["']/gi;

// ---------------------------------------------------------------- robots.txt

/**
 * Parse the `User-agent: *` group out of robots.txt into rule objects.
 * Only that group matters: this crawler is not GPTBot, and the bot-specific
 * blocks below it are full-site disallows that would empty the crawl.
 */
function parseRobots(text) {
  const rules = [];
  // CONSECUTIVE `User-agent:` lines form ONE group that shares the directives
  // below them — per Google's grouping rules, `User-agent: *` followed by
  // `User-agent: Googlebot` followed by `Disallow: /private/` disallows that
  // path for BOTH. The first version tracked a single boolean set by the *last*
  // agent line, so that shape returned zero rules and every path read as
  // allowed. Demonstrated by the reviewer, fixed under MEH-1970; it does not
  // fire on this repo's robots.txt, which never stacks agent lines.
  let groupAgents = [];
  let starGroup = false;
  let readingAgents = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      // A directive line closes the previous group; an agent line right after
      // another agent line extends it.
      if (!readingAgents) groupAgents = [];
      groupAgents.push(value);
      starGroup = groupAgents.includes("*");
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    if (!starGroup) continue;
    if (key === "allow" || key === "disallow") {
      if (value) rules.push({ type: key, path: value });
    }
  }
  return rules;
}

/**
 * Longest-match-wins resolution, with Allow beating Disallow at equal length —
 * the documented Google/Bing precedence. A first-match implementation would
 * report /register/producer as excluded and silently drop a landing page from
 * the crawl, which is the MEH-1955 bug wearing a different hat.
 */
function isAllowed(pathname, rules) {
  let best = null;
  for (const rule of rules) {
    if (!matchesRobotsPath(pathname, rule.path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
    else if (rule.path.length === best.path.length && rule.type === "allow") best = rule;
  }
  return !best || best.type === "allow";
}

/**
 * robots paths are not plain prefixes: `*` is a wildcard and a trailing `$`
 * anchors the end. A `startsWith` implementation treats both as literal
 * characters, which makes a rule like `Disallow: /*.json$` **dead** — the
 * literal string `/*.json$` never prefixes a real pathname, so the directive
 * silently does nothing. (Review finding, MEH-1970. No such pattern is in this
 * repo's robots.txt today; the point is that adding one would not work.)
 */
function matchesRobotsPath(pathname, rulePath) {
  if (!rulePath.includes("*") && !rulePath.endsWith("$")) {
    return pathname.startsWith(rulePath);
  }
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(pathname);
}

// ------------------------------------------------------------------ self-test

function workflowHostCases() {
  const yml = readFileSync(`${ROOT}.github/workflows/post-deploy-checks.yml`, "utf8");
  const line = yml.split("\n").find((l) => /^\s*BASE_URL:/.test(l)) || "";
  const hosts = [...line.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
  const cases = [
    { name: `REAL post-deploy-checks.yml: BASE_URL names 2 hosts (found ${hosts.length})`, got: () => hosts.length, want: 2 },
  ];
  for (const host of hosts) {
    const prod = host === "mehamakor.co.il";
    cases.push({
      name: `REAL post-deploy-checks.yml: ${host} → ${prod ? "full" : "sample"}`,
      got: () => resolvePageBudget({ base: `https://${host}`, env: {}, argv: [] }).mode,
      want: prod ? "full" : "sample",
    });
  }
  return cases;
}

/**
 * End-to-end budget check (MEH-2864 review): the cases above test the pure
 * resolver, which stays green even if the crawl loop ignored its answer. This
 * crawls a real local server — 1 root, 30 query variants of /q, a 60-page chain
 * under /p/ and five unparseable hrefs — once as a staging run and once as a
 * full run, through a child process with the real CLI, and returns the two
 * JSON reports.
 */
async function crawlFixtureBothModes() {
  const CHAIN = 60;
  const page = (links) => `<!doctype html><html><body>${links.map((h) => `<a href="${h}">x</a>`).join("")}</body></html>`;
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://fixture");
    let body = null;
    if (u.pathname === "/") {
      const variants = Array.from({ length: 30 }, (_, i) => `/q?v=${i + 1}`);
      body = page([...variants, "/p/1", "http://", "http://", "http://", "http://", "http://"]);
    } else if (u.pathname === "/q") {
      body = page([]);
    } else {
      const m = u.pathname.match(/^\/p\/(\d+)$/);
      const n = m ? Number(m[1]) : 0;
      if (n >= 1 && n <= CHAIN) body = page(n < CHAIN ? [`/p/${n + 1}`] : []);
    }
    res.writeHead(body === null ? 404 : 200, { "content-type": "text/html" });
    res.end(body ?? "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const run = promisify(execFile);
  const self = fileURLToPath(import.meta.url);
  const envWith = (extra) => {
    const env = { ...process.env, ...extra };
    if (!("IS_PRODUCTION" in extra)) delete env.IS_PRODUCTION;
    return env;
  };
  try {
    const go = async (extra) => {
      const { stdout } = await run(process.execPath, [self, base, "--json"], { env: envWith(extra) }).catch((e) => e);
      return JSON.parse(stdout);
    };
    return { sample: await go({ IS_PRODUCTION: "false" }), full: await go({}) };
  } finally {
    server.close();
  }
}

/**
 * --self-test: prove the robots resolver discriminates BEFORE any crawl output
 * is trusted (MEH-1619 — a guard never observed failing is a green light of
 * unknown wiring; repo precedent: `.claude/scripts/audit-skills.sh --self-test`).
 *
 * `isAllowed` is a classifier, and the specific way it can be silently wrong is
 * first-match-wins: that returns `false` for /register/producer, the crawler
 * skips the landing page, and the report says "0 broken" because it never
 * looked. Nothing in the output distinguishes that from a healthy crawl.
 *
 * Case 6 is anchored to the REAL `frontend/public/robots.txt`, not a synthetic
 * shape (MEH-1909: an ast probe passed four invented cases and returned None on
 * every real file in the repo). A fixture-only suite proves the resolver works
 * on rules I wrote; only the repo's own file proves it works on the rules that
 * exist.
 */
if (args.includes("--self-test")) {
  const fixture = parseRobots(
    ["User-agent: *", "Allow: /", "Allow: /register/producer", "Disallow: /register", "Disallow: /admin/", "", "User-agent: GPTBot", "Disallow: /"].join("\n")
  );
  const real = parseRobots(robotsText);
  const cases = [
    { name: "plain path allowed", got: () => isAllowed("/producers", fixture), want: true },
    { name: "disallowed prefix blocked", got: () => isAllowed("/admin/queue", fixture), want: false },
    { name: "shorter Disallow blocks /register", got: () => isAllowed("/register", fixture), want: false },
    // THE discriminating case: first-match-wins returns false here.
    { name: "longer Allow beats shorter Disallow", got: () => isAllowed("/register/producer", fixture), want: true },
    // A named agent's group must not leak into the `*` group, or the GPTBot
    // full-site Disallow empties every crawl and still reports "0 broken".
    { name: "named-agent group does not leak", got: () => isAllowed("/", fixture), want: true },
    // Anchored to the committed file, not to rules invented here.
    { name: "REAL robots.txt: /register/producer allowed", got: () => isAllowed("/register/producer", real), want: true },
    { name: "REAL robots.txt: /settings blocked", got: () => isAllowed("/settings", real), want: false },
    { name: "href extraction finds a hyphenated attr", got: () => extractHrefs('<a data-x="1" href="/a">x</a>').join(), want: "/a" },
    { name: "anchor ids collected", got: () => extractAnchors('<div id="contact"></div>').has("contact"), want: true },
    // MEH-1970 review findings — each fails on the pre-fix implementation.
    // Consecutive User-agent lines share the group's directives (Google's
    // grouping rules). The old single-boolean parser returned ZERO rules here,
    // so the Disallow vanished and the path read as allowed.
    {
      name: "stacked User-agent lines share directives",
      got: () =>
        isAllowed(
          "/private/x",
          parseRobots("User-agent: *\nUser-agent: Googlebot\nDisallow: /private/\n")
        ),
      want: false,
    },
    // ...and the group must still CLOSE on a directive: an agent line appearing
    // after directives starts a new group rather than extending the old one.
    {
      name: "a directive closes the group",
      got: () =>
        isAllowed(
          "/x",
          parseRobots("User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /x\n")
        ),
      want: true,
    },
    // `*` and `$` are robots pattern syntax, not literal characters. Under
    // startsWith the rule below is dead and this returns true.
    {
      name: "wildcard + $ anchor honoured",
      got: () => isAllowed("/data/export.json", parseRobots("User-agent: *\nDisallow: /*.json$\n")),
      want: false,
    },
    // ...without over-reaching: the $ anchor must not match a longer path.
    {
      name: "$ anchor does not over-match",
      got: () => isAllowed("/data/export.json.bak", parseRobots("User-agent: *\nDisallow: /*.json$\n")),
      want: true,
    },
    // MEH-2864 — page budget. Each case fails on the pre-budget crawler, which
    // had one fixed 2000-page cap for every target.
    {
      name: "budget: staging push (IS_PRODUCTION=false) samples 40",
      got: () => resolvePageBudget({ base: "https://example.test", env: { IS_PRODUCTION: "false" }, argv: [] }).max,
      want: 40,
    },
    {
      name: "budget: staging host samples 40 without the env var",
      got: () => resolvePageBudget({ base: "https://staging.mehamakor.online", env: {}, argv: [] }).mode,
      want: "sample",
    },
    {
      name: "budget: production stays a full crawl",
      got: () => resolvePageBudget({ base: "https://mehamakor.co.il", env: { IS_PRODUCTION: "true" }, argv: [] }).max,
      want: 2000,
    },
    {
      name: "budget: local next start stays a full crawl",
      got: () => resolvePageBudget({ base: "http://localhost:3000", env: {}, argv: [] }).mode,
      want: "full",
    },
    {
      name: "budget: --max-pages=5 overrides a staging target",
      got: () => resolvePageBudget({ base: "https://staging.mehamakor.online", env: { IS_PRODUCTION: "false" }, argv: ["--max-pages=5"] }).max,
      want: 5,
    },
    {
      name: "budget: an unknown host samples (FULL needs a positive signal)",
      got: () => resolvePageBudget({ base: "https://food-mamkor-abc123.vercel.app", env: {}, argv: [] }).mode,
      want: "sample",
    },
    {
      name: "budget: --max-pagesX=3 is an error, not --max-pages=3",
      got: () => Boolean(resolvePageBudget({ base: "http://localhost:3000", env: {}, argv: ["--max-pagesX=3"] }).error),
      want: true,
    },
    {
      name: "budget: --max-pages without a number is an error, not a silent default",
      got: () => Boolean(resolvePageBudget({ base: "http://localhost:3000", env: {}, argv: ["--max-pages"] }).error),
      want: true,
    },
    // Anchored to the committed workflow, not to a host typed here: every
    // non-production host post-deploy-checks.yml can crawl must sample, and
    // the production host must not.
    ...workflowHostCases(),
  ];
  let bad = 0;
  for (const c of cases) {
    const got = c.got();
    const ok = got === c.want;
    console.log(`${ok ? "PASS" : "FAIL"}  self-test: ${c.name}${ok ? "" : ` (got ${got}, want ${c.want})`}`);
    if (!ok) bad += 1;
  }
  // A parse that silently yields nothing would make every path "allowed" and
  // every self-test above pass for the wrong reason — count the rules too.
  const parsedOk = real.length > 0;
  console.log(`${parsedOk ? "PASS" : "FAIL"}  self-test: real robots.txt parsed ${real.length} rule(s) for User-agent: *`);
  if (!parsedOk) bad += 1;

  // End to end: the crawl loop must obey the budget, not only the resolver.
  let e2e = null;
  try {
    e2e = await crawlFixtureBothModes();
  } catch (err) {
    console.log(`FAIL  self-test: e2e: fixture crawl did not run (${err.message})`);
    bad += 1;
  }
  if (e2e) {
    const qPages = (r) => (r.pages || []).filter((p) => p.startsWith("/q")).length;
    const e2eCases = [
      { name: "e2e: staging run reports mode sample", got: e2e.sample.mode, want: "sample" },
      { name: "e2e: staging run fetches exactly the 40-page budget of a 91-page site", got: e2e.sample.crawled, want: 40 },
      { name: "e2e: staging run fetches one page per pathname (/q once, not 30 times)", got: qPages(e2e.sample), want: 1 },
      { name: "e2e: unparseable hrefs are not counted as pages", got: e2e.sample.crawled === (e2e.sample.pages || []).length, want: true },
      // The control: the same site under the full budget crawls past 40, so a
      // sample run stopping at 40 is the budget, not the site running out.
      { name: "e2e: full run on the same site fetches all 91 pages", got: e2e.full.crawled, want: 91 },
    ];
    for (const c of e2eCases) {
      const ok = c.got === c.want;
      console.log(`${ok ? "PASS" : "FAIL"}  self-test: ${c.name}${ok ? "" : ` (got ${c.got}, want ${c.want})`}`);
      if (!ok) bad += 1;
    }
  }
  process.exit(bad === 0 ? 0 : 1);
}

// ------------------------------------------------------------------- crawling

function extractHrefs(html) {
  const out = [];
  for (const m of html.matchAll(HREF_RE)) out.push(m[1]);
  return out;
}

function extractAnchors(html) {
  const ids = new Set();
  for (const m of html.matchAll(ID_RE)) ids.add(m[1]);
  for (const m of html.matchAll(NAME_RE)) ids.add(m[1]);
  return ids;
}

/**
 * Fetch WITHOUT following redirects, so a chain is observable rather than
 * collapsed into its destination. `fetch`'s default `redirect: "follow"` hides
 * exactly the thing this tool is asked to report.
 */
// MEH-2749: the post-deploy workflow crawls staging, which sits behind Vercel
// Deployment Protection. The bypass secret comes from the env only, and is
// attached per hop ONLY when that hop's origin is the crawl's own origin: a
// same-site URL can 3xx to another host (vercel.com/sso-api when protection
// rejects the header, or any external redirect), and head() follows hops by
// hand, so a static header map would hand the secret to that host.
// Do NOT add `x-vercel-set-bypass-cookie`: it turns redirects into cookie
// redirects, which this tool would then report as chains (measured 28/10).
const BYPASS = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "").trim();
// Resolved before BASE is parsed: `--max-pages 5 <url>` would otherwise make
// "5" the base URL and die in `new URL` with a stack trace instead of a message.
const budget = resolvePageBudget({ base: BASE, env: process.env, argv: args });
if (budget.error) {
  console.error(`link-check: ${budget.error}`);
  process.exit(1);
}
const BASE_ORIGIN = new URL(BASE).origin;
function requestHeaders(url) {
  const sameOrigin = new URL(url).origin === BASE_ORIGIN;
  return {
    "accept-language": "he-IL",
    ...(BYPASS && sameOrigin ? { "x-vercel-protection-bypass": BYPASS } : {}),
  };
}

let requests = 0; // every fetch, redirect hops and preflight included (MEH-2864)
async function head(url) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop < 6; hop += 1) {
    let res;
    try {
      requests += 1;
      res = await fetch(current, { redirect: "manual", headers: requestHeaders(current) });
    } catch (err) {
      return { status: 0, error: err.message, chain, final: current };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { status: res.status, chain, final: current, body: "" };
      chain.push({ from: current, status: res.status, to: loc });
      current = new URL(loc, current).href;
      continue;
    }
    const type = res.headers.get("content-type") || "";
    const body = type.includes("text/html") ? await res.text() : "";
    return { status: res.status, chain, final: current, body };
  }
  return { status: -1, error: "redirect loop (>6 hops)", chain, final: current };
}

// --------------------------------------------------------------------- report

const rules = parseRobots(robotsText);

/**
 * PREFLIGHT — establish that a 404 is even observable before believing any
 * "0 broken" this run produces.
 *
 * `.claude/rules/testing.md`: a green with two possible causes is not a signal.
 * "0 broken" has exactly two causes here — no broken links, or a target that
 * answers 200 for everything. The second is not hypothetical on this codebase:
 * `frontend/middleware.js` existence-checks single-segment (slug-shaped) paths
 * against the backend and **fails open** on an unreachable backend (deliberately
 * — MEH-1899 chose that over hard-404ing a live page on a transient blip). With
 * no backend running, every single-segment miss renders the not-found UI at
 * HTTP **200**.
 *
 * Measured 09/08 against a local `next start` with no backend:
 *
 *   /this-route-does-not-exist   200   ← single segment, fail-open path
 *   /UPPER_CASE                  200
 *   /a                           200
 *   /foo/bar/baz                 404   ← multi-segment, correct
 *   /about/nope                  404
 *   /producers/nope              404
 *
 * THE THIRD STATE, and the one this file previously got wrong (MEH-1970).
 * An earlier version of this comment said "multi-segment breaks ARE detected",
 * and the printed warning and docs/TESTING.md said the same. **That is false for
 * the breakage class most likely to occur here.** Every dynamic detail route
 * deliberately renders 200 for a missing entity rather than calling
 * `notFound()` — `producer/[id]/page.js:14` states it outright ("`notFound()`
 * is forbidden here (the MEH-1754 indexing-risk class)"), and `events/[id]`,
 * `experiences/[id]` and `group-buys/[id]` carry the same comment. Measured:
 *
 *   /producer/999999999          200
 *   /events/999999999            200
 *   /experiences/999999999       200
 *   /group-buys/999999999        200
 *
 * with the backend up or down, so no status-code crawler can ever flag a link
 * to a deleted business, a past event or a closed group-buy. The old preflight
 * could not see this: its multi-segment probe has **no matching route at all**,
 * so it 404s through Next's ordinary router miss — a different mechanism from a
 * *matched* dynamic route whose own component chooses to render 200. Proving
 * "unmatched paths 404" says nothing about "matched, entity missing".
 *
 * So there are three states, and all three are probed and declared:
 *   multi   — unmatched path. Must 404 or the run aborts: nothing is evidence.
 *   single  — /<slug>. 200 under a down backend (fail-open, MEH-1899/1521).
 *   entity  — matched dynamic route, missing id. 200 BY DESIGN, always.
 *
 * The blind spots are declared, not denied. Related: MEH-1521, MEH-1754.
 */
const probes = {
  single: "/mm-link-check-probe-does-not-exist",
  multi: "/mm-link-check-probe/does-not-exist",
  // A real, matched dynamic route with an id that cannot exist. Not a made-up
  // path: the point is to exercise the route's OWN not-found rendering.
  entity: "/producer/999999999",
};
const preflight = {};
for (const [kind, path] of Object.entries(probes)) {
  const r = await head(`${BASE}${path}`);
  preflight[kind] = r.status;
}
if (preflight.multi !== 404) {
  console.error(
    `link-check: PREFLIGHT FAILED — a known-nonexistent multi-segment path returned ` +
      `${preflight.multi}, not 404. This target cannot report a broken link at all; ` +
      `nothing below is evidence. Is the server running at ${BASE}?`
  );
  process.exit(1);
}
const slugBlind = preflight.single !== 404;
const entityBlind = preflight.entity !== 404;

const seen = new Map(); // url -> result
const queue = ["/"];
const queued = new Set(["/"]);
/** href -> Set of pages that link to it. A break is only actionable with its referrers. */
const referrers = new Map();
const skippedByRobots = new Set();
const external = new Set();
const anchorTargets = []; // {from, to, hash}

const noteRef = (target, from) => {
  if (!referrers.has(target)) referrers.set(target, new Set());
  referrers.get(target).add(from);
};

// Defence in depth: nothing in the app can currently produce an unbounded
// query-string space (pagination is clamped to a server-computed totalPages,
// category ids are a fixed set), but a crawler with no ceiling turns a future
// pagination bug into a hang with no message. Truncation is REPORTED, never
// silent — an unannounced cap reads as "covered everything".
const MAX_PAGES = budget.max;
// Pages actually fetched — the budget and the "crawled" line count these, not
// `seen`, which also holds unparseable hrefs (MEH-2864 review: 60 bad hrefs on
// one page read as 62 "pages" and spent the whole sample on one request).
const fetchedPages = [];
// Sample mode re-renders a route once, not once per query string (the home
// page links /producers?category=<id> per category card).
const queuedPathnames = new Set(["/"]);
let truncated = 0;
while (queue.length) {
  if (fetchedPages.length >= MAX_PAGES) {
    truncated = queue.length;
    break;
  }
  const path = queue.shift();
  const result = await head(`${BASE}${path}`);
  fetchedPages.push(path);
  seen.set(path, result);
  if (!result.body) continue;

  const anchorIds = extractAnchors(result.body);
  for (const raw of extractHrefs(result.body)) {
    const href = raw.trim();
    if (!href || href.startsWith("#")) {
      // Same-page anchor — resolvable right here, no request needed.
      if (href.length > 1 && !anchorIds.has(href.slice(1))) {
        anchorTargets.push({ from: path, to: path, hash: href.slice(1), ok: false });
      }
      continue;
    }
    if (/^(mailto:|tel:|javascript:|data:|whatsapp:)/i.test(href)) continue;

    let url;
    try {
      url = new URL(href, `${BASE}${path}`);
    } catch {
      noteRef(href, path);
      seen.set(href, { status: -2, error: "unparseable href", chain: [], final: href });
      continue;
    }
    if (url.origin !== BASE) {
      external.add(url.origin);
      continue;
    }
    const next = url.pathname + url.search;
    noteRef(next, path);
    if (url.hash) anchorTargets.push({ from: path, to: url.pathname, hash: url.hash.slice(1) });
    if (!isAllowed(url.pathname, rules)) {
      skippedByRobots.add(url.pathname);
      continue;
    }
    if (budget.mode === "sample" && queuedPathnames.has(url.pathname)) continue;
    if (!queued.has(next)) {
      queued.add(next);
      queuedPathnames.add(url.pathname);
      queue.push(next);
    }
  }
}

// Cross-page anchors: only checkable against a page we actually fetched.
// Index pathname -> first crawled result WITH a body, built once. The first
// version scanned the whole map per anchor (O(n·m) at a 2000-page ceiling);
// cheap to remove.
const pathIndex = new Map();
for (const [key, value] of seen) {
  if (!value.body) continue;
  const bare = key.split("?")[0];
  if (!pathIndex.has(bare)) pathIndex.set(bare, value);
}

const deadAnchors = [];
for (const a of anchorTargets) {
  if (a.ok === false) {
    deadAnchors.push(a);
    continue;
  }
  // Look up by pathname first, then by ANY crawled key whose pathname matches.
  // The queue key is `pathname + search` while `a.to` is the pathname alone, so
  // a link like /about?topic=business#contact was validated against a DIFFERENT
  // map entry than the one actually fetched — or, if the bare pathname was never
  // linked anywhere, silently skipped as "not crawled" while it had been
  // crawled under the query-string key (review finding, MEH-1970).
  const target = seen.get(a.to)?.body ? seen.get(a.to) : pathIndex.get(a.to);
  if (!target || !target.body) continue; // genuinely not crawled — not a claim
  if (!extractAnchors(target.body).has(a.hash)) deadAnchors.push(a);
}

const broken = [...seen.entries()].filter(([, r]) => r.status === 0 || r.status < 0 || r.status >= 400);
const redirects = [...seen.entries()].filter(([, r]) => r.chain.length > 0);
const chains = redirects.filter(([, r]) => r.chain.length > 1);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        base: BASE,
        preflight,
        slugBlind,
        entityBlind,
        truncated,
        mode: budget.mode,
        budget: MAX_PAGES,
        budgetReason: budget.reason,
        crawled: fetchedPages.length,
        pages: fetchedPages,
        requests,
        broken: broken.map(([u, r]) => ({ url: u, status: r.status, error: r.error, from: [...(referrers.get(u) || [])] })),
        redirects: redirects.map(([u, r]) => ({ url: u, hops: r.chain })),
        deadAnchors,
        skippedByRobots: [...skippedByRobots],
        external: [...external],
      },
      null,
      2
    )
  );
} else {
  console.log(`link-check · base=${BASE}`);
  console.log(`mode:               ${budget.mode} · budget ${MAX_PAGES} pages · ${budget.reason}`);
  console.log(
    `preflight:          unmatched 404 ✓ · single-segment ${preflight.single} · ` +
      `dynamic-entity ${preflight.entity}`
  );
  if (slugBlind || entityBlind) {
    console.log(`\nWARNING — "0 broken" below is SCOPED. These classes are not validated:`);
  }
  if (slugBlind) {
    console.log(
      `\n  · single-segment /<slug> links — probe returned ${preflight.single}, not 404.\n` +
        `    Cause: middleware.js fails open on an unreachable backend (MEH-1899/1521).\n` +
        `    Closes by running against a target with a live backend.`
    );
  }
  if (entityBlind) {
    console.log(
      `\n  · dynamic detail routes with a missing entity — /producer/<id>,\n` +
        `    /events/<id>, /experiences/<id>, /group-buys/<id>. Probe returned\n` +
        `    ${preflight.entity}, not 404. Cause: those pages render 200 BY DESIGN\n` +
        `    rather than calling notFound() (MEH-1754 indexing-risk class), so no\n` +
        `    status-code crawler can flag a link to a deleted business or a past\n` +
        `    event. This does NOT close with a live backend — it is the routes'\n` +
        `    intended behaviour. Checking it needs a content probe, not a status.`
    );
  }
  if (slugBlind || entityBlind) console.log("");
  console.log(`crawled:            ${fetchedPages.length} pages fetched`);
  console.log(`HTTP requests:      ${requests} (preflight and redirect hops included)`);
  if (truncated && budget.mode === "sample") {
    console.log(
      `SAMPLE:             stopped at the ${MAX_PAGES}-page staging budget with ${truncated} URLs ` +
        `still queued — by design (MEH-2864). A full crawl runs on production and locally.`
    );
  } else if (truncated) {
    console.log(
      `TRUNCATED:          hit the ${MAX_PAGES}-page cap with ${truncated} URLs still queued — ` +
        `results below are PARTIAL.`
    );
  }
  console.log(`skipped (robots):   ${skippedByRobots.size}`);
  console.log(`external origins:   ${external.size}`);
  console.log(`redirects:          ${redirects.length} (${chains.length} multi-hop)`);
  console.log(`dead anchors:       ${deadAnchors.length}`);
  console.log(`broken:             ${broken.length}`);
  if (redirects.length) {
    console.log("\n--- redirects ---");
    for (const [u, r] of redirects) {
      console.log(`  ${u}  ${r.chain.map((h) => `${h.status}→${h.to}`).join("  ")}`);
    }
  }
  if (deadAnchors.length) {
    console.log("\n--- dead anchors ---");
    for (const a of deadAnchors) console.log(`  ${a.from}  →  ${a.to}#${a.hash}`);
  }
  if (broken.length) {
    console.log("\n--- BROKEN ---");
    for (const [u, r] of broken) {
      const from = [...(referrers.get(u) || [])].join(", ") || "(entry point)";
      console.log(`  ${u}  status=${r.status}${r.error ? ` (${r.error})` : ""}\n      linked from: ${from}`);
    }
  }
}

process.exit(broken.length ? 1 : 0);
