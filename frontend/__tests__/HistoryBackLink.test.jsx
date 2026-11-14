/**
 * MEH-2857 — «→ חזרה» on item pages returns to the page the visitor came from
 * (history.back — what Next's router.back() calls), and shows only when there is such a page inside the site.
 * Cells: Navigation API canGoBack true/false · fallback: in-app arrival (he/en),
 * direct landing, direct landing + language switch (both ways), query-only
 * change, no entry, unparsable entry, server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: (ns) => (key) => `${ns}.${key}` }));

import HistoryBackLink, { cameFromInsideSite } from "@/components/HistoryBackLink";

const ORIGIN = "https://mehamakor.co.il";
function fakeWin({ first, path = "/group-buys/gb-1", canGoBack }) {
  return {
    ...(canGoBack === undefined ? {} : { navigation: { canGoBack } }),
    performance: { getEntriesByType: () => (first ? [{ name: first }] : []) },
    location: { origin: ORIGIN, pathname: path },
  };
}

describe("cameFromInsideSite (MEH-2857)", () => {
  describe("the browser says (Navigation API)", () => {
    it.each([
      ["a page of ours behind this one", true],
      ["index 0 — landed from WhatsApp / Google, or a fresh tab", false],
    ])("%s → canGoBack %s", (_, canGoBack) => {
      // The first-document path would say the opposite; canGoBack wins.
      const first = canGoBack ? `${ORIGIN}/group-buys/gb-1` : `${ORIGIN}/maafiya`;
      expect(cameFromInsideSite(fakeWin({ first, canGoBack }))).toBe(canGoBack);
    });
  });

  describe("fallback: the tab's first document", () => {
    it.each([
      ["in-app arrival: the tab's first page was the business page", { first: `${ORIGIN}/maafiya` }, true],
      ["in-app arrival on /en", { first: `${ORIGIN}/en/maafiya`, path: "/en/group-buys/gb-1" }, true],
      ["direct landing", { first: `${ORIGIN}/group-buys/gb-1` }, false],
      ["direct landing, then the saved language switched the URL to /en", { first: `${ORIGIN}/group-buys/gb-1`, path: "/en/group-buys/gb-1" }, false],
      ["direct /en landing switched to he", { first: `${ORIGIN}/en/group-buys/gb-1` }, false],
      ["same path, different query (a filter change is not another page)", { first: `${ORIGIN}/group-buys/gb-1?x=1` }, false],
      ["no navigation entry", {}, false],
    ])("%s → %s", (_, opts, expected) => {
      expect(cameFromInsideSite(fakeWin(opts))).toBe(expected);
    });

    it("an unparsable entry → false, never a throw", () => {
      expect(cameFromInsideSite(fakeWin({ first: "::nope" }))).toBe(false);
    });
  });

  it("no window (server) → false", () => {
    expect(cameFromInsideSite(undefined)).toBe(false);
  });
});

describe("<HistoryBackLink /> (MEH-2857)", () => {
  let spy;
  let back;
  beforeEach(() => {
    back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  });
  afterEach(() => {
    spy?.mockRestore();
    back.mockRestore();
  });

  it("arrived from inside the site → «→ חזרה» (existing copy), and a tap goes back", () => {
    spy = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ name: `${window.location.origin}/some-business` }]);
    render(<HistoryBackLink />);
    const btn = screen.getByTestId("history-back");
    expect(btn).toHaveTextContent("producer.detail.back_label");
    expect(btn).toHaveAttribute("aria-label", "producer.detail.aria.back");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("min-h-touch");
    fireEvent.click(btn);
    expect(back).toHaveBeenCalledTimes(1);
  });

  // MEH-3057: an inline box let the category chip share its line, touching
  // it. Block-level (`flex`, sized to its text) — the next element always
  // starts a new row, on every page that renders it.
  it("is a row of its own: block-level flex, never inline", () => {
    spy = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ name: `${window.location.origin}/some-business` }]);
    render(<HistoryBackLink />);
    const classes = screen.getByTestId("history-back").className.split(/\s+/);
    expect(classes).toContain("flex");
    expect(classes).toContain("w-fit");
    expect(classes.filter((c) => /^(inline|inline-flex|inline-block)$/.test(c))).toEqual([]);
  });

  it("direct landing → renders nothing", () => {
    spy = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ name: window.location.href }]);
    const { container } = render(<HistoryBackLink />);
    expect(container).toBeEmptyDOMElement();
  });
});
