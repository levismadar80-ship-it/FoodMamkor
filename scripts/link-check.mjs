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
 * History:  MEH-1963 (creation).
 *
 * Usage:  node scripts/link-check.mjs [baseURL] [--json]
 *         default baseURL http://localhost:3000 (run `next start` first)
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

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const BASE = (args.find((a) => !a.startsWith("--")) || "http://localhost:3000").replace(/\/$/, "");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Read early: --self-test asserts against this exact file, and a `const` read
// further down would be in its temporal dead zone by the time the self-test
// block runs.
const robotsText = readFileSync(`${ROOT}frontend/public/robots.txt`, "utf8");

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
  let inStar = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      // A new group starts here. We are inside the relevant one only while the
      // agent is `*` — any named agent ends our group.
      inStar = value === "*";
      continue;
    }
    if (!inStar) continue;
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
    if (!pathname.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
    else if (rule.path.length === best.path.length && rule.type === "allow") best = rule;
  }
  return !best || best.type === "allow";
}

// ------------------------------------------------------------------ self-test

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
async function head(url) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop < 6; hop += 1) {
    let res;
    try {
      res = await fetch(current, { redirect: "manual", headers: { "accept-language": "he-IL" } });
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
 * So the blind spot is precise and partial: multi-segment breaks ARE detected,
 * single-segment ones are not. The run says so out loud instead of reporting a
 * confident green over a hole. Related: MEH-1521 (the fail-open itself).
 */
const probes = {
  single: "/mm-link-check-probe-does-not-exist",
  multi: "/mm-link-check-probe/does-not-exist",
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

while (queue.length) {
  const path = queue.shift();
  const result = await head(`${BASE}${path}`);
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
    if (!queued.has(next)) {
      queued.add(next);
      queue.push(next);
    }
  }
}

// Cross-page anchors: only checkable against a page we actually fetched.
const deadAnchors = [];
for (const a of anchorTargets) {
  if (a.ok === false) {
    deadAnchors.push(a);
    continue;
  }
  const target = seen.get(a.to);
  if (!target || !target.body) continue; // not crawled (robots) — not a claim
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
        crawled: seen.size,
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
  console.log(`preflight:          multi-segment 404 ✓ · single-segment ${preflight.single}`);
  if (slugBlind) {
    console.log(
      `\nWARNING — single-segment links are NOT validated in this run.\n` +
        `  A known-nonexistent single-segment path returned ${preflight.single}, not 404.\n` +
        `  Cause: middleware.js fails open on an unreachable backend (MEH-1899/1521),\n` +
        `  so /<slug> misses render the not-found UI at 200. Multi-segment paths are\n` +
        `  unaffected and ARE checked. Run against a target with a live backend to\n` +
        `  close the gap. Treat "0 broken" below as scoped, not absolute.\n`
    );
  }
  console.log(`crawled:            ${seen.size} internal URLs`);
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
