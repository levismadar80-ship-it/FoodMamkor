/**
 * MEH-2544 — group buys lead with the business's photo (Groupon), a discount
 * badge, and "how many more" progress (Pinduoduo / Kickstarter).
 * Cells — card: photo / no photo / photo fails · discount >0 / 0 · open with
 * N missing / funded. Page: the join card renders ONCE (one quantity field)
 * at every width; photo / no photo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import api from "@/lib/api";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";
import { groupBuyDiscountPct } from "@/lib/group-buy-progress";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key, v) => `${ns}.${key}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, onError }) => <img src={src} alt={alt} data-testid="gb-img" onError={onError} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית רוח השדה",
  producer_image_url: "https://res.cloudinary.com/x/bread.jpg",
  title: "שק קמח כוסמין",
  product_name: "קמח כוסמין",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  city: "זכרון יעקב",
  fulfillment_note: "איסוף מהמאפייה",
  min_participants: 5,
  max_participants: 20,
  commits_count: 2,
  price_per_unit_regular: "18.00",
  price_per_unit_group: "13.00",
  user_committed: false,
  user_commit: null,
};

beforeEach(() => vi.clearAllMocks());

describe("groupBuyDiscountPct", () => {
  it("rounds the saving", () => expect(groupBuyDiscountPct("18.00", "13.00")).toBe(28));
  it("is 0 when there is no real saving or no regular price", () => {
    expect(groupBuyDiscountPct("10", "10")).toBe(0);
    expect(groupBuyDiscountPct("0", "5")).toBe(0);
    expect(groupBuyDiscountPct(null, "5")).toBe(0);
  });
});

describe("group-buy card", () => {
  const renderList = async (items) => {
    api.get.mockResolvedValue({ data: items });
    render(<GroupBuysClient />);
    return screen.findAllByTestId("group-buy-card");
  };

  it("is one link to the group, with the business photo and the discount badge", async () => {
    const [card] = await renderList([GB]);
    expect(card.getAttribute("href")).toBe("/group-buys/gb-1");
    expect(screen.getByTestId("gb-img").getAttribute("src")).toBe(GB.producer_image_url);
    expect(screen.getByTestId("group-buy-discount").textContent).toBe("-28%");
  });

  it("no photo → the cart tile; a photo that fails → the cart tile", async () => {
    await renderList([{ ...GB, producer_image_url: null }, { ...GB, id: "gb-2" }]);
    expect(screen.getAllByTestId("group-buy-image-missing")).toHaveLength(1);
    fireEvent.error(screen.getByTestId("gb-img"));
    expect(screen.getAllByTestId("group-buy-image-missing")).toHaveLength(2);
  });

  it("no saving → no badge", async () => {
    await renderList([{ ...GB, price_per_unit_group: "18.00" }]);
    expect(screen.queryByTestId("group-buy-discount")).toBeNull();
  });

  it("open says how many are missing; funded states the count", async () => {
    await renderList([GB, { ...GB, id: "gb-2", status: "funded", commits_count: 6 }]);
    const lines = screen.getAllByTestId("group-buy-progress-line").map((n) => n.textContent);
    expect(lines[0]).toBe("group_buys.detail.remaining_to_open 3");
    expect(lines[1]).toBe("group_buys.card.progress_label 6 5");
  });
});

describe("group-buy page", () => {
  it("renders the join card once — one quantity field, one share link", async () => {
    api.get.mockResolvedValue({ data: GB });
    render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByText("שק קמח כוסמין");
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getAllByText("group_buys.detail.share_wa")).toHaveLength(1);
    expect(screen.getByTestId("group-buy-discount").textContent).toBe("-28%");
  });

  it("open → «איך זה עובד» with the group's minimum; funded → no box", async () => {
    api.get.mockResolvedValue({ data: GB });
    const { unmount } = render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByText("שק קמח כוסמין");
    const how = screen.getByTestId("group-buy-how");
    expect(how.querySelectorAll("li")).toHaveLength(3);
    expect(how.textContent).toContain(`group_buys.detail.how_unlock ${GB.min_participants}`);
    unmount();
    api.get.mockResolvedValue({ data: { ...GB, status: "funded" } });
    render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByText("שק קמח כוסמין");
    expect(screen.queryByTestId("group-buy-how")).toBeNull();
  });

  it("no business photo → the cart tile", async () => {
    api.get.mockResolvedValue({ data: { ...GB, producer_image_url: null } });
    render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByText("שק קמח כוסמין");
    expect(screen.getByTestId("group-buy-image-missing")).toBeTruthy();
  });
});
