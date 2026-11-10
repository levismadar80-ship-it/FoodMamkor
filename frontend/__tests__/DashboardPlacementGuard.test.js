/**
 * MEH-2885 — the owner dashboard's placement is a fact the tests enforce.
 *
 * Fails when:
 *   1. a page under app/[locale]/producer/dashboard/** has no place in
 *      lib/business-features.js (a `dashboard.href`, or one of the explicit
 *      DASHBOARD_FRAME_PAGES / DASHBOARD_SUBPAGES / DASHBOARD_PAGES_WITHOUT_ENTRY);
 *   2. a tool's dashboard page has no link pointing at it in the code;
 *   3. a tool's dashboard page is more than 2 taps from the dashboard home.
 *
 * Taps come from a STATIC link graph: the dashboard home is 0, each tab in
 * DashboardLayoutClient.jsx TABS is 1, and a page linked from a file rendered
 * on a page at depth d is d + 1. "Rendered on" = the page file plus the files
 * it imports directly (one level: `@/…` and `./…` imports) — the QR card's
 * link lives in BusinessQrCard.jsx, imported by the tools page.
 *
 * The graph and the checks are pure functions over a { pages, files } model,
 * so each of the three failures is shown on a synthetic model first (control
 * cases), then the same functions run over the real repo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BUSINESS_FEATURES,
  DASHBOARD_FRAME_PAGES,
  DASHBOARD_SUBPAGES,
  DASHBOARD_PAGES_WITHOUT_ENTRY,
} from "@/lib/business-features";

const ROOT = path.resolve(__dirname, "..");
const DASH_DIR = path.join(ROOT, "app", "[locale]", "producer", "dashboard");
const HOME = "/producer/dashboard";
const MAX_TAPS = 2;
const LINK_RE = /["'`](\/producer\/dashboard(?:\/[a-z0-9-]+)*)(?=[#?"'`])/g;

// ---------------------------------------------------------------- pure core

/** Routes of the page files: "app/[locale]/producer/dashboard/x/page.js" → "/producer/dashboard/x". */
export function routeOf(relPageFile) {
  const dir = path.dirname(relPageFile).split(path.sep).join("/");
  const at = dir.indexOf("/producer/dashboard");
  return dir.slice(at);
}

/** Literal dashboard hrefs in a source text (no trailing slash, no hash/query). */
export function linksIn(source) {
  return [...source.matchAll(LINK_RE)].map((m) => m[1]);
}

/** Every page that is a tool's landing page, from the registry entries. */
function toolPages(features) {
  return features.filter((f) => f.dashboard).map((f) => f.dashboard.href);
}

/** Check 1: pages with no place. */
export function unplacedPages(pageRoutes, { features, frame, subpages, withoutEntry }) {
  const placed = new Set([
    ...toolPages(features),
    ...Object.keys(frame),
    ...Object.keys(subpages),
    ...Object.keys(withoutEntry),
  ]);
  return pageRoutes.filter((r) => !placed.has(r));
}

/**
 * Check 2: tool pages that no file links to. Files inside the target page's
 * own folder do not count — the page itself, and its sub-pages (a form's
 * «back» link to its parent is reachable only FROM that parent).
 */
export function unlinkedPages(targets, filesByPath, pageFileOf) {
  return targets.filter((target) => {
    const ownDir = path.dirname(pageFileOf[target]) + path.sep;
    return !Object.entries(filesByPath).some(
      ([file, src]) =>
        file !== pageFileOf[target] && !file.startsWith(ownDir) && linksIn(src).includes(target),
    );
  });
}

/**
 * Taps from home for every route reachable through the static graph.
 * renderedOn[route] = sources rendered on that page (page file + direct imports).
 */
export function tapDepths(tabs, renderedOn) {
  const depth = { [HOME]: 0 };
  for (const tab of tabs) if (depth[tab] === undefined) depth[tab] = 1;
  const queue = Object.keys(depth);
  while (queue.length) {
    const route = queue.shift();
    for (const src of renderedOn[route] || []) {
      for (const target of linksIn(src)) {
        if (depth[target] === undefined) {
          depth[target] = depth[route] + 1;
          queue.push(target);
        }
      }
    }
  }
  return depth;
}

/** Check 3: tool pages deeper than MAX_TAPS (or unreachable). */
export function tooDeep(targets, depth) {
  return targets.filter((t) => !(depth[t] <= MAX_TAPS)).map((t) => `${t} (${depth[t] ?? "unreachable"})`);
}

// ---------------------------------------------------------------- real repo

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(full, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function resolveImport(fromFile, spec) {
  const base = spec.startsWith("@/")
    ? path.join(ROOT, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

function realModel() {
  const pageFiles = walk(DASH_DIR).filter((f) => /\/page\.(js|jsx)$/.test(f));
  const routeToFile = Object.fromEntries(pageFiles.map((f) => [routeOf(path.relative(ROOT, f)), f]));
  const sourceFiles = [
    ...walk(path.join(ROOT, "app")),
    ...walk(path.join(ROOT, "components")),
    ...walk(path.join(ROOT, "lib")),
  ].filter((f) => !f.endsWith(path.join("lib", "business-features.js")));
  const filesByPath = Object.fromEntries(sourceFiles.map((f) => [f, fs.readFileSync(f, "utf8")]));
  // The tools tab's `also: [...]` list only keeps the tab lit on those pages —
  // it is not a link, so it must not count as one.
  const layoutFile = path.join(DASH_DIR, "DashboardLayoutClient.jsx");
  filesByPath[layoutFile] = filesByPath[layoutFile].replace(/also:\s*\[[^\]]*\]/g, "also: []");
  const renderedOn = {};
  for (const [route, file] of Object.entries(routeToFile)) {
    const src = filesByPath[file] ?? fs.readFileSync(file, "utf8");
    const imports = [...src.matchAll(/from\s+["'](@\/[^"']+|\.{1,2}\/[^"']+)["']/g)]
      .map((m) => resolveImport(file, m[1]))
      .filter(Boolean);
    renderedOn[route] = [src, ...imports.map((f) => filesByPath[f] ?? fs.readFileSync(f, "utf8"))];
  }
  const layout = fs.readFileSync(path.join(DASH_DIR, "DashboardLayoutClient.jsx"), "utf8");
  const tabsBlock = layout.slice(layout.indexOf("const TABS = ["), layout.indexOf("];", layout.indexOf("const TABS = [")));
  const tabs = [...tabsBlock.matchAll(/key:\s*"[a-z_]+",\s*href:\s*"([^"]+)"/g)].map((m) => m[1]);
  return { routeToFile, filesByPath, renderedOn, tabs };
}

const REGISTRY = {
  features: BUSINESS_FEATURES,
  frame: DASHBOARD_FRAME_PAGES,
  subpages: DASHBOARD_SUBPAGES,
  withoutEntry: DASHBOARD_PAGES_WITHOUT_ENTRY,
};
const TARGETS = [...toolPages(BUSINESS_FEATURES), ...Object.keys(DASHBOARD_PAGES_WITHOUT_ENTRY)];

// ---------------------------------------------------------------- controls

describe("placement checks can fail (synthetic models)", () => {
  const reg = { features: [{ id: "a", dashboard: { home: "tools", href: "/producer/dashboard/a" } }], frame: { [HOME]: "home", "/producer/dashboard/tools": "tab" }, subpages: {}, withoutEntry: {} };

  it("1 — a page with no place is reported", () => {
    expect(unplacedPages([HOME, "/producer/dashboard/a", "/producer/dashboard/ghost"], reg)).toEqual(["/producer/dashboard/ghost"]);
  });

  it("2 — a page nobody links to is reported; its own file does not count", () => {
    const files = {
      "a/page.js": 'href="/producer/dashboard/a"',
      "a/new/page.js": '<BackLink href="/producer/dashboard/a" />',
      "tools/page.js": "no links",
    };
    expect(unlinkedPages(["/producer/dashboard/a"], files, { "/producer/dashboard/a": "a/page.js" })).toEqual(["/producer/dashboard/a"]);
    files["tools/page.js"] = '<Link href="/producer/dashboard/a">';
    expect(unlinkedPages(["/producer/dashboard/a"], files, { "/producer/dashboard/a": "a/page.js" })).toEqual([]);
  });

  it("3 — a page 3 taps away is reported; 2 taps is fine", () => {
    const renderedOn = {
      "/producer/dashboard/tools": ['href="/producer/dashboard/mid"'],
      "/producer/dashboard/mid": ['href="/producer/dashboard/a"'],
    };
    const d = tapDepths(["/producer/dashboard/tools"], renderedOn);
    expect(d["/producer/dashboard/a"]).toBe(3);
    expect(tooDeep(["/producer/dashboard/a"], d)).toEqual(["/producer/dashboard/a (3)"]);
    expect(tooDeep(["/producer/dashboard/mid"], d)).toEqual([]);
  });

  it("link extraction: hash / query / quotes, no partial-prefix matches", () => {
    expect(linksIn('a="/producer/dashboard/tools#share" b=`/producer/dashboard/qr-card?x=1` c="/producer/dashboard/rescue/counter-card"')).toEqual([
      "/producer/dashboard/tools",
      "/producer/dashboard/qr-card",
      "/producer/dashboard/rescue/counter-card",
    ]);
    expect(linksIn('"/producer/dashboardx"')).toEqual([]);
  });
});

// ---------------------------------------------------------------- real repo

describe("owner dashboard placement (MEH-2885)", () => {
  const model = realModel();
  const routes = Object.keys(model.routeToFile).sort();

  it("the model sees the real dashboard (anchors)", () => {
    expect(routes.length, "dashboard page files found").toBeGreaterThanOrEqual(17);
    expect(routes).toContain("/producer/dashboard/qr-card");
    expect(model.tabs).toEqual([HOME, "/producer/dashboard/edit", "/producer/dashboard/insights", "/producer/dashboard/tools"]);
    expect(TARGETS.length, "tool pages under check").toBeGreaterThanOrEqual(7);
  });

  it("every dashboard page has a place in lib/business-features.js", () => {
    expect(unplacedPages(routes, REGISTRY)).toEqual([]);
  });

  it("every listed place is a real page (no stale entries)", () => {
    const listed = [...TARGETS, ...Object.keys(DASHBOARD_FRAME_PAGES), ...Object.keys(DASHBOARD_SUBPAGES)];
    expect(listed.filter((r) => !model.routeToFile[r])).toEqual([]);
    for (const parent of Object.values(DASHBOARD_SUBPAGES)) expect(routes).toContain(parent);
  });

  it("every tool page has an inbound link in the code", () => {
    const pageFileOf = Object.fromEntries(TARGETS.map((t) => [t, model.routeToFile[t]]));
    expect(unlinkedPages(TARGETS, model.filesByPath, pageFileOf)).toEqual([]);
  });

  it(`every tool page is at most ${MAX_TAPS} taps from the dashboard home`, () => {
    const depth = tapDepths(model.tabs, model.renderedOn);
    expect(tooDeep(TARGETS, depth)).toEqual([]);
  });

  it("every entry's `home` names a real tab", () => {
    const homes = new Set(["home", "edit", "insights", "tools"]);
    expect(BUSINESS_FEATURES.filter((f) => f.dashboard && !homes.has(f.dashboard.home)).map((f) => f.id)).toEqual([]);
  });
});
