/**
 * MEH-3736 — /group-buys starts from the city the user already saved on the
 * site (lib/use-user-city.js), but only when that city has an open group buy:
 * with few groups, a saved city with none would open on an empty list.
 * Typing still filters as before and never writes the saved city.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
const ALL = { open: 3, funded: 0, fulfilled: 0 };
const listCalls = () => api.get.mock.calls.filter(([url, cfg]) => url === "/group-buys" && cfg?.params?.status);

/** counts per city: the saved city's open count decides the seed */
function mockApi(openInSavedCity) {
  api.get.mockImplementation((url, cfg) => {
    if (url === "/group-buys/counts") {
      return Promise.resolve({
        data: cfg?.params?.city ? { open: openInSavedCity, funded: 0, fulfilled: 0 } : ALL,
      });
    }
    return Promise.resolve({ data: [GB] });
  });
}

beforeEach(() => {
  api.get.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe("/group-buys starts from the saved city (MEH-3736)", () => {
  it("a saved city with an open group buy fills the field and filters the list", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    mockApi(1);
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(screen.getByTestId("city-input").value).toBe("זכרון יעקב"));
    await waitFor(() =>
      expect(listCalls().some(([, cfg]) => cfg.params.city === "זכרון יעקב")).toBe(true),
    );
  });

  it("a saved city with no open group buy leaves the field empty (all cities)", async () => {
    localStorage.setItem("user_city", "אילת");
    mockApi(0);
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() =>
      expect(api.get.mock.calls.some(([url, cfg]) => url === "/group-buys/counts" && cfg?.params?.city === "אילת")).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("city-input").value).toBe("");
    expect(listCalls().every(([, cfg]) => !cfg.params.city)).toBe(true);
  });

  it("no saved city: the field stays empty and no city is asked for", async () => {
    mockApi(1);
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("city-input").value).toBe("");
    expect(api.get.mock.calls.every(([, cfg]) => !cfg?.params?.city)).toBe(true);
  });

  it("typing after the seed filters by the typed city and leaves the saved city alone", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    mockApi(1);
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(screen.getByTestId("city-input").value).toBe("זכרון יעקב"));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפ" } });
    await waitFor(() => expect(listCalls().some(([, cfg]) => cfg.params.city === "חיפ")).toBe(true));
    expect(localStorage.getItem("user_city")).toBe("זכרון יעקב");
  });

  it("a user who already typed is not overridden by a late seed answer", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    let release;
    api.get.mockImplementation((url, cfg) => {
      if (url === "/group-buys/counts" && cfg?.params?.city === "זכרון יעקב") {
        return new Promise((r) => {
          release = () => r({ data: { open: 1, funded: 0, fulfilled: 0 } });
        });
      }
      if (url === "/group-buys/counts") return Promise.resolve({ data: ALL });
      return Promise.resolve({ data: [GB] });
    });
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(typeof release).toBe("function"));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("city-input").value).toBe("חיפה");
    expect(listCalls().every(([, c]) => c.params.city !== "זכרון יעקב")).toBe(true);
  });

  it("clearing the seeded field lists all cities again", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    mockApi(1);
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(screen.getByTestId("city-input").value).toBe("זכרון יעקב"));
    const before = listCalls().length;
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "" } });
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
    expect(listCalls().at(-1)[1]).toEqual({ params: { status: "open" } });
  });

  it("an older all-cities answer landing last does not replace the city's list", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    let releaseAll;
    api.get.mockImplementation((url, cfg) => {
      if (url === "/group-buys/counts") {
        return Promise.resolve({ data: cfg?.params?.city ? { open: 1, funded: 0, fulfilled: 0 } : ALL });
      }
      if (cfg?.params?.city) return Promise.resolve({ data: [{ ...GB, id: "gb-city" }] });
      return new Promise((r) => {
        releaseAll = () => r({ data: [{ ...GB, id: "gb-all" }] });
      });
    });
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(screen.getByTestId("group-buy-card").getAttribute("href")).toContain("gb-city"));
    releaseAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("group-buy-card").getAttribute("href")).toContain("gb-city");
  });
});
