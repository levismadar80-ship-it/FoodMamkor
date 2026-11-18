import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import FeedPostCanvas from "@/components/producer/FeedPostCanvas";
import { itemsLine, priceLabel, trackedLink, weekItems, WEEK_ITEMS_MAX } from "@/lib/share-post";

// MEH-3330 — the 4:5 feed post in the owner's share kit.
// Products count states: 0 (empty state + link to the price list) / 1 / many
// (capped at WEEK_ITEMS_MAX). The holiday moment exists only while a holiday is
// near. The product picker is a reveal: closed on «מה יש השבוע», open on
// «מוצר חדש» with 2+ products, and absent with exactly 1.

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const holidayMock = vi.hoisted(() => ({ value: null }));
vi.mock("@/lib/holidays", () => ({ getUpcomingHoliday: () => holidayMock.value }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => `${ns}.${k}${v ? JSON.stringify(v) : ""}`,
}));

beforeAll(() => {
  const ctxStub = new Proxy(
    { measureText: () => ({ width: 0 }), createLinearGradient: () => ({ addColorStop: () => {} }) },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  HTMLCanvasElement.prototype.getContext = () => ctxStub;
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,AAAA";
});

const producer = { id: "p1", name: "מאפיית טסט", city: "חיפה", slug: "test-bakery", images: [], categories: [] };
const product = (id, name, price) => ({ id, name, price_min: price, price_max: price });

describe("lib/share-post", () => {
  it("lists at most WEEK_ITEMS_MAX products, in the order given", () => {
    const many = [1, 2, 3, 4, 5].map((n) => product(`id${n}`, `p${n}`, n));
    expect(weekItems(many).map((p) => p.name)).toEqual(["p1", "p2", "p3"]);
    expect(WEEK_ITEMS_MAX).toBe(3);
    expect(weekItems([])).toEqual([]);
  });
  it("reads a price from min/max, else from a price label with a digit, else nothing", () => {
    expect(priceLabel(product("a", "x", 28))).toBe("28₪");
    expect(priceLabel({ name: "x", price_range: "₪₪" })).toBe("");
    expect(priceLabel({ name: "x", price_range: "45₪/ק״ג" })).toBe("45₪/ק״ג");
  });
  it("tags the link with from=share so the visit is counted, plus utm source/medium", () => {
    const url = new URL(trackedLink("test-bakery", "instagram"));
    expect(url.pathname).toBe("/p/test-bakery");
    expect(url.searchParams.get("from")).toBe("share");
    expect(url.searchParams.get("utm_source")).toBe("instagram");
    expect(url.searchParams.get("utm_medium")).toBe("owner_share");
  });
  it("writes a product without a price by name only", () => {
    expect(itemsLine([product("a", "לחם", 28), { name: "עוגה" }])).toBe("לחם (28₪), עוגה");
  });
});

describe("FeedPostCanvas", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    holidayMock.value = null;
  });

  it("0 products: empty state with a link to the price list, no canvas", async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    render(<FeedPostCanvas producer={producer} />);
    const empty = await screen.findByTestId("feed-post-empty");
    expect(empty.querySelector("a").getAttribute("href")).toBe("/producer/dashboard/edit#products");
    expect(screen.queryByTestId("feed-post-canvas")).toBeNull();
    expect(apiMock.get).toHaveBeenCalledWith("/producers/me/products");
  });

  it("a failed load says so and offers a retry that fetches again", async () => {
    apiMock.get.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce({ data: [product("a", "לחם", 28)] });
    render(<FeedPostCanvas producer={producer} />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/ }));
    expect(await screen.findByTestId("feed-post-canvas")).toBeTruthy();
    expect(apiMock.get).toHaveBeenCalledTimes(2);
  });

  it("1 product: week caption lists it; «מוצר חדש» shows no picker", async () => {
    apiMock.get.mockResolvedValue({ data: [product("a", "לחם", 28)] });
    render(<FeedPostCanvas producer={producer} />);
    const caption = await screen.findByTestId("feed-post-caption");
    expect(caption.textContent).toContain("caption_week");
    expect(caption.textContent).toContain("לחם (28₪)");
    expect(caption.textContent).toContain("from=share");
    fireEvent.click(screen.getByTestId("feed-post-moment-new"));
    expect(screen.queryByTestId("feed-post-product")).toBeNull();
    expect(screen.getByTestId("feed-post-caption").textContent).toContain('caption_new{"item":"לחם"}');
  });

  it("many products: the week caption carries only the first three; the picker opens on «מוצר חדש»", async () => {
    apiMock.get.mockResolvedValue({ data: [1, 2, 3, 4].map((n) => product(`id${n}`, `מוצר${n}`, n)) });
    render(<FeedPostCanvas producer={producer} />);
    const caption = await screen.findByTestId("feed-post-caption");
    expect(caption.textContent).toContain("מוצר3");
    expect(caption.textContent).not.toContain("מוצר4");
    expect(screen.queryByTestId("feed-post-product")).toBeNull();
    fireEvent.click(screen.getByTestId("feed-post-moment-new"));
    fireEvent.change(screen.getByTestId("feed-post-product"), { target: { value: "id4" } });
    expect(screen.getByTestId("feed-post-caption").textContent).toContain('"item":"מוצר4"');
  });

  it("the holiday moment exists only while a holiday is near", async () => {
    apiMock.get.mockResolvedValue({ data: [product("a", "לחם", 28)] });
    const { unmount } = render(<FeedPostCanvas producer={producer} />);
    await screen.findByTestId("feed-post-caption");
    expect(screen.queryByTestId("feed-post-moment-holiday")).toBeNull();
    unmount();
    holidayMock.value = { key: "chanuka" };
    render(<FeedPostCanvas producer={producer} />);
    fireEvent.click(await screen.findByTestId("feed-post-moment-holiday"));
    await waitFor(() => expect(screen.getByTestId("feed-post-caption").textContent).toContain("caption_holiday"));
  });
});

describe("drawPost — a superseded draw does not paint (MEH-3330 review)", () => {
  it("returns null and leaves the canvas untouched when isCurrent() turns false while loading", async () => {
    const { drawPost } = await import("@/components/producer/feed-post-draw");
    const canvas = document.createElement("canvas");
    canvas.width = 7;
    const content = { kind: "list", kicker: "k", items: [] };
    const stale = await drawPost(canvas, producer, content, { footer: "f", isCurrent: () => false });
    expect(stale).toBeNull();
    expect(canvas.width).toBe(7);
    const fresh = await drawPost(canvas, producer, content, { footer: "f", isCurrent: () => true });
    expect(fresh).toBe(true);
    expect(canvas.width).toBe(1080);
  });
});
