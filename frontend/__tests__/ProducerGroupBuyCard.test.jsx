/**
 * MEH-2827 PR 7 (boards FinalGroupBuyFlow + FinalGroupBuyLarge, Sapir 08/11).
 *
 * Business page: a SMALL card that is one link with nothing clickable inside;
 * progress in seeds (≤ 10 participants) or a 5-segment bar (> 10); funded fills
 * it; 3 group buys → 2 shown + «הצגת כל קבוצות הרכישה» → 3.
 * Group-buy page: two price tiles with their labels, the same mark, «שתפו»,
 * no wa.me link, no -% pill on the photo.
 *
 * next-intl reads the REAL he.json, so a label assertion fails if the label
 * stops rendering instead of matching a key that would be there either way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  const make = (ns) => {
    const fn = (key, vals) => {
      let s = lookup(ns ? `${ns}.${key}` : key) ?? `${ns}.${key}`;
      if (typeof s === "string" && vals) for (const [k, v] of Object.entries(vals)) s = s.split(`{${k}}`).join(String(v));
      return s;
    };
    fn.rich = fn;
    fn.raw = fn;
    return fn;
  };
  return { useTranslations: make, useLocale: () => "he", useFormatter: () => ({ dateTime: () => "" }) };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, prefetch, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, onError }) => <img src={src} alt={alt} data-testid="gb-img" onError={onError} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "20 בנובמבר 2099" }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }));

import ProducerActivities from "@/app/[locale]/producer/[id]/components/ProducerActivities";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית השדה",
  producer_image_url: "https://res.cloudinary.com/x/bread.jpg",
  title: "מארז לחמי מחמצת",
  product_name: "מארז 3 לחמים",
  unit: "מארז",
  status: "open",
  deadline: "2099-11-20T00:00:00Z",
  city: "זכרון יעקב",
  min_participants: 3,
  max_participants: 20,
  commits_count: 1,
  price_per_unit_regular: "90.00",
  price_per_unit_group: "70.00",
  user_committed: false,
  user_commit: null,
};

function answerList(list) {
  get.mockImplementation((url) => Promise.resolve({ data: url.startsWith("/group-buys") ? list : [] }));
}

beforeEach(() => {
  get.mockReset();
});

describe("business page — the small card", () => {
  it("is ONE link to the group page with nothing clickable inside", async () => {
    answerList([GB]);
    render(<ProducerActivities producerId="p-1" />);
    const card = await screen.findByTestId("producer-group-buy-row");
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/group-buys/gb-1");
    expect(card.querySelectorAll("a, button")).toHaveLength(0);
    expect(card.textContent).toContain("חיסכון של 22% במחיר קבוצתי");
    expect(card.textContent).toContain("עוד 2 לפתיחת המחיר");
    expect(card.textContent).not.toContain("-22%");
  });

  it("≤ 10 participants: one seed per seat, the joined ones filled in the logo order", async () => {
    answerList([GB]);
    render(<ProducerActivities producerId="p-1" />);
    const seeds = await screen.findByTestId("gb-progress-seeds");
    expect(seeds.getAttribute("role")).toBe("img");
    expect(seeds.getAttribute("aria-label")).toBe("1 מתוך 3 הצטרפו");
    const svgs = seeds.querySelectorAll("svg");
    expect(svgs).toHaveLength(3);
    expect([...svgs].map((s) => s.dataset.filled)).toEqual(["true", "false", "false"]);
    expect(svgs[0].querySelector("path").getAttribute("fill")).toBe("#2E6853");
    expect(screen.queryByTestId("gb-progress-bar")).toBeNull();
  });

  it("> 10 participants: five segments, each a fifth of the target, the current one partly filled", async () => {
    answerList([{ ...GB, min_participants: 25, commits_count: 14 }]);
    render(<ProducerActivities producerId="p-1" />);
    const bar = await screen.findByTestId("gb-progress-bar");
    const fills = [...bar.querySelectorAll("[data-fill]")].map((n) => Number(n.dataset.fill));
    expect(fills).toEqual([100, 100, 80, 0, 0]);
    expect(screen.queryByTestId("gb-progress-seeds")).toBeNull();
  });

  it("boundary: 10 seats are seeds, 11 are the bar", async () => {
    answerList([{ ...GB, min_participants: 10, commits_count: 4 }, { ...GB, id: "gb-2", min_participants: 11, commits_count: 4 }]);
    render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(screen.getAllByTestId("producer-group-buy-row")).toHaveLength(2));
    const [ten, eleven] = screen.getAllByTestId("producer-group-buy-row");
    expect(ten.querySelectorAll('[data-testid="gb-progress-seeds"] svg')).toHaveLength(10);
    expect(eleven.querySelector('[data-testid="gb-progress-bar"]')).not.toBeNull();
  });

  it("funded: every seed filled and the strip says the price opened", async () => {
    answerList([{ ...GB, status: "funded", commits_count: 3 }]);
    render(<ProducerActivities producerId="p-1" />);
    const seeds = await screen.findByTestId("gb-progress-seeds");
    expect([...seeds.querySelectorAll("svg")].every((s) => s.dataset.filled === "true")).toBe(true);
    expect(screen.getByTestId("group-buy-progress-line").textContent).toBe("המחיר נפתח!");
  });

  it("3 group buys → 2 cards and «הצגת כל קבוצות הרכישה» → all 3; 2 → no button", async () => {
    answerList([GB, { ...GB, id: "gb-2" }, { ...GB, id: "gb-3" }]);
    const { unmount } = render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(screen.getAllByTestId("producer-group-buy-row")).toHaveLength(2));
    const more = screen.getByTestId("group-buys-show-all");
    expect(more.textContent).toBe("הצגת כל קבוצות הרכישה");
    fireEvent.click(more);
    expect(screen.getAllByTestId("producer-group-buy-row")).toHaveLength(3);
    expect(screen.queryByTestId("group-buys-show-all")).toBeNull();
    unmount();
    answerList([GB, { ...GB, id: "gb-2" }]);
    render(<ProducerActivities producerId="p-1" />);
    await waitFor(() => expect(screen.getAllByTestId("producer-group-buy-row")).toHaveLength(2));
    expect(screen.queryByTestId("group-buys-show-all")).toBeNull();
  });
});

describe("group-buy page — the join card", () => {
  async function renderPage(gb = GB) {
    get.mockResolvedValue({ data: gb });
    const utils = render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByTestId("group-buy-join-card");
    return utils;
  }

  it("two price tiles, each with its label; the saving under them", async () => {
    await renderPage();
    const group = screen.getByTestId("group-buy-price-group");
    const regular = screen.getByTestId("group-buy-price-regular");
    expect(group.textContent).toContain("מחיר קבוצתי");
    expect(group.textContent).toContain("70");
    expect(regular.textContent).toContain("מחיר רגיל");
    expect(regular.textContent).toContain("90");
    expect(screen.getByTestId("group-buy-join-card").textContent).toContain("חיסכון של 22% במחיר קבוצתי");
  });

  it("the same progress mark as the card: seeds ≤ 10, the 5-segment bar > 10", async () => {
    const { unmount } = await renderPage();
    expect(screen.getByTestId("group-buy-progress").querySelector('[data-testid="gb-progress-seeds"]')).not.toBeNull();
    unmount();
    await renderPage({ ...GB, min_participants: 25, commits_count: 14 });
    const bar = screen.getByTestId("group-buy-progress").querySelector('[data-testid="gb-progress-bar"]');
    expect([...bar.querySelectorAll("[data-fill]")].map((n) => Number(n.dataset.fill))).toEqual([100, 100, 80, 0, 0]);
  });

  it("«שתפו» opens the share sheet with the text minus its URL line, and the URL only as url", async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const { container } = await renderPage();
    const btn = screen.getByTestId("group-buy-share");
    expect(btn.textContent).toBe("שתפו");
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
    fireEvent.click(btn);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0];
    expect(payload.url).toBe(`${window.location.origin}${window.location.pathname}`);
    expect(payload.text).not.toMatch(/https?:\/\//);
    expect(payload.text).toContain("מארז לחמי מחמצת");
  });

  it("up to 5 seats sit beside the count; 6–10 stack under it, shrinking to fit", async () => {
    const { unmount } = await renderPage();
    const box = screen.getByTestId("group-buy-progress");
    expect(box.firstElementChild.className).toContain("justify-between");
    unmount();
    await renderPage({ ...GB, min_participants: 10, commits_count: 4 });
    const seeds = screen.getByTestId("group-buy-progress").querySelector('[data-testid="gb-progress-seeds"]');
    expect(seeds.className).toContain("w-full");
    expect(seeds.querySelectorAll("svg")).toHaveLength(10);
    expect(seeds.querySelector("svg").getAttribute("class")).toContain("max-w-[30px]");
  });

  it("target reached but not yet funded: no «עוד 0», the count stays", async () => {
    await renderPage({ ...GB, commits_count: 3 });
    const box = screen.getByTestId("group-buy-progress");
    expect(box.textContent).not.toContain("עוד 0");
    expect(box.textContent).toContain("3 מתוך 3 הצטרפו");
  });

  it("no -% pill on the photo", async () => {
    await renderPage();
    expect(screen.getByTestId("gb-img")).toBeTruthy();
    expect(screen.queryByTestId("group-buy-discount")).toBeNull();
  });
});
