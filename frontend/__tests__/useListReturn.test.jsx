// MEH-3810: lib/use-list-return.js — Back from a card brings back the loaded
// pages of an infinite-scroll list (the /producers bug: page 2 was lost and the
// reader landed ~750 px from the card she opened).
import { render, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let historyReturn = false;
vi.mock("@/lib/route-memory", () => ({ consumeHistoryReturn: () => historyReturn }));

import { useListReturn, MAX_RESTORED_ITEMS } from "@/lib/use-list-return";

const KEY = "list-return:test";

function List({ enabled = true, items = [{ id: "p25" }], restore = () => {} }) {
  useListReturn({ key: "test", enabled, pages: { items, nextPage: 3, hasMore: true, total: 60 }, restore });
  return <a href="/producer/p25">card</a>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/producers");
  historyReturn = false;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 0; });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function leaveByCard(props) {
  const { getByText, unmount } = render(<List {...props} />);
  getByText("card").addEventListener("click", (e) => e.preventDefault()); // jsdom: no navigation
  fireEvent.click(getByText("card"));
  unmount();
}

describe("useListReturn (MEH-3810)", () => {
  it("a link click saves the loaded pages; a history return restores them", () => {
    leaveByCard({});
    expect(JSON.parse(window.sessionStorage.getItem(KEY)).pages.items).toEqual([{ id: "p25" }]);
    historyReturn = true;
    const restore = vi.fn();
    render(<List items={[]} restore={restore} />);
    expect(restore).toHaveBeenCalledWith({ items: [{ id: "p25" }], nextPage: 3, hasMore: true, total: 60 });
  });

  it("a fresh arrival (a link, not Back) starts the list over", () => {
    leaveByCard({});
    const restore = vi.fn();
    render(<List items={[]} restore={restore} />);
    expect(restore).not.toHaveBeenCalled();
  });

  it("another query is another list: nothing is restored", () => {
    leaveByCard({});
    window.history.replaceState(null, "", "/producers?category=3");
    historyReturn = true;
    const restore = vi.fn();
    render(<List items={[]} restore={restore} />);
    expect(restore).not.toHaveBeenCalled();
  });

  it("with a filter or sort on (enabled=false), the stash is cleared", () => {
    leaveByCard({});
    leaveByCard({ enabled: false });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("no loaded pages, or more than the cap, saves nothing", () => {
    leaveByCard({ items: [] });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    leaveByCard({ items: Array.from({ length: MAX_RESTORED_ITEMS + 1 }, (_, i) => ({ id: i })) });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});
