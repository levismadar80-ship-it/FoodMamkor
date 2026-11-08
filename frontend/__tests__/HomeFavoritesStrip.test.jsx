// MEH-2724 — homepage «המועדפים שלך» strip: the strip itself (0 / 1 / many,
// cap, link) and the favorites-cache read it depends on (newest first, a heart
// removed drops the card, one bad row costs one card, logout clears).
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));
vi.mock("@/hooks/useScrollAffordance", () => ({
  default: () => ({ scrollRef: { current: null }, canScrollStart: false, canScrollEnd: false }),
  ScrollArrows: () => null,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={src} />,
}));
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));

import {
  HomeFavoritesStrip,
  FAVORITES_STRIP_MAX,
} from "@/app/[locale]/home/HomeStaticBlocks";
import {
  ensureFavoritesLoaded,
  getFavoriteProducers,
  setFavoritedLocal,
  resetFavoritesCache,
  isFavorited,
  hadFavoritesLastVisit,
} from "@/lib/favorites-cache";

const producer = (i) => ({ id: `p${i}`, name: `עסק ${i}`, city: "בנימינה", slug: `biz-${i}`, images: [] });

describe("HomeFavoritesStrip", () => {
  it("0 favorites → renders nothing", () => {
    const { container } = render(<HomeFavoritesStrip items={[]} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByTestId("home-favorites-strip")).toBeNull();
  });

  it("1 favorite → one card, heading and the all-favorites link", () => {
    render(<HomeFavoritesStrip items={[producer(1)]} />);
    expect(screen.getAllByTestId("home-favorites-card")).toHaveLength(1);
    expect(screen.getByText("home.favorites_strip.heading")).toBeTruthy();
    const all = screen.getByTestId("home-favorites-all");
    expect(all.getAttribute("href")).toBe("/favorites");
    expect(screen.getAllByTestId("home-favorites-card")[0].getAttribute("href")).toBe("/biz-1");
  });

  it("0 favorites + reserve (loading, had favorites) → same-height placeholder, no cards", () => {
    render(<HomeFavoritesStrip items={[]} reserve />);
    const ph = screen.getByTestId("home-favorites-placeholder");
    expect(ph.getAttribute("aria-busy")).toBe("true");
    expect(ph.className).toContain("pt-6 pb-2"); // same section padding as the loaded strip
    expect(screen.queryByTestId("home-favorites-strip")).toBeNull();
    expect(screen.queryAllByTestId("home-favorites-card")).toHaveLength(0);
  });

  // MEH-2743: the server cannot read localStorage, so the placeholder ships
  // hidden and the inline script un-hides it before first paint. Runs the
  // REAL server HTML + script against a real localStorage.
  describe("pre-paint placeholder (server HTML)", () => {
    const paint = () => {
      document.body.innerHTML = renderToString(<HomeFavoritesStrip items={[]} />);
      const script = document.body.querySelector("script");
      expect(script).toBeTruthy();
      const section = script.previousElementSibling;
      // document.currentScript is null for an eval — pass the script element in.
      new Function("document", script.textContent)({ currentScript: script });
      return section;
    };
    beforeEach(() => localStorage.clear());
    afterEach(() => {
      document.body.innerHTML = "";
      localStorage.clear();
    });

    it("server HTML: placeholder hidden by default", () => {
      localStorage.clear();
      const section = paint();
      expect(section.dataset.testid).toBe("home-favorites-placeholder");
      expect(section.hidden).toBe(true);
    });

    it("token + hint → script un-hides it before paint", () => {
      localStorage.setItem("token", "t");
      localStorage.setItem("fav_strip_hint", "1");
      expect(paint().hidden).toBe(false);
    });

    it("hint without a session token → stays hidden", () => {
      localStorage.setItem("fav_strip_hint", "1");
      expect(paint().hidden).toBe(true);
    });

    it("the hint key the script reads is the one the cache writes", async () => {
      localStorage.setItem("token", "t");
      apiGet.mockResolvedValueOnce({ data: [{ producer_id: "p1", producer: producer(1), created_at: "2026-11-01T10:00:00Z" }] });
      resetFavoritesCache();
      await ensureFavoritesLoaded();
      expect(paint().hidden).toBe(false);
      resetFavoritesCache();
    });
  });

  it("items arrive → the real strip replaces the placeholder", () => {
    render(<HomeFavoritesStrip items={[producer(1)]} reserve />);
    expect(screen.queryByTestId("home-favorites-placeholder")).toBeNull();
    expect(screen.getAllByTestId("home-favorites-card")).toHaveLength(1);
  });

  it("many favorites → capped at FAVORITES_STRIP_MAX, in the given order", () => {
    const items = Array.from({ length: FAVORITES_STRIP_MAX + 3 }, (_, i) => producer(i));
    render(<HomeFavoritesStrip items={items} />);
    const cards = screen.getAllByTestId("home-favorites-card");
    expect(cards).toHaveLength(FAVORITES_STRIP_MAX);
    expect(cards[0].textContent).toContain("עסק 0");
  });
});

describe("favorites-cache → getFavoriteProducers", () => {
  beforeEach(() => {
    resetFavoritesCache();
    apiGet.mockReset();
  });

  const row = (i, created_at) => ({ producer_id: `p${i}`, producer: producer(i), created_at });

  it("newest saved first, skips a malformed row, drops an un-hearted one", async () => {
    apiGet.mockResolvedValue({
      data: [
        row(1, "2026-11-01T10:00:00"),
        row(2, "2026-11-05T10:00:00"),
        { producer_id: "p9", producer: { id: "p9" }, created_at: "2026-11-06T10:00:00" }, // no name
        row(3, "2026-11-03T10:00:00"),
      ],
    });
    await ensureFavoritesLoaded();
    expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p2", "p3", "p1"]);

    setFavoritedLocal("p3", false);
    expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("a heart added after the load re-reads the list, so the new card appears", async () => {
    apiGet.mockResolvedValueOnce({ data: [row(1, "2026-11-01T10:00:00")] });
    await ensureFavoritesLoaded();
    apiGet.mockResolvedValueOnce({
      data: [row(1, "2026-11-01T10:00:00"), row(4, "2026-11-06T10:00:00")],
    });
    setFavoritedLocal("p4", true);
    await vi.waitFor(() => expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p4", "p1"]));
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("GET served before the POST commits → retries until the new card appears", async () => {
    vi.useFakeTimers();
    try {
      apiGet.mockResolvedValueOnce({ data: [row(1, "2026-11-01T10:00:00")] });
      await ensureFavoritesLoaded();
      // First refresh still sees the old list (POST not committed yet).
      apiGet.mockResolvedValueOnce({ data: [row(1, "2026-11-01T10:00:00")] });
      apiGet.mockResolvedValueOnce({
        data: [row(1, "2026-11-01T10:00:00"), row(5, "2026-11-06T11:00:00")],
      });
      setFavoritedLocal("p5", true);
      await vi.advanceTimersByTimeAsync(2000);
      expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p5", "p1"]);
      expect(apiGet).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a refresh in flight at logout does not write the old user's rows", async () => {
    apiGet.mockResolvedValueOnce({ data: [row(1, "2026-11-01T10:00:00")] });
    await ensureFavoritesLoaded();
    let release;
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    setFavoritedLocal("p6", true);
    resetFavoritesCache();
    release({ data: [row(1, "2026-11-01T10:00:00"), row(6, "2026-11-06T10:00:00")] });
    await new Promise((r) => setTimeout(r, 0));
    setFavoritedLocal("p1", true); // new session's heart, rows must be empty
    expect(getFavoriteProducers()).toEqual([]);
  });

  it("logout during the INITIAL load → its late response is dropped", async () => {
    let release;
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const p = ensureFavoritesLoaded();
    resetFavoritesCache();
    release({ data: [row(1, "2026-11-01T10:00:00")] });
    await p;
    expect(isFavorited("p1")).toBe(false);
    expect(getFavoriteProducers()).toEqual([]);
  });

  it("heart tapped during the initial load survives the load", async () => {
    let release;
    apiGet.mockReturnValueOnce(new Promise((r) => { release = r; }));
    // The refresh for the mid-load heart, now committed server-side.
    apiGet.mockResolvedValueOnce({
      data: [row(1, "2026-11-01T10:00:00"), row(2, "2026-11-02T10:00:00"), row(7, "2026-11-06T10:00:00")],
    });
    const p = ensureFavoritesLoaded();
    setFavoritedLocal("p7", true); // added mid-load
    setFavoritedLocal("p2", false); // removed mid-load
    release({ data: [row(1, "2026-11-01T10:00:00"), row(2, "2026-11-02T10:00:00")] });
    await p;
    expect(isFavorited("p7")).toBe(true);
    expect(isFavorited("p2")).toBe(false);
    await vi.waitFor(() => expect(getFavoriteProducers().map((x) => x.id)).toEqual(["p7", "p1"]));
  });

  it("a favorite whose row fails validation does not trigger refresh retries", async () => {
    vi.useFakeTimers();
    try {
      const bad = { producer_id: "p9", producer: { id: "p9" }, created_at: "2026-11-06T10:00:00" };
      apiGet.mockResolvedValueOnce({ data: [row(1, "2026-11-01T10:00:00"), bad] });
      await ensureFavoritesLoaded();
      // A new heart: one refresh finds its row; the bad p9 must not keep it retrying.
      apiGet.mockResolvedValue({ data: [row(1, "2026-11-01T10:00:00"), bad, row(4, "2026-11-06T11:00:00")] });
      setFavoritedLocal("p4", true);
      await vi.advanceTimersByTimeAsync(10000);
      expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p4", "p1"]);
      expect(apiGet).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorts by instant, not by string (mixed UTC offsets)", async () => {
    apiGet.mockResolvedValue({
      data: [
        row(1, "2026-11-06T09:30:00Z"), // 11:30 Israel — newer
        row(2, "2026-11-06T11:00:00+02:00"), // 09:00 UTC — older, but larger as text
      ],
    });
    await ensureFavoritesLoaded();
    expect(getFavoriteProducers().map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("strip hint: set after a load with favorites, cleared on logout", async () => {
    apiGet.mockResolvedValue({ data: [row(1, "2026-11-01T10:00:00")] });
    await ensureFavoritesLoaded();
    expect(hadFavoritesLastVisit()).toBe(true);
    resetFavoritesCache();
    expect(hadFavoritesLastVisit()).toBe(false);
  });

  it("strip hint: un-hearting the last favorite clears it", async () => {
    apiGet.mockResolvedValue({ data: [row(1, "2026-11-01T10:00:00")] });
    await ensureFavoritesLoaded();
    setFavoritedLocal("p1", false);
    expect(hadFavoritesLastVisit()).toBe(false);
  });

  it("logout (reset) clears the rows", async () => {
    apiGet.mockResolvedValue({ data: [row(1, "2026-11-01T10:00:00")] });
    await ensureFavoritesLoaded();
    expect(getFavoriteProducers()).toHaveLength(1);
    resetFavoritesCache();
    expect(getFavoriteProducers()).toHaveLength(0);
  });

  it("request fails → empty, no throw", async () => {
    apiGet.mockRejectedValue(new Error("500"));
    await ensureFavoritesLoaded();
    expect(getFavoriteProducers()).toEqual([]);
  });
});
