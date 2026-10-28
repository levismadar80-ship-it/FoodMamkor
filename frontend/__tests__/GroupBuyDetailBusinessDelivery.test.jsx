/**
 * MEH-2453 (MEH-2435 chunk 5) — the public group page links the business and
 * answers "מגיעים אלייך?" from the business's own delivery data.
 *
 * A participant from another city needs two things before she joins: who the
 * business is (its page shows pickup points and areas) and whether it delivers
 * to her. The page fetches the public GET /producers/{id} once per group and
 * validates the delivery subset with Zod (rule 19) before using it.
 *
 * Cells: producer fetch ok / fails / returns a malformed body × business that
 * delivers to listed cities / nationwide with exclusions / does not deliver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key, vals) =>
    vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));
// The checker seeds from the saved city; none saved here.
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ city: null }) }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית שקד",
  title: "מארז לחמים",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 5,
  max_participants: null,
  commits_count: 1,
  price_per_unit_regular: "100.00",
  price_per_unit_group: "80.00",
  fulfillment_note: "איסוף מחדרה ביום שישי",
  user_committed: false,
  user_commit: null,
};

const producer = (over = {}) => ({
  id: "p-1",
  name: "מאפיית שקד",
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_excluded_cities: [],
  delivery_areas: [{ id: "a1", city: "חדרה", min_order: 100, delivery_day: "שישי" }],
  ...over,
});

const fixture = { producer: null, producerError: null };
const defaultGet = (url) => {
  if (url === "/group-buys/gb-1") return Promise.resolve({ data: { ...GB, ...fixture.gb } });
  if (url === "/producers/p-1") {
    return fixture.producerError
      ? Promise.reject(fixture.producerError)
      : Promise.resolve({ data: fixture.producer });
  }
  return Promise.reject(new Error(`unexpected GET ${url}`));
};
const get = vi.fn(defaultGet);
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }));

const by = (name) => `group_buys.detail.by_producer:${JSON.stringify({ name })}`;

async function renderPage() {
  render(<GroupBuyDetailClient id="gb-1" />);
  await screen.findByText(GB.title);
}

beforeEach(() => {
  get.mockClear();
  get.mockImplementation(defaultGet);
  fixture.producer = producer();
  fixture.producerError = null;
  fixture.gb = {};
});

describe("the business link", () => {
  it("links the business name to its page", async () => {
    await renderPage();
    const link = await screen.findByRole("link", { name: by(GB.producer_name) });
    expect(link).toHaveAttribute("href", "/producer/p-1");
  });

  it("stays plain text when the business page cannot be fetched", async () => {
    fixture.producerError = { response: { status: 404 } };
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    expect(screen.getByText(by(GB.producer_name)).closest("a")).toBeNull();
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });

  it("stays plain text, with no checker, when the body fails validation", async () => {
    fixture.producer = producer({ delivery_areas: "חדרה" });
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    expect(screen.getByText(by(GB.producer_name)).closest("a")).toBeNull();
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });

  it("fetches nothing when the group carries no producer id", async () => {
    fixture.gb = { producer_id: null };
    await renderPage();
    expect(get).not.toHaveBeenCalledWith("/producers/null");
    expect(get.mock.calls.filter(([u]) => u.startsWith("/producers/"))).toHaveLength(0);
  });
});

describe("moving to another group", () => {
  it("drops the previous business before the next one loads", async () => {
    const { rerender } = render(<GroupBuyDetailClient id="gb-1" />);
    await screen.findByRole("link", { name: by(GB.producer_name) });
    // The second group belongs to another business whose fetch never settles.
    get.mockImplementation((url) => {
      if (url === "/group-buys/gb-2") {
        return Promise.resolve({ data: { ...GB, id: "gb-2", producer_id: "p-2", producer_name: "רפת הגליל" } });
      }
      if (url === "/producers/p-2") return new Promise(() => {});
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    rerender(<GroupBuyDetailClient id="gb-2" />);
    await screen.findByText(by("רפת הגליל"));
    expect(screen.queryByRole("link", { name: by("רפת הגליל") })).toBeNull();
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });
});

describe("«מגיעים אלייך?» on the group page", () => {
  it("shows for a business that delivers to listed cities", async () => {
    await renderPage();
    expect(await screen.findByTestId("delivery-checker")).toBeInTheDocument();
  });

  it("shows for a nationwide business with exclusions", async () => {
    fixture.producer = producer({
      delivery_nationwide: true,
      delivery_areas: [],
      delivery_excluded_cities: ["אילת"],
    });
    await renderPage();
    expect(await screen.findByTestId("delivery-checker")).toBeInTheDocument();
  });

  it("is absent for a business with no delivery (pickup only)", async () => {
    fixture.producer = producer({ offers_delivery: false, delivery_areas: [] });
    await renderPage();
    await screen.findByRole("link", { name: by(GB.producer_name) });
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });

  it("fetches the business once, not on every 30-second refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderPage();
      await screen.findByTestId("delivery-checker");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      // Let the refreshed group commit and any effect it triggers run.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      const calls = (u) => get.mock.calls.filter(([url]) => url === u).length;
      // The refresh did run (control), and it did not refetch the business.
      expect(calls("/group-buys/gb-1")).toBe(2);
      expect(calls("/producers/p-1")).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
