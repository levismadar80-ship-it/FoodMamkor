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
 * prerenders. So this guard reads the files instead: every route in HUB_TABS
 * (its page file and the file that holds generateMetadata) passes a locale to
 * every server getTranslations call.
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

/** getTranslations calls whose argument is not an object carrying a locale. */
export function localelessCalls(text) {
  const calls = [...code(text).matchAll(/getTranslations\(([^)]*)\)/g)].map((m) => m[1].trim());
  return calls.filter((arg) => !/^\{[^}]*\blocale\b/.test(arg));
}

describe("MEH-3049: classifier self-test", () => {
  it("flags a string-only call and an empty call", () => {
    expect(localelessCalls('await getTranslations("rescue")')).toEqual(['"rescue"']);
    expect(localelessCalls("await getTranslations()")).toEqual([""]);
  });
  it("passes a call with an explicit locale", () => {
    expect(localelessCalls('getTranslations({ locale, namespace: "seo.events" })')).toEqual([]);
  });
  it("ignores a commented-out call", () => {
    expect(localelessCalls('// getTranslations("rescue")\nconst x = 1;')).toEqual([]);
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
      const text = fs.readFileSync(pageFile(tab.href), "utf8");
      expect(localelessCalls(text)).toEqual([]);
    });
  }
});
