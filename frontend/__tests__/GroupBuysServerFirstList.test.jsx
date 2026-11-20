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

  it("a seeded arrival makes no list or count request", async () => {
    render(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    expect(screen.getAllByTestId("group-buy-card")).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(listCalls()).toHaveLength(0);
    expect(countCalls()).toHaveLength(0);
  });

  it("a server failure (null) fetches both, as before", async () => {
    render(<GroupBuysClient initialItems={null} initialCounts={null} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0][1]).toEqual({ params: { status: "open" } });
    expect(countCalls()).toHaveLength(1);
  });

  it("a city typed after arrival fetches that city (the seed is used once)", async () => {
    render(<GroupBuysClient initialItems={[GB]} initialCounts={COUNTS} />);
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    expect(listCalls()[0][1]).toEqual({ params: { status: "open", city: "חיפה" } });
    await waitFor(() => expect(countCalls()).toHaveLength(1));
    expect(countCalls()[0][1]).toEqual({ params: { city: "חיפה" } });
  });

  it("a server empty list renders the empty state without a request", async () => {
    render(<GroupBuysClient initialItems={[]} initialCounts={{ open: 0, funded: 0, fulfilled: 0 }} />);
    expect(screen.getByTestId("group-buys-empty")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(listCalls()).toHaveLength(0);
  });
});
