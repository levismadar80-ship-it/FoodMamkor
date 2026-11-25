/**
 * MEH-3736 → MEH-3857 — /group-buys and the city the user saved on the site
 * (lib/use-user-city.js). Since MEH-3857 (Sapir, 25/11) the saved city is
 * OFFERED as the one option of the empty city field when it is focused; it is
 * no longer filled in after the load, which changed the field and the status
 * chips a moment after the first paint (staging, iPhone, 25/11).
 * Typing still filters as before and never writes the saved city.
 * The real CitySearch is rendered: the suggestion is its behaviour.
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
const ALL = { open: 3, funded: 1, fulfilled: 1 };
const listCalls = () => api.get.mock.calls.filter(([url, cfg]) => url === "/group-buys" && cfg?.params?.status);
const cityAsked = () => api.get.mock.calls.some(([, cfg]) => cfg?.params?.city);
const field = () => screen.getByRole("combobox");
const options = () => screen.queryAllByRole("option");
const settle = () => new Promise((r) => setTimeout(r, 20));

function mockApi() {
  api.get.mockImplementation((url, cfg) => {
    if (url === "/cities") return Promise.resolve({ data: [] });
    if (url === "/group-buys/counts") {
      return Promise.resolve({ data: cfg?.params?.city ? { open: 1, funded: 0, fulfilled: 0 } : ALL });
    }
    return Promise.resolve({ data: [GB] });
  });
}

beforeEach(() => {
  api.get.mockReset();
  localStorage.clear();
  mockApi();
});
afterEach(cleanup);

describe("/group-buys offers the saved city, never fills it in (MEH-3857)", () => {
  it("a saved city leaves the field empty after the load and asks for no city", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(listCalls()).toHaveLength(1));
    await settle();
    expect(field().value).toBe("");
    expect(cityAsked()).toBe(false);
  });

  it("focusing the empty field offers the saved city as its only option", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await settle();
    fireEvent.focus(field());
    expect(options().map((o) => o.textContent)).toEqual(["זכרון יעקב"]);
  });

  it("picking the offered city filters the list by it", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await settle();
    fireEvent.focus(field());
    fireEvent.mouseDown(options()[0]);
    expect(field().value).toBe("זכרון יעקב");
    await waitFor(() =>
      expect(listCalls().some(([, cfg]) => cfg.params.city === "זכרון יעקב")).toBe(true),
    );
  });

  it("no saved city: focusing the empty field offers nothing", async () => {
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await settle();
    fireEvent.focus(field());
    expect(options()).toHaveLength(0);
    expect(cityAsked()).toBe(false);
  });

  it("typing filters by the typed city and leaves the saved city alone", async () => {
    localStorage.setItem("user_city", "זכרון יעקב");
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await settle();
    fireEvent.change(field(), { target: { value: "חיפ" } });
    await waitFor(() => expect(listCalls().some(([, cfg]) => cfg.params.city === "חיפ")).toBe(true));
    expect(localStorage.getItem("user_city")).toBe("זכרון יעקב");
  });

  it("an older all-cities answer landing last does not replace the city's list", async () => {
    let releaseAll;
    api.get.mockImplementation((url, cfg) => {
      if (url === "/cities") return Promise.resolve({ data: [] });
      if (url === "/group-buys/counts") {
        return Promise.resolve({ data: cfg?.params?.city ? { open: 1, funded: 0, fulfilled: 0 } : ALL });
      }
      if (cfg?.params?.city) return Promise.resolve({ data: [{ ...GB, id: "gb-city" }] });
      return new Promise((r) => {
        releaseAll = () => r({ data: [{ ...GB, id: "gb-all" }] });
      });
    });
    render(<GroupBuysClient initialItems={[GB]} initialCounts={ALL} />);
    await waitFor(() => expect(typeof releaseAll).toBe("function"));
    fireEvent.change(field(), { target: { value: "זכרון יעקב" } });
    await waitFor(() => expect(screen.getByTestId("group-buy-card").getAttribute("href")).toContain("gb-city"));
    releaseAll();
    await settle();
    expect(screen.getByTestId("group-buy-card").getAttribute("href")).toContain("gb-city");
  });
});
