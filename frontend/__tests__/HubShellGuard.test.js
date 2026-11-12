/**
 * MEH-3013 — every «מה קורה» hub tab wears the same head.
 *
 * Sapir 12/11: /rescue (no hero, its own H1 above the tabs) and /group-buys
 * (a short centred hero) read as another site next to /events. The fix is one
 * owner — components/HubShell.jsx renders the hero and the tab row — and this
 * guard keeps it the only owner:
 *
 *   1. every route in HUB_TABS renders <HubShell> (in its page file or in a
 *      file that page imports directly), so a fifth tab is checked the day it
 *      is added to the row;
 *   2. none of those route files writes its own <h1> — the H1 is the shell's;
 *   3. ListingHubTabs is imported by HubShell alone, so nobody can mount the
 *      tab row under a head of their own.
 *
 * Static on purpose (file text, not a render): the routes are server pages
 * with data fetching, and the question is "who owns the head", which the
 * import graph answers exactly.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { HUB_TABS } from "@/components/ListingHubTabs";

const ROOT = path.resolve(__dirname, "..");
const LOCALE_APP = path.join(ROOT, "app", "[locale]");

/** Strip comments so a comment that mentions <h1> or HubShell does not count. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const ext of ["", ".jsx", ".js"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** The route's page file plus the app/ files it imports directly. */
function routeFiles(href) {
  const dir = path.join(LOCALE_APP, ...href.split("/").filter(Boolean));
  const page = ["page.jsx", "page.js"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!page) return [];
  const files = [page];
  const specs = [...fs.readFileSync(page, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of specs) {
    const file = resolveImport(page, spec);
    if (file && file.startsWith(path.join(ROOT, "app")) && !files.includes(file)) files.push(file);
  }
  return files;
}

function rendersShell(files) {
  return files.some((f) => /<HubShell[\s/>]/.test(code(fs.readFileSync(f, "utf8"))));
}

function ownH1(files) {
  return files.filter((f) => /<h1[\s>]/.test(code(fs.readFileSync(f, "utf8"))));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("HubShellGuard (MEH-3013)", () => {
  it("knows all four hub tabs", () => {
    // A derived count, so a tab removed from the row is noticed here too.
    expect(HUB_TABS.map((t) => t.href)).toEqual(["/events", "/experiences", "/group-buys", "/rescue"]);
  });

  it.each(HUB_TABS.map((t) => [t.href]))("%s has a page file", (href) => {
    expect(routeFiles(href).length).toBeGreaterThan(0);
  });

  it.each(HUB_TABS.map((t) => [t.href]))("%s renders the shared HubShell head", (href) => {
    expect(rendersShell(routeFiles(href))).toBe(true);
  });

  it.each(HUB_TABS.map((t) => [t.href]))("%s writes no <h1> of its own (the shell's is the page's only H1)", (href) => {
    expect(ownH1(routeFiles(href)).map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("only HubShell mounts the tab row", () => {
    const importers = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))]
      .filter((f) => /from\s+["']@\/components\/ListingHubTabs["']/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(importers).toEqual([path.join("components", "HubShell.jsx")]);
  });
});
