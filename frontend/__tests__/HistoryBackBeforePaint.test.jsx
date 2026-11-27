/**
 * MEH-3944 — the phone's «→ חזרה» (HistoryBackLink) is in the server HTML and
 * shows from the first paint when a page of the site is behind this one.
 * Before, hydration added it above the business page's gallery and pushed the
 * page down 52px (CLS 0.154 on /kaveret-or-habosmat, 375px, E2E run
 * 46007776973).
 *
 * Two halves are held here:
 *   1. The inline flags script decides exactly what cameFromInsideSite decides
 *      (the script cannot import it), over every cell of the component's own
 *      test: canGoBack true / false, and the first-document fallback.
 *   2. Server render carries the button marked data-history-back-only; after
 *      the client read the mark is gone (true) or the button is (false).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, cleanup } from "@testing-library/react";
import { PREHYDRATION_FLAGS_SCRIPT } from "@/lib/prehydration-flags-inline";

vi.mock("next-intl", () => ({ useTranslations: (ns) => (key) => `${ns}.${key}` }));

import HistoryBackLink, { cameFromInsideSite } from "@/components/HistoryBackLink";

const ORIGIN = "https://mehamakor.co.il";

function fakeWin({ first, path = "/kaveret-or-habosmat", canGoBack, navigation }) {
  return {
    ...(canGoBack === undefined ? {} : { navigation: { canGoBack } }),
    ...(navigation === undefined ? {} : { navigation }),
    performance: { getEntriesByType: () => (first ? [{ name: first }] : []) },
    location: { origin: ORIGIN, pathname: path, search: "" },
    localStorage: { getItem: () => null },
  };
}

/** Runs the real inline script against a fake window; returns the flag. */
function scriptSays(win) {
  const attrs = new Set();
  const doc = {
    addEventListener() {},
    documentElement: { setAttribute: (k) => attrs.add(k) },
  };
  new Function("window", "document", PREHYDRATION_FLAGS_SCRIPT)(win, doc);
  return attrs.has("data-came-from-site");
}

const CELLS = [
  ["canGoBack true (a page of ours behind)", { canGoBack: true, first: `${ORIGIN}/kaveret-or-habosmat` }],
  ["canGoBack false (landed from WhatsApp)", { canGoBack: false, first: `${ORIGIN}/producers` }],
  ["fallback: first document was another page of ours", { first: `${ORIGIN}/producers` }],
  ["fallback: /en first document, /en page", { first: `${ORIGIN}/en/producers`, path: "/en/kaveret-or-habosmat" }],
  ["fallback: direct landing", { first: `${ORIGIN}/kaveret-or-habosmat` }],
  ["fallback: language switch only (/en → he)", { first: `${ORIGIN}/en/kaveret-or-habosmat` }],
  ["fallback: language switch only (he → /en)", { first: `${ORIGIN}/kaveret-or-habosmat`, path: "/en/kaveret-or-habosmat" }],
  ["fallback: /en alone vs /", { first: `${ORIGIN}/en`, path: "/" }],
  ["fallback: a path that only starts with en (/enav)", { first: `${ORIGIN}/enav`, path: "/nav" }],
  ["fallback: no navigation entry", {}],
  ["fallback: unparsable entry", { first: "::not a url::" }],
  ["navigation without a boolean canGoBack → fallback (page behind)", { navigation: {}, first: `${ORIGIN}/producers` }],
  ["navigation without a boolean canGoBack → fallback (direct)", { navigation: {}, first: `${ORIGIN}/kaveret-or-habosmat` }],
];

describe("the inline flags script decides what cameFromInsideSite decides (MEH-3944)", () => {
  it.each(CELLS)("%s", (_, cell) => {
    const expected = cameFromInsideSite(fakeWin(cell));
    expect(scriptSays(fakeWin(cell))).toBe(expected);
  });

  it("control: the cells cover both answers, so parity is not «both always false»", () => {
    const answers = new Set(CELLS.map(([, cell]) => scriptSays(fakeWin(cell))));
    expect([...answers].sort()).toEqual([false, true]);
  });
});

describe("HistoryBackLink before and after the client read (MEH-3944)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("server HTML carries the button, marked for the pre-paint CSS rule", () => {
    const html = renderToString(<HistoryBackLink />);
    expect(html).toContain('data-testid="history-back"');
    expect(html).toContain("data-history-back-only");
  });

  it("a page of ours behind: the button stays and loses the mark", () => {
    vi.stubGlobal("navigation", { canGoBack: true });
    render(<HistoryBackLink />);
    const btn = screen.getByTestId("history-back");
    expect(btn.hasAttribute("data-history-back-only")).toBe(false);
  });

  it("nothing of ours behind: the button is gone", () => {
    vi.stubGlobal("navigation", { canGoBack: false });
    render(<HistoryBackLink />);
    expect(screen.queryByTestId("history-back")).toBeNull();
  });
});
