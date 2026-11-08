import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * MEH-2754 — the route loading fallback must be at least one screen tall.
 *
 * Why: at 40vh (the .brand-loader default) the site footer sat in the first
 * phone screen while a page streamed, then jumped below the fold when the page
 * arrived — CLS 0.42 on the home page (Lighthouse mobile, 06/11). A footer that
 * starts below the fold cannot shift in view.
 *
 * Behavioural: renders the real app/[locale]/loading.js (an async server
 * component) and reads the class on what it returns, rather than grepping
 * the source.
 *
 * Shown failing: on the pre-MEH-2754 loading.js (BrandLoader returned bare)
 * the testid lookup finds nothing → red. Restored → green.
 */
const identity = (key) => key;
vi.mock("next-intl/server", () => ({
  getTranslations: async () => identity,
}));

describe("route loading fallback (MEH-2754)", () => {
  it("is wrapped in a min-h-screen box so the footer starts below the fold", async () => {
    const { default: Loading } = await import("@/app/[locale]/loading");
    render(await Loading());
    const box = screen.getByTestId("route-loading");
    expect(box.className.split(/\s+/)).toContain("min-h-screen");
    // The loader is inside it, still announcing to assistive tech.
    expect(box.querySelector('[role="status"]')).not.toBeNull();
  });
});

/**
 * Siblings (Bug Protocol step 2). The same short-fallback shape lived in the
 * page-level <Suspense> of /events, /experiences and /experiences/[id]:
 * measured locally 06/11, /events shifted the footer by 0.64 CLS → 0.07 with
 * the fix. Every route page whose Suspense fallback is a plain <div> must make
 * it a full screen. Source scan on purpose — rendering each async page pulls
 * in its whole client tree. A fallback that is a component (e.g. the
 * /producers skeleton grid) is out of scope: it reserves its own height.
 *
 * Shown failing: on the pre-MEH-2754 pages the scan lists all three files.
 */
const MIN_ROUTE_PAGES = 20;
const MIN_DIV_FALLBACKS = 3;
const read = (file) => fs.readFileSync(file, "utf8"); // eslint-disable-line security/detect-non-literal-fs-filename -- test walks app/ only

function pageFiles(dir) {
  const out = [];
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test walks app/ only
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full));
    else if (/^page\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("page-level Suspense fallbacks (MEH-2754 siblings)", () => {
  const root = path.join(process.cwd(), "app", "[locale]");
  const files = pageFiles(root);

  it("control: the scan sees the route pages and their div fallbacks", () => {
    expect(files.length).toBeGreaterThan(MIN_ROUTE_PAGES);
    const withDivFallback = files.filter((file) => /fallback=\{\s*<div\b/.test(read(file)));
    // events, experiences, experiences/[id] at least — the count can grow,
    // never silently drop to zero (a broken regex would).
    expect(withDivFallback.length).toBeGreaterThanOrEqual(MIN_DIV_FALLBACKS);
  });

  it("every <div> Suspense fallback in a route page is min-h-screen", () => {
    const offenders = [];
    for (const file of files) {
      for (const match of read(file).matchAll(/fallback=\{\s*<div\b([^>]*)>/g)) {
        if (!/\bmin-h-screen\b/.test(match[1])) offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
