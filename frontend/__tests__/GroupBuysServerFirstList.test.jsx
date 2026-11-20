/**
 * MEH-2233 — /group-buys renders its first list on the server. The page reads
 * status «open» with no city (and its tab counts) at build/ISR time; the client
 * uses that once and fetches every later list as before. null = fetch, as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";
import api from "@/lib/api";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt="" {...props} /> }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange }) => (
    <input data-testid="city-input" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית רוח השדה",
  producer_image_url: null,
  title: "שק קמח כוסמין",
  product_name: "קמח כוסמין",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  city: "זכרון יעקב",
  fulfillment_note: null,
  min_participants: 5,
  max_participants: 20,
  commits_count: 2,
  price_per_unit_regular: "18.00",
  price_per_unit_group: "13.00",
  user_committed: false,
  user_commit: null,
};
const COUNTS = { open: 1, funded: 0, fulfilled: 0 };
// The list request carries ?status=; a bare "/group-buys" is the hub tab row's
// own any-items probe (lib/use-hub-nav-gate.js), which this change leaves alone.
const listCalls = () => api.get.mock.calls.filter(([url, cfg]) => url === "/group-buys" && cfg?.params?.status);
const countCalls = () => api.get.mock.calls.filter(([url]) => url === "/group-buys/counts");

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/group-buys/counts" ? COUNTS : [{ ...GB, id: "gb-from-client" }] }),
  );
});
afterEach(cleanup);

describe("/group-buys server-first list (MEH-2233)", () => {
  it("the server HTML holds the cards, not the skeleton", () => {
    const html = renderToString(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    expect(html).toContain('data-testid="group-buy-card"');
    expect(html).toContain("קמח כוסמין");
  });

  it("without server data the server HTML is the skeleton, as before", () => {
    const html = renderToString(<GroupBuysClient />);
    expect(html).not.toContain('data-testid="group-buy-card"');
  });

  it("a seeded arrival shows the server's cards, then refreshes them without the skeleton", async () => {
    render(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    expect(screen.getAllByTestId("group-buy-card")).toHaveLength(1);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0][1]).toEqual({ params: { status: "open" } });
    expect(countCalls()).toHaveLength(1);
    // the fresh answer replaces the cached one (a Back replays an old list)
    await waitFor(() => expect(screen.getByTestId("group-buy-card").getAttribute("href")).toContain("gb-from-client"));
  });

  it("a failed quiet refresh keeps the server's cards, with no error state", async () => {
    api.get.mockImplementation(() => Promise.reject(new Error("offline")));
    render(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    // the error state would replace the cards
    expect(screen.getAllByTestId("group-buy-card")).toHaveLength(1);
  });

  it("a server failure (null) fetches both, as before", async () => {
    render(<GroupBuysClient initialItems={null} initialCounts={null} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0][1]).toEqual({ params: { status: "open" } });
    expect(countCalls()).toHaveLength(1);
  });

  it("a city typed after arrival fetches that city (the seed is used once)", async () => {
    render(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1)); // the quiet refresh
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(listCalls()[1][1]).toEqual({ params: { status: "open", city: "חיפה" } });
    await waitFor(() => expect(countCalls()).toHaveLength(2));
    expect(countCalls()[1][1]).toEqual({ params: { city: "חיפה" } });
  });

  it("a server empty list renders the empty state at once", () => {
    const html = renderToString(<GroupBuysClient initialItems={[]} initialCounts={{ open: 0, funded: 0, fulfilled: 0 }} />);
    expect(html).toContain('data-testid="group-buys-empty"');
  });
});
