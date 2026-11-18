/**
 * MEH-3265 — every public page is reachable: in the sitemap AND linked from
 * another page. A new page that is neither is an "orphan" — the term Screaming
 * Frog and Ahrefs use for a URL in the sitemap that no internal link points at.
 * Industry practice: a sitemap is a discovery hint, not a substitute for an
 * internal link, and a sitemap URL that is noindex or robots-blocked is a
 * Search Console error (MEH-803 / MEH-1955).
 *
 * Fails when:
 *   1. a page under app/ (outside admin / dev / producer/dashboard — the last
 *      is DashboardPlacementGuard's) has no entry in ROUTES below. Adding a
 *      page means deciding what it is: indexed, hub, family, noindex, redirect;
 *   2. an "indexed" page is missing from lib/sitemap-static.js, a "hub" from
 *      lib/listing-supply.js HUBS, or a "family" from app/sitemap.js;
 *   3. an indexed page / hub / family has no literal link to it in a source
 *      file that a visitor can reach (not its own directory, not admin/dev/
 *      dashboard, not a noindex page's own files) — unless an EXCEPTIONS entry
 *      with a card says why;
 *   4. a "noindex" page has no `index: false` in its own files, its direct
 *      relative imports, or an ancestor layout — or is listed in the sitemap;
 *   5. a sitemap path does not resolve to a page, or robots.txt blocks it;
 *   6. /terms, /privacy or /accessibility leave the footer (legal pages);
 *   7. an EXCEPTIONS entry is stale (its page is gone, or it no longer needs it).
 *
 * Known limits (it is a static check, not a crawl — MEH-3111 item 5 holds the
 * periodic real crawl):
 *   - a literal link behind a flag or supply gate counts even if it does not
 *     render in production today;
 *   - a link in components/ or lib/ counts without proving something renders
 *     that file;
 *   - noindex evidence is a `robots: { index: false` literal in the page, a
 *     direct relative import or a layout; a page that is noindex on one
 *     branch only (not-found metadata) is not told apart — classify it by
 *     what it is on its normal path;
 *   - a link built only at runtime (no literal path, no registered needle) is
 *     invisible — register the family with a `linkedFrom` needle.
 *
 * The checks are pure functions over a { pages, files } model; each failure
 * is shown on a synthetic model first, then the same functions run on the repo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SITEMAP_STATIC_PAGES } from "@/lib/sitemap-static";
import { HUBS } from "@/lib/listing-supply";

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "app");
const LOCALE = path.join(APP, "[locale]");
const PAGE_RE = /^page\.(js|jsx|ts|tsx|mdx)$/;
const SOURCE_RE = /\.(js|jsx|ts|tsx|mdx)$/;
const SKIPPED_TREES = ["/admin", "/dev", "/producer/dashboard"];
const LEGAL_FOOTER = ["/terms", "/privacy", "/accessibility"];

/**
 * Every page, by route. `kind`:
 *   indexed  — static, in lib/sitemap-static.js, needs an inbound link
 *              (a literal path anywhere reachable, or `linkedFrom` when the
 *              link is built from a list)
 *   hub      — static, in HUBS (listed only with supply), needs an inbound link
 *   family   — dynamic; `sitemap` is a needle app/sitemap.js must contain,
 *              `linkedFrom` = [repo-relative file, ...needles] for the inbound link
 *   noindex  — sets robots index:false; never in the sitemap
 *   redirect — only redirects; never in the sitemap
 */
const ROUTES = {
  "": { kind: "home" },
  "/about": { kind: "indexed" },
  "/about/badges": { kind: "indexed" },
  "/about/for-businesses": { kind: "indexed" },
  "/about/for-businesses/guides": { kind: "indexed" },
  "/about/for-businesses/guides/business-story": { kind: "indexed", linkedFrom: ["app/[locale]/about/for-businesses/guides/page.js", "`/about/for-businesses/guides/${g.slug}`", 'slug: "business-story"'] },
  "/about/for-businesses/guides/customer-messages": { kind: "indexed", linkedFrom: ["app/[locale]/about/for-businesses/guides/page.js", "`/about/for-businesses/guides/${g.slug}`", 'slug: "customer-messages"'] },
  "/about/for-businesses/guides/product-photography": { kind: "indexed", linkedFrom: ["app/[locale]/about/for-businesses/guides/page.js", "`/about/for-businesses/guides/${g.slug}`", 'slug: "product-photography"'] },
  "/about/process": { kind: "indexed" },
  "/about/why-local": { kind: "indexed" },
  "/accessibility": { kind: "indexed" },
  "/join": { kind: "indexed" },
  // Linked through the PRICING_PATH constant (lib/pricing.js), not a literal.
  "/join/pricing": { kind: "indexed", linkedFrom: ["app/[locale]/about/for-businesses/page.js", "href={PRICING_PATH}"] },
  "/map": { kind: "indexed" },
  "/privacy": { kind: "indexed" },
  "/register/producer": { kind: "indexed" },
  "/terms": { kind: "indexed" },
  // /producers is emitted by the paginated index walk in app/sitemap.js.
  "/producers": { kind: "family", sitemap: '"/producers"', linkedFrom: ["components/Footer.jsx", '"/producers"'] },
  "/events": { kind: "hub" },
  "/experiences": { kind: "hub" },
  "/group-buys": { kind: "hub" },
  "/rescue": { kind: "hub" },
  "/[slug]": { kind: "family", sitemap: "`/${p.slug}`", linkedFrom: ["components/ProducerCard.jsx", "`/${producer.slug}`"] },
  "/[slug]/recipes/[recipe_id]": { kind: "family", sitemap: "/recipes/${recipe.id}", linkedFrom: ["components/public/RecipeCard.jsx", "/recipes/${recipe.id}"] },
  "/events/[id]": { kind: "family", sitemap: "`/events/${e.id}`", linkedFrom: ["lib/event-entry.js", "`/events/${row.id}`"] },
  "/experiences/[id]": { kind: "family", sitemap: "`/experiences/${x.id}`", linkedFrom: ["lib/event-entry.js", "`/experiences/${row.id}`"] },
  "/group-buys/[id]": { kind: "family", sitemap: "`/group-buys/${g.id}`", linkedFrom: ["app/[locale]/group-buys/GroupBuysClient.jsx", "`/group-buys/${gb.id}`"] },
  "/organizers/[slug]": { kind: "family", sitemap: "`/organizers/${o.slug}`", linkedFrom: ["app/[locale]/events/[id]/EventDetailClient.jsx", "`/organizers/${event.owner_slug}`"] },
  "/producers/diet/[dietSlug]": { kind: "family", sitemap: "dietPagePath(", linkedFrom: ["app/[locale]/producers/diet/[dietSlug]/page.js", "dietPagePath("] },
  "/producers/[category]/[region]": { kind: "family", sitemap: "regionPagePath(", linkedFrom: ["app/[locale]/producers/[category]/[region]/page.js", "regionPagePath("] },
  // Legacy id route: ProducerCard links here only for a business with no slug.
  "/producer/[id]": { kind: "family", sitemap: "`/producer/${p.id}`", linkedFrom: ["components/ProducerCard.jsx", "`/producer/${producer.id}`"] },
  "/account-deleted": { kind: "noindex" },
  "/business-gone": { kind: "noindex" },
  "/claim": { kind: "noindex" },
  "/claim/[token]": { kind: "noindex" },
  "/contact": { kind: "noindex" },
  "/draft-preview/[token]": { kind: "noindex" },
  "/delivery-waitlist/host-confirm": { kind: "noindex" },
  "/delivery-waitlist/unsubscribe": { kind: "noindex" },
  "/favorites": { kind: "noindex" },
  "/forgot-password": { kind: "noindex" },
  "/freshness/confirm": { kind: "noindex" },
  "/login": { kind: "noindex" },
  "/messages": { kind: "noindex" },
  "/newsletter/confirm": { kind: "noindex" }, // MEH-3300
  "/newsletter/unsubscribe": { kind: "noindex" },
  "/owner-invite": { kind: "noindex" },
  "/owner-invite/[token]": { kind: "noindex" },
  "/recommend": { kind: "noindex" },
  "/register": { kind: "noindex" },
  "/register/organizer": { kind: "noindex" },
  "/registration/[token]": { kind: "noindex" },
  "/reset-password": { kind: "noindex" },
  "/settings": { kind: "noindex" },
  "/unsubscribe/weekly": { kind: "noindex" },
  "/verify-email": { kind: "noindex" },
  "/p/[slug]": { kind: "redirect" },
};

/**
 * Pages allowed to skip the inbound-link check, each with its card. A stale
 * entry fails (check 7), so this list can only shrink by fixing the page.
 */
const EXCEPTIONS = {
  "/producers/diet/[dietSlug]": {
    card: "MEH-3111",
    reason: "linked only from its own sibling pages; the entry from /producers needs placement research (rule 37)",
  },
  "/producers/[category]/[region]": {
    card: "MEH-3111",
    reason: "linked only from its own sibling pages; the entry from /producers needs placement research (rule 37)",
  },
};

// ---------------------------------------------------------------- pure core

/** Source with comments removed — a path in a comment is not a link. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** "app/[locale]/(grp)/about/page.js" → "/about"; null outside [locale]. */
export function routeOf(relPageFile) {
  const parts = path.dirname(relPageFile).split(path.sep).join("/").split("/");
  if (parts[0] !== "app" || parts[1] !== "[locale]") return null;
  const segs = parts.slice(2).filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith("@"));
  return segs.length ? `/${segs.join("/")}` : "";
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when `source` LINKS to the exact path: `href="/x"`, `href={"/x"}`,
 * `href: "/x"` (registries), `push("/x")` / `replace("/x")`. A bare string
 * (`pathname === "/x"`, a canonical) is not a link. A #hash or ?query may follow.
 */
export function linksTo(source, route) {
  const lead = String.raw`(?:\bhref\s*[=:]\s*\{?\s*|\b(?:push|replace)\(\s*)`;
  const re = new RegExp(`${lead}["'\`]${escapeRe(route)}(?=["'\`#?])`);
  return re.test(stripComments(source));
}

/** Longest-match robots.txt verdict for the `User-agent: *` group. */
export function robotsAllows(robotsTxt, urlPath) {
  const rules = [];
  let agents = [];
  let lastWasAgent = false;
  for (const raw of robotsTxt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      // Consecutive User-agent lines share one group (RFC 9309).
      agents = lastWasAgent ? [...agents, m[2].trim()] : [m[2].trim()];
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (agents.includes("*") && m[2]) rules.push({ allow: key === "allow", pattern: m[2].trim() });
  }
  const target = urlPath || "/";
  let best = null;
  for (const r of rules) {
    const anchored = r.pattern.endsWith("$");
    const body = anchored ? r.pattern.slice(0, -1) : r.pattern;
    const re = new RegExp(`^${body.split("*").map(escapeRe).join(".*")}${anchored ? "$" : ""}`);
    if (re.test(target) && (!best || body.length > best.len || (body.length === best.len && r.allow))) {
      best = { len: body.length, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

/**
 * The checks. `model`:
 *   pages:   { route: { file, dir, noindexEvidence: bool, redirects: bool } }
 *   files:   [{ rel, dir, source }]  — every source file that may carry a link
 *   routes / exceptions: the registries above
 *   sitemapStatic: string[] · hubPaths: string[] · sitemapSource: string
 *   robots: string · footerSource: string
 * Returns a list of human-readable problems; [] = green.
 */
export function findProblems(model, { ignoreExceptions = false } = {}) {
  const { pages, files, routes, exceptions } = model;
  const problems = [];
  const noindexDirs = new Set(
    Object.entries(pages)
      .filter(([r]) => ["noindex", "redirect"].includes(routes[r]?.kind))
      .map(([, p]) => p.dir),
  );
  const reachable = files.filter(
    (f) => !noindexDirs.has(f.dir) && !SKIPPED_TREES.some((t) => f.dir.includes(`[locale]${t}`)),
  );
  const exempt = (r) => !ignoreExceptions && exceptions[r];

  for (const [route, page] of Object.entries(pages)) {
    const entry = routes[route];
    if (!entry) {
      problems.push(`${route || "/"}: new page with no ROUTES entry — decide indexed / hub / family / noindex / redirect`);
      continue;
    }
    const k = entry.kind;
    if (k === "indexed" && !model.sitemapStatic.includes(route)) {
      problems.push(`${route}: indexed but missing from lib/sitemap-static.js`);
    }
    if (k === "hub" && !model.hubPaths.includes(route)) {
      problems.push(`${route}: hub but missing from HUBS in lib/listing-supply.js`);
    }
    if (k === "family" && !model.sitemapSource.includes(entry.sitemap)) {
      problems.push(`${route}: family but app/sitemap.js does not contain ${entry.sitemap}`);
    }
    if ((k === "indexed" || k === "hub") && !entry.linkedFrom && !exempt(route)) {
      const from = reachable.filter((f) => !`${f.dir}/`.startsWith(`${page.dir}/`) && linksTo(f.source, route));
      if (from.length === 0) problems.push(`${route}: orphan — no reachable file links to it`);
    }
    // A link built from a list or a helper has no literal path to grep, so the
    // entry names the file and every needle the link is made of.
    if (entry.linkedFrom && !exempt(route)) {
      const [rel, ...needles] = entry.linkedFrom;
      const f = reachable.find((x) => x.rel === rel);
      const outside = f && !`${f.dir}/`.startsWith(`${page.dir}/`);
      const src = f ? stripComments(f.source) : "";
      const missing = needles.filter((n) => !src.includes(n));
      if (!f || !outside || missing.length) {
        problems.push(`${route}: orphan — no link from outside its own directory (${rel} ⊅ ${missing.join(" + ") || "(inside the page's own directory)"})`);
      }
    }
    if (k === "noindex" && !page.noindexEvidence) {
      problems.push(`${route}: marked noindex but no index:false in the page, its imports or a layout`);
    }
    if (k === "redirect" && !page.redirects) {
      problems.push(`${route}: marked redirect but the page does not call redirect()`);
    }
    if ((k === "noindex" || k === "redirect") && model.sitemapStatic.includes(route)) {
      problems.push(`${route}: ${k} page listed in the sitemap (GSC error)`);
    }
  }

  for (const p of [...model.sitemapStatic, ...model.hubPaths]) {
    if (!(p in pages)) problems.push(`${p || "/"}: in the sitemap but no page exists`);
    // The sitemap emits every path twice (he unprefixed, /en), and robots.txt
    // keeps the /en rules by hand (MEH-2368) — check both.
    for (const url of [p, `/en${p}`]) {
      if (!robotsAllows(model.robots, url)) problems.push(`${url}: in the sitemap but robots.txt blocks it`);
    }
  }
  for (const p of LEGAL_FOOTER) {
    if (!linksTo(model.footerSource, p)) problems.push(`${p}: legal page missing from the footer`);
  }
  for (const r of Object.keys(exceptions)) {
    if (!(r in pages)) problems.push(`${r}: EXCEPTIONS entry for a page that no longer exists`);
  }
  if (!ignoreExceptions) {
    const without = findProblems(model, { ignoreExceptions: true });
    for (const r of Object.keys(exceptions)) {
      if (r in pages && !without.some((m) => m.startsWith(`${r}:`))) {
        problems.push(`${r}: EXCEPTIONS entry is stale — the page passes without it; delete the entry`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------- repo model

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (SOURCE_RE.test(e.name)) out.push(full);
  }
  return out;
}

const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");
const read = (abs) => fs.readFileSync(abs, "utf8");
// The robots object itself, not any `index: false` (a helper's option would match that).
const NOINDEX_RE = /robots\s*:\s*\{\s*index\s*:\s*false/;
export const hasNoindex = (source) => NOINDEX_RE.test(stripComments(source));

/** Files a page's metadata can come from: itself, its direct relative imports, ancestor layouts. */
function noindexEvidence(pageAbs) {
  const src = stripComments(read(pageAbs));
  if (NOINDEX_RE.test(src)) return true;
  const dir = path.dirname(pageAbs);
  for (const m of src.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    for (const ext of ["", ".js", ".jsx"]) {
      const cand = path.resolve(dir, m[1] + ext);
      if (fs.existsSync(cand) && fs.statSync(cand).isFile() && NOINDEX_RE.test(stripComments(read(cand)))) return true;
    }
  }
  for (let d = dir; d.startsWith(LOCALE); d = path.dirname(d)) {
    for (const name of ["layout.js", "layout.jsx"]) {
      const lay = path.join(d, name);
      if (d !== LOCALE && fs.existsSync(lay) && NOINDEX_RE.test(stripComments(read(lay)))) return true;
    }
  }
  return false;
}

function repoModel() {
  const all = walk(APP);
  const pages = {};
  const outsideLocale = [];
  for (const abs of all.filter((f) => PAGE_RE.test(path.basename(f)))) {
    const route = routeOf(rel(abs));
    if (route === null) {
      outsideLocale.push(rel(abs));
      continue;
    }
    if (SKIPPED_TREES.some((t) => route === t || route.startsWith(`${t}/`))) continue;
    const src = stripComments(read(abs));
    pages[route] = {
      file: rel(abs),
      dir: rel(path.dirname(abs)),
      noindexEvidence: noindexEvidence(abs),
      redirects: /\b(permanentRedirect|redirect)\(/.test(src),
    };
  }
  const linkRoots = ["app", "components", "lib"].map((d) => path.join(ROOT, d));
  const excluded = new Set(["app/sitemap.js", "lib/sitemap-static.js"]);
  const files = linkRoots
    .flatMap((d) => walk(d))
    .map((abs) => ({ rel: rel(abs), dir: rel(path.dirname(abs)), source: read(abs) }))
    .filter((f) => !excluded.has(f.rel));
  return {
    pages,
    outsideLocale,
    files,
    routes: ROUTES,
    exceptions: EXCEPTIONS,
    sitemapStatic: SITEMAP_STATIC_PAGES.map((d) => d.path),
    hubPaths: Object.values(HUBS).map((h) => h.path),
    sitemapSource: read(path.join(APP, "sitemap.js")),
    robots: read(path.join(ROOT, "public", "robots.txt")),
    footerSource: read(path.join(ROOT, "components", "Footer.jsx")),
  };
}

// ---------------------------------------------------------------- controls

/** A small synthetic site that is fully green; each control breaks one thing. */
function greenModel() {
  const page = (route, extra = {}) => ({
    file: `app/[locale]${route}/page.js`,
    dir: `app/[locale]${route}`,
    noindexEvidence: false,
    redirects: false,
    ...extra,
  });
  return {
    pages: {
      "": page(""),
      "/about": page("/about"),
      "/terms": page("/terms"),
      "/privacy": page("/privacy"),
      "/accessibility": page("/accessibility"),
      "/login": page("/login", { noindexEvidence: true }),
      "/x/[id]": page("/x/[id]"),
    },
    files: [
      { rel: "components/Footer.jsx", dir: "components", source: '{ href: "/about" }, { href: "/terms" }, { href: "/privacy" }, { href: "/accessibility" },' },
      { rel: "components/XCard.jsx", dir: "components", source: "{ href: `/x/${row.id}` }" },
    ],
    routes: {
      "": { kind: "home" },
      "/about": { kind: "indexed" },
      "/terms": { kind: "indexed" },
      "/privacy": { kind: "indexed" },
      "/accessibility": { kind: "indexed" },
      "/login": { kind: "noindex" },
      "/x/[id]": { kind: "family", sitemap: "`/x/${x.id}`", linkedFrom: ["components/XCard.jsx", "`/x/${row.id}`"] },
    },
    exceptions: {},
    sitemapStatic: ["", "/about", "/terms", "/privacy", "/accessibility"],
    hubPaths: [],
    sitemapSource: "localizeEntry(`/x/${x.id}`)",
    robots: "User-agent: *\nAllow: /\nDisallow: /login\n",
    footerSource: '{ href: "/about" }, { href: "/terms" }, { href: "/privacy" }, { href: "/accessibility" },',
  };
}

const withFiles = (m, files) => ({ ...m, files });

describe("MEH-3265 reachability guard — controls (each failure shown red)", () => {
  it("the green model is green", () => {
    expect(findProblems(greenModel())).toEqual([]);
  });

  it("1: a page with no ROUTES entry", () => {
    const m = greenModel();
    m.pages["/new"] = { ...m.pages["/about"], file: "app/[locale]/new/page.js", dir: "app/[locale]/new" };
    expect(findProblems(m)).toEqual([expect.stringMatching(/^\/new: new page with no ROUTES entry/)]);
  });

  it("2: an indexed page missing from the sitemap", () => {
    const m = greenModel();
    m.sitemapStatic = m.sitemapStatic.filter((p) => p !== "/about");
    expect(findProblems(m)).toEqual(["/about: indexed but missing from lib/sitemap-static.js"]);
  });

  it("3: an orphan — the only link removed", () => {
    const m = greenModel();
    const files = m.files.map((f) => (f.rel === "components/Footer.jsx" ? { ...f, source: '{ href: "/terms" }, { href: "/privacy" }, { href: "/accessibility" },' } : f));
    expect(findProblems(withFiles(m, files))).toEqual(["/about: orphan — no reachable file links to it"]);
  });

  it("3: a link from the page's own directory does not count", () => {
    const m = greenModel();
    const files = [
      { ...m.files[0], source: '{ href: "/terms" }, { href: "/privacy" }, { href: "/accessibility" },' },
      m.files[1],
      { rel: "app/[locale]/about/AboutClient.jsx", dir: "app/[locale]/about", source: '{ href: "/about" },' },
    ];
    expect(findProblems(withFiles(m, files))).toEqual(["/about: orphan — no reachable file links to it"]);
  });

  it("3: a link from a noindex page's own files does not count", () => {
    const m = greenModel();
    const files = [
      { ...m.files[0], source: '{ href: "/terms" }, { href: "/privacy" }, { href: "/accessibility" },' },
      m.files[1],
      { rel: "app/[locale]/login/page.js", dir: "app/[locale]/login", source: '{ href: "/about" },' },
    ];
    expect(findProblems(withFiles(m, files))).toEqual(["/about: orphan — no reachable file links to it"]);
  });

  it("3: a prefix is not a link — \"/about\" does not link /about/badges", () => {
    expect(linksTo('{ href: "/about" },', "/about/badges")).toBe(false);
    expect(linksTo('{ href: "/about/badges" },', "/about")).toBe(false);
    expect(linksTo('{ href: "/recommend#share" },', "/recommend")).toBe(true);
    expect(linksTo('// { href: "/about" },', "/about")).toBe(false);
  });

  it("3: a bare string is not a link — only href / push / replace shapes are", () => {
    expect(linksTo('if (pathname === "/about") x()', "/about")).toBe(false);
    expect(linksTo('canonical: "/about"', "/about")).toBe(false);
    expect(linksTo('<Link href="/about">', "/about")).toBe(true);
    expect(linksTo('<Link href={"/about"}>', "/about")).toBe(true);
    expect(linksTo('router.push("/about")', "/about")).toBe(true);
  });

  it("4: only a robots object counts as noindex evidence", () => {
    expect(hasNoindex('export const metadata = { robots: { index: false, follow: false } };')).toBe(true);
    expect(hasNoindex("search({ index: false })")).toBe(false);
    expect(hasNoindex("// robots: { index: false }")).toBe(false);
  });

  it("3: a family linked only from inside itself is an orphan", () => {
    const m = greenModel();
    m.routes["/x/[id]"] = { ...m.routes["/x/[id]"], linkedFrom: ["app/[locale]/x/[id]/page.js", "`/x/${row.id}`"] };
    const files = [...m.files, { rel: "app/[locale]/x/[id]/page.js", dir: "app/[locale]/x/[id]", source: "{ href: `/x/${row.id}` }" }];
    expect(findProblems(withFiles(m, files))).toEqual([expect.stringMatching(/^\/x\/\[id\]: orphan/)]);
  });

  it("4: noindex without evidence, and noindex listed in the sitemap", () => {
    const m = greenModel();
    m.pages["/login"] = { ...m.pages["/login"], noindexEvidence: false };
    m.sitemapStatic = [...m.sitemapStatic, "/login"];
    const got = findProblems(m);
    expect(got).toContain("/login: marked noindex but no index:false in the page, its imports or a layout");
    expect(got).toContain("/login: noindex page listed in the sitemap (GSC error)");
  });

  it("5: a sitemap path with no page, and one robots.txt blocks", () => {
    const m = greenModel();
    m.sitemapStatic = [...m.sitemapStatic, "/gone"];
    m.robots += "Disallow: /about\n";
    const got = findProblems(m);
    expect(got).toContain("/gone: in the sitemap but no page exists");
    expect(got).toContain("/about: in the sitemap but robots.txt blocks it");
  });

  it("robots: longest match wins, $ anchors, other groups ignored", () => {
    const txt = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nAllow: /register/producer\nDisallow: /register\nDisallow: /admin$\n";
    expect(robotsAllows(txt, "/register/producer")).toBe(true);
    expect(robotsAllows(txt, "/register")).toBe(false);
    expect(robotsAllows(txt, "/admin")).toBe(false);
    expect(robotsAllows(txt, "/admin-guide")).toBe(true);
    expect(robotsAllows(txt, "")).toBe(true);
  });

  it("robots: consecutive User-agent lines share a group; * wildcards match", () => {
    const txt = "User-agent: GPTBot\nUser-agent: *\nDisallow: /*?sort=\nDisallow: /en/x\n";
    expect(robotsAllows(txt, "/producers?sort=new")).toBe(false);
    expect(robotsAllows(txt, "/producers")).toBe(true);
    expect(robotsAllows(txt, "/en/x")).toBe(false);
  });

  it("5: the /en twin of a sitemap path is checked against robots.txt too", () => {
    const m = greenModel();
    m.robots += "Disallow: /en/about\n";
    expect(findProblems(m)).toEqual(["/en/about: in the sitemap but robots.txt blocks it"]);
  });

  it("6: a legal page leaves the footer", () => {
    const m = greenModel();
    m.footerSource = '{ href: "/terms" }, { href: "/privacy" },';
    expect(findProblems(m)).toEqual(["/accessibility: legal page missing from the footer"]);
  });

  it("7: a stale exception, and one for a page that is gone", () => {
    const m = greenModel();
    m.exceptions = { "/about": { card: "MEH-0", reason: "x" }, "/old": { card: "MEH-0", reason: "x" } };
    const got = findProblems(m);
    expect(got).toContain("/about: EXCEPTIONS entry is stale — the page passes without it; delete the entry");
    expect(got).toContain("/old: EXCEPTIONS entry for a page that no longer exists");
  });

  it("routeOf strips groups and maps the home page", () => {
    expect(routeOf("app/[locale]/page.js")).toBe("");
    expect(routeOf("app/[locale]/(shop)/about/page.jsx")).toBe("/about");
    expect(routeOf("app/other/page.js")).toBe(null);
  });
});

// ---------------------------------------------------------------- real repo

describe("MEH-3265 reachability guard — the repo", () => {
  const model = repoModel();

  it("control: the walker sees the real site (anchored to real files)", () => {
    expect(Object.keys(model.pages).length).toBeGreaterThan(40);
    expect(model.pages["/about"].file).toBe("app/[locale]/about/page.js");
    expect(model.pages["/login"].noindexEvidence).toBe(true);
    // /claim's noindex lives in an imported sibling, /settings' in its layout.
    expect(model.pages["/claim"].noindexEvidence).toBe(true);
    expect(model.pages["/settings"].noindexEvidence).toBe(true);
    expect(model.pages["/about"].noindexEvidence).toBe(false);
    expect(model.sitemapStatic).toContain("/about");
    expect(model.files.length).toBeGreaterThan(200);
  });

  it("no public page lives outside app/[locale]", () => {
    expect(model.outsideLocale).toEqual([]);
  });

  it("every public page is classified, in the sitemap and linked", () => {
    expect(findProblems(model)).toEqual([]);
  });
});
