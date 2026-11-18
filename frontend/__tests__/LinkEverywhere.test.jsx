import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LinkEverywhere, { LINK_PLACES } from "@/components/producer/LinkEverywhere";
import ShareVisitsLine from "@/components/producer/ShareVisitsLine";

// MEH-3331 — «הקישור שלך בכל מקום» rows and the insights share-visits line.
// Toggle states per row: unticked / ticked, persisted per business, and the
// card survives storage that throws. Count states for the line: absent / 0
// (hidden) / 1 / many.

const copyMock = vi.hoisted(() => ({ copyText: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/clipboard", () => copyMock);
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => `${ns}.${k}${v ? JSON.stringify(v) : ""}`,
}));

const producer = { id: "p1", slug: "test-bakery" };
const KEY = "mehamakor.link-everywhere.p1";

beforeEach(() => {
  window.localStorage.clear();
  copyMock.copyText.mockClear();
});

describe("LinkEverywhere", () => {
  it("renders one row per place, none ticked on a first visit", () => {
    render(<LinkEverywhere producer={producer} />);
    expect(LINK_PLACES).toEqual(["instagram", "facebook", "google", "whatsapp"]);
    for (const place of LINK_PLACES) {
      expect(screen.getByTestId(`link-place-${place}`)).toBeTruthy();
      expect(screen.getByTestId(`link-done-${place}`).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("copies a link tagged with from=share and the row's place as utm_source", async () => {
    render(<LinkEverywhere producer={producer} />);
    fireEvent.click(screen.getByTestId("link-copy-google"));
    await waitFor(() => expect(copyMock.copyText).toHaveBeenCalledTimes(1));
    const url = new URL(copyMock.copyText.mock.calls[0][0]);
    expect(url.pathname).toBe("/p/test-bakery");
    expect(url.searchParams.get("from")).toBe("share");
    expect(url.searchParams.get("utm_source")).toBe("google");
    await waitFor(() => expect(screen.getByTestId("link-copy-google").textContent).toContain("links.copied"));
  });

  it("ticks and unticks a row, and keeps the ticks for this business across mounts", () => {
    const { unmount } = render(<LinkEverywhere producer={producer} />);
    fireEvent.click(screen.getByTestId("link-done-instagram"));
    expect(screen.getByTestId("link-done-instagram").getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual(["instagram"]);
    unmount();

    render(<LinkEverywhere producer={producer} />);
    expect(screen.getByTestId("link-done-instagram").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("link-done-facebook").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId("link-done-instagram"));
    expect(screen.getByTestId("link-done-instagram").getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual([]);
  });

  it("ignores a stored value that is not a list of known places", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["instagram", "tiktok"]));
    render(<LinkEverywhere producer={producer} />);
    expect(screen.getByTestId("link-done-instagram").getAttribute("aria-pressed")).toBe("true");
  });

  it("still works when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<LinkEverywhere producer={producer} />);
    fireEvent.click(screen.getByTestId("link-done-whatsapp"));
    expect(screen.getByTestId("link-done-whatsapp").getAttribute("aria-pressed")).toBe("true");
    get.mockRestore();
    set.mockRestore();
  });

  it("renders nothing for a business without a public slug", () => {
    const { container } = render(<LinkEverywhere producer={{ id: "p2" }} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ShareVisitsLine", () => {
  it("is hidden on a payload without the key, and at 0", () => {
    const a = render(<ShareVisitsLine windows={undefined} />);
    expect(a.container.innerHTML).toBe("");
    const b = render(<ShareVisitsLine windows={{ last_7d: 0, last_30d: 0, total: 4 }} />);
    expect(b.container.innerHTML).toBe("");
  });

  it("shows the 30-day count, for one visit and for many", () => {
    const { rerender } = render(<ShareVisitsLine windows={{ last_30d: 1 }} />);
    expect(screen.getByTestId("insights-share-visits").textContent).toContain('share_visits{"count":1}');
    rerender(<ShareVisitsLine windows={{ last_7d: 2, last_30d: 7, total: 9 }} />);
    expect(screen.getByTestId("insights-share-visits").textContent).toContain('share_visits{"count":7}');
  });
});
