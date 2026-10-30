/**
 * MEH-2453 (MEH-2435 chunk 5) — the public group page answers «מגיעים אלייך?»
 * from the business's own delivery data.
 *
 * A participant from another city needs to know, before she joins, whether the
 * product reaches her. The page fetches the public GET /producers/{id} once per
 * group and validates the delivery subset with Zod (rule 19) before using it.
 * (The «מאת {name}» link to the business page is MEH-2472's, tested in
 * GroupBuyFields.test.jsx.)
 *
 * Cells: producer fetch ok / fails / returns a malformed body × business that
 * delivers to listed cities / nationwide with exclusions / does not deliver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

// MEH-2544: the page's business row is OwnerRow, which links via @/i18n/navigation.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a) => captureMessage(...a) }));
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
  captureMessage.mockReset();
  fixture.producer = producer();
  fixture.producerError = null;
  fixture.gb = {};
});

// The «מאת {name}» link itself is MEH-2472's (GroupBuyFields.test.jsx); these
// cover the business fetch that feeds the checker.
describe("the business fetch", () => {
  it("a failed fetch leaves no checker (and the page still renders)", async () => {
    fixture.producerError = { response: { status: 404 } };
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });

  it("a body that fails validation leaves no checker", async () => {
    fixture.producer = producer({ delivery_areas: "חדרה" });
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
  });

  // MEH-2491: ...and says so, rather than hiding the checker in silence.
  it("a body that fails validation is reported as a warning", async () => {
    fixture.producer = producer({ delivery_areas: "חדרה" });
    await renderPage();
    await waitFor(() => expect(captureMessage).toHaveBeenCalledTimes(1));
    expect(captureMessage.mock.calls[0][1].level).toBe("warning");
  });

  it("a valid body reports nothing", async () => {
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("fetches nothing when the group carries no producer id", async () => {
    fixture.gb = { producer_id: null };
    await renderPage();
    expect(get.mock.calls.filter(([u]) => u.startsWith("/producers/"))).toHaveLength(0);
  });
});

describe("moving to another group", () => {
  it("drops the previous business before the next one loads", async () => {
    const { rerender } = render(<GroupBuyDetailClient id="gb-1" />);
    // Control: the first business's checker is on screen.
    await screen.findByTestId("delivery-checker");
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
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    await act(async () => {});
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

// MEH-2615: pickup and delivery are one titled section — the business's note
// and «מגיעים אלייך?» under one heading — and the business row comes after it.
// Cells: note × checker shown / hidden (pickup only) / no note.
describe("the pickup and delivery section", () => {
  const TITLE = "group_buys.detail.fulfillment_title";

  it("holds the heading, the note and the checker, with the business row after it", async () => {
    await renderPage();
    const section = screen.getByTestId("group-buy-fulfillment");
    const checker = await screen.findByTestId("delivery-checker");
    expect(section.querySelector("h2").textContent).toBe(TITLE);
    expect(section.textContent).toContain(GB.fulfillment_note);
    expect(section.contains(checker)).toBe(true);
    const row = screen.getByTestId("group-buy-producer-link");
    expect(section.contains(row)).toBe(false);
    // DOCUMENT_POSITION_FOLLOWING: the business row is later in reading order.
    expect(section.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the heading and note when the checker hides itself (pickup only)", async () => {
    fixture.producer = producer({ offers_delivery: false, delivery_areas: [] });
    await renderPage();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/p-1"));
    await act(async () => {});
    expect(screen.queryByTestId("delivery-checker")).toBeNull();
    expect(screen.getByRole("heading", { name: TITLE })).toBeInTheDocument();
    expect(screen.getByTestId("group-buy-fulfillment-note").textContent).toBe(GB.fulfillment_note);
  });

  it("without a note: no heading over the checker alone", async () => {
    fixture.gb = { fulfillment_note: null };
    await renderPage();
    const checker = await screen.findByTestId("delivery-checker");
    expect(screen.getByTestId("group-buy-fulfillment").contains(checker)).toBe(true);
    expect(screen.queryByRole("heading", { name: TITLE })).toBeNull();
  });
});
