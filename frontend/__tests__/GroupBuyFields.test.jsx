/**
 * MEH-2472 (audit MEH-2470 findings 3 + 6) — a group buy's product name is
 * shown to the public, and the detail page links to the business.
 * Cells: product_name present / absent; producer_id present / absent.
 * Harness: GroupBuyCommit422.test.jsx (detail) — the list mounts the real
 * GroupBuysClient with the api mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import api from "@/lib/api";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key, v) => `${key}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "משק הגליל",
  title: "ארגז חורף",
  product_name: "ארגז ירקות אורגני",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 0,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: false,
  user_commit: null,
};

beforeEach(() => vi.clearAllMocks());

describe("MEH-2472 — group buy detail", () => {
  it("shows the product name and links the business name to its page", async () => {
    api.get.mockResolvedValue({ data: GB });
    render(<GroupBuyDetailClient id="gb-1" />);
    expect(await screen.findByTestId("group-buy-product-name")).toHaveTextContent("ארגז ירקות אורגני");
    const link = screen.getByTestId("group-buy-producer-link");
    expect(link.getAttribute("href")).toBe("/producer/p-1");
    expect(link.textContent).toContain("משק הגליל");
  });

  it("no product name → no line; no producer_id → the name stays text", async () => {
    api.get.mockResolvedValue({ data: { ...GB, product_name: null, producer_id: null } });
    render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByText("ארגז חורף");
    expect(screen.queryByTestId("group-buy-product-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-buy-producer-link")).not.toBeInTheDocument();
    expect(screen.getByText(/משק הגליל/)).toBeInTheDocument();
  });
});

describe("MEH-2472 — group buy card", () => {
  it("each card shows its product name; a card without one shows none", async () => {
    api.get.mockResolvedValue({
      data: [GB, { ...GB, id: "gb-2", title: "שמן זית", product_name: null }],
    });
    render(<GroupBuysClient />);
    const names = await screen.findAllByTestId("group-buy-product-name");
    expect(names).toHaveLength(1);
    expect(names[0]).toHaveTextContent("ארגז ירקות אורגני");
  });
});
