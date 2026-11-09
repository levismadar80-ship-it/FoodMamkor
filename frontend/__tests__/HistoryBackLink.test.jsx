/**
 * MEH-2857 — «→ חזרה» on item pages returns to the page the visitor came from
 * (history.back — what Next's router.back() calls), and shows only when there is such a page inside the site.
 * Cells: in-app (client-side) arrival · full load from our site with history ·
 * same-origin link opened in a new tab (no history) · external referrer ·
 * direct landing (no referrer) · unparsable entry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: (ns) => (key) => `${ns}.${key}` }));

import HistoryBackLink, { cameFromInsideSite } from "@/components/HistoryBackLink";

const ORIGIN = "https://mehamakor.co.il";
function fakeWin({ first, path = "/group-buys/gb-1", referrer = "", historyLength = 1 }) {
  return {
    performance: { getEntriesByType: () => (first ? [{ name: first }] : []) },
    location: { origin: ORIGIN, pathname: path },
    document: { referrer },
    history: { length: historyLength },
  };
}

describe("cameFromInsideSite (MEH-2857)", () => {
  it.each([
    ["in-app arrival: the tab's first page was the business page", { first: `${ORIGIN}/maafiya` }, true],
    ["full load from our site, with a page behind it", { first: `${ORIGIN}/group-buys/gb-1`, referrer: `${ORIGIN}/maafiya`, historyLength: 3 }, true],
    ["our link opened in a NEW tab — nothing to go back to", { first: `${ORIGIN}/group-buys/gb-1`, referrer: `${ORIGIN}/maafiya`, historyLength: 1 }, false],
    ["landed from WhatsApp / Google", { first: `${ORIGIN}/group-buys/gb-1`, referrer: "https://www.google.com/", historyLength: 4 }, false],
    ["typed / bookmarked (no referrer)", { first: `${ORIGIN}/group-buys/gb-1`, historyLength: 2 }, false],
    ["same path, different query (a filter change is not another page)", { first: `${ORIGIN}/group-buys/gb-1?x=1` }, false],
  ])("%s → %s", (_, opts, expected) => {
    expect(cameFromInsideSite(fakeWin(opts))).toBe(expected);
  });

  it("an unparsable referrer → false, never a throw", () => {
    expect(cameFromInsideSite(fakeWin({ first: `${ORIGIN}/group-buys/gb-1`, referrer: "::nope", historyLength: 3 }))).toBe(false);
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

  it("direct landing → renders nothing", () => {
    spy = vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([{ name: window.location.href }]);
    const { container } = render(<HistoryBackLink />);
    expect(container).toBeEmptyDOMElement();
  });
});
