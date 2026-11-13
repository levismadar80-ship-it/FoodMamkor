/**
 * MEH-3049 — every «מה קורה» hub tab must stay prefetchable.
 *
 * Sapir 13/11: /events ↔ /experiences switch smoothly, but the next tab showed
 * the whole-page loader and rebuilt the hero. Measured on staging: /rescue
 * answered `private, no-store` (per-request) while the other tabs were
 * prerendered. Its page called getTranslations("rescue") with no locale and no
 * setRequestLocale, so next-intl read headers() — the MEH-2878 shape — and a
 * per-request route is prefetched only down to app/[locale]/loading.js.
 *
 * static-routes-guard.mjs cannot catch this for /rescue: CI builds with the
 * rescue flag off, notFound() runs before the translation call, and the 404
 * prerenders. So this guard reads the files instead: for every route in
 * HUB_TABS, the page file and every server file it imports directly (no
 * "use client" — e.g. events/hub-tab-titles.js) must pass a locale to every
 * getTranslations call, must not alias getTranslations, and must not read
 * headers() / cookies() (both make the route per-request).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { HUB_TABS } from "@/components/ListingHubTabs";

const LOCALE_APP = path.resolve(__dirname, "..", "app", "[locale]");

/** Strip comments so a comment that quotes the bad call does not count. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function pageFile(href) {
  const dir = path.join(LOCALE_APP, href.replace(/^\//, ""));
  const file = ["page.js", "page.jsx"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`no page file for hub route ${href} under ${dir}`);
  return file;
}

/** Blank out string literals so a word inside quotes never counts as code. */
function noStrings(text) {
  return text.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

/** A `locale` key (shorthand or `locale: x`) whose value is not `undefined`. */
const LOCALE_KEY = /(?:^\{|,)\s*locale\s*(?:,|\}|:\s*(?!undefined\b)[\w.$[\]]+)/;

/**
 * Problems in one server file: getTranslations calls without a locale, an
 * aliased getTranslations (which would hide its calls from this scan), and
 * headers() / cookies() reads.
 */
export function localelessCalls(text) {
  const src = code(text);
  const problems = [];
  for (const m of src.matchAll(/getTranslations\(([^)]*)\)/g)) {
    const arg = m[1].trim();
    if (!LOCALE_KEY.test(noStrings(arg))) problems.push(arg);
  }
  if (/getTranslations\s+as\s+\w+/.test(src) || /=\s*getTranslations\s*[;,\n]/.test(src)) {
    problems.push("aliased getTranslations");
  }
  if (/\b(?:headers|cookies)\s*\(\s*\)/.test(src)) problems.push("headers()/cookies()");
  return problems;
}

/** The page file plus every server-side file it imports directly. */
function serverFiles(page) {
  const files = [page];
  for (const m of fs.readFileSync(page, "utf8").matchAll(/from\s+["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/")
      ? path.resolve(__dirname, "..", spec.slice(2))
      : path.resolve(path.dirname(page), spec);
    const file = ["", ".js", ".jsx"].map((e) => base + e).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file || !file.includes(`${path.sep}app${path.sep}`)) continue;
    if (/^\s*["']use client["']/.test(fs.readFileSync(file, "utf8"))) continue;
    files.push(file);
  }
  return files;
}

describe("MEH-3049: classifier self-test", () => {
  it("flags a string-only call and an empty call", () => {
    expect(localelessCalls('await getTranslations("rescue")')).toEqual(['"rescue"']);
    expect(localelessCalls("await getTranslations()")).toEqual([""]);
  });
  it("passes a call with an explicit locale", () => {
    expect(localelessCalls('getTranslations({ locale, namespace: "seo.events" })')).toEqual([]);
  });
  it("flags `locale` only inside a string, and `locale: undefined`", () => {
    expect(localelessCalls('getTranslations({ namespace: "locale" })')).toHaveLength(1);
    expect(localelessCalls('getTranslations({ locale: undefined, namespace: "x" })')).toHaveLength(1);
  });
  it("passes `locale: params.locale` and shorthand after another key", () => {
    expect(localelessCalls('getTranslations({ locale: params.locale, namespace: "x" })')).toEqual([]);
    expect(localelessCalls('getTranslations({ namespace: "x", locale })')).toEqual([]);
  });
  it("flags an aliased import and a headers() read", () => {
    expect(localelessCalls('import { getTranslations as gt } from "next-intl/server";')).toEqual(["aliased getTranslations"]);
    expect(localelessCalls("const h = await headers();")).toEqual(["headers()/cookies()"]);
  });
  it("ignores a commented-out call", () => {
    expect(localelessCalls('// getTranslations("rescue")\nconst x = 1;')).toEqual([]);
  });
  it("follows a page's server imports — /events reaches hub-tab-titles.js", () => {
    const names = serverFiles(pageFile("/events")).map((f) => path.basename(f));
    expect(names).toContain("hub-tab-titles.js");
    expect(names).not.toContain("EventsClient.jsx");
  });
  it("is anchored to a real hub page that passes (group-buys)", () => {
    const text = fs.readFileSync(pageFile("/group-buys"), "utf8");
    expect(text).toMatch(/getTranslations\(/);
    expect(localelessCalls(text)).toEqual([]);
  });
});

describe("MEH-3049: hub routes keep a locale on every server translation call", () => {
  for (const tab of HUB_TABS) {
    it(`${tab.href} passes a locale to getTranslations`, () => {
      for (const file of serverFiles(pageFile(tab.href))) {
        const rel = path.relative(LOCALE_APP, file);
        expect({ file: rel, problems: localelessCalls(fs.readFileSync(file, "utf8")) }).toEqual({ file: rel, problems: [] });
      }
    });
  }
});
