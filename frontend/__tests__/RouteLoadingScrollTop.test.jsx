import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A route loading fallback opens at the top of the page after a link click.
 *
 * Why: the App Router scrolls to a new page only when the page commits, not
 * when its loading.js fallback shows. After scrolling a list and tapping a
 * card, the fallback rendered at the list's scroll position, so the phone
 * showed only the header and the site footer until the business page arrived
 * (staging, 24/11: home → business page 0.4 s, /events → event page 0.8 s).
 *
 * Behavioural: renders every real app/[locale] loading.js file and reads what
 * the window was asked to do. A new loading.js without the hook fails the
 * first block by name.
 *
 * Shown failing: with useScrollTopOnArrival() removed from
 * app/[locale]/loading.js, the root and the two re-exporting /producers
 * segments go red; removed from producers/loading.js, that one goes red.
 */
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

const APP = path.resolve(__dirname, "../app/[locale]");
function findLoadingFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findLoadingFiles(p));
    else if (e.name === "loading.js") out.push(p);
  }
  return out;
}
const LOADING_FILES = findLoadingFiles(APP).map((p) => path.relative(APP, p));

let scrollTo;
function setScrollY(y) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
}

beforeEach(() => {
  vi.resetModules(); // route-memory keeps per-document state
  window.history.replaceState(null, "", "/");
  scrollTo = vi.fn();
  window.scrollTo = scrollTo;
  setScrollY(0);
});
afterEach(() => {
  setScrollY(0);
});

async function importLoading(rel) {
  // Import route-memory first so its entry path is the list page ("/"),
  // exactly as when the document was opened on the list.
  await import("@/lib/route-memory");
  return (await import(/* @vite-ignore */ path.join(APP, rel))).default;
}

describe("route loading fallbacks scroll to the top on a link click", () => {
  it("finds the loading files (control: the scan is not empty)", () => {
    // Root + /producers + its two nested segments, measured 24/11.
    expect(LOADING_FILES.length).toBeGreaterThanOrEqual(4);
    expect(LOADING_FILES).toContain("loading.js");
  });

  it.each(LOADING_FILES)("%s scrolls to 0 when it mounts after a push from a scrolled list", async (rel) => {
    const Loading = await importLoading(rel);
    setScrollY(900);
    window.history.pushState(null, "", "/golden-locations");
    render(<Loading />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe("cases where the browser owns the scroll position", () => {
  it("does not scroll on a back/forward step to the route", async () => {
    const Loading = await importLoading("loading.js");
    setScrollY(900);
    window.history.pushState(null, "", "/golden-locations");
    window.dispatchEvent(new PopStateEvent("popstate"));
    render(<Loading />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll on the document's own first route (reload / direct visit)", async () => {
    const Loading = await importLoading("loading.js");
    setScrollY(900);
    render(<Loading />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not call scrollTo when the window is already at the top", async () => {
    const Loading = await importLoading("loading.js");
    window.history.pushState(null, "", "/golden-locations");
    render(<Loading />);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
