/**
 * MEH-3128 — a /group-buys status tab with nothing in it (for the chosen city)
 * is not drawn; the selected tab always is; a failed count shows every tab.
 * Counts come from GET /group-buys/counts (same query as the list, backend
 * tests/test_meh3128_group_buy_counts.py).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";
import api from "@/lib/api";

const NS = "group_buys.list";
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
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
// per city: { [city|""]: {open, funded, fulfilled} | "fail" | () => Promise }, or "fail"
let counts = null;
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url, config = {}) => {
      if (url === "/group-buys/counts") {
        if (counts === "fail") return Promise.reject(new Error("down"));
        const c = counts[config.params?.city ?? ""];
        if (c === "fail") return Promise.reject(new Error("down"));
        if (typeof c === "function") return c();
        return Promise.resolve({ data: c });
      }
      return Promise.resolve({ data: [] });
    }),
  },
}));

const tabs = () =>
  ["status_open", "status_funded", "status_fulfilled"].filter((k) => screen.queryByText(`${NS}.${k}`));

beforeEach(() => api.get.mockClear());
afterEach(cleanup);

describe("/group-buys status tabs hide when empty (MEH-3128)", () => {
  it("many with rows → those; a 0 tab is not drawn", async () => {
    counts = { "": { open: 3, funded: 0, fulfilled: 2 } };
    render(<GroupBuysClient />);
    await waitFor(() => expect(tabs()).toEqual(["status_open", "status_fulfilled"]));
  });

  it("the selected tab stays even at 0", async () => {
    counts = { "": { open: 0, funded: 1, fulfilled: 0 } };
    render(<GroupBuysClient />);
    await waitFor(() => expect(tabs()).toEqual(["status_open", "status_funded"]));
  });

  it("the city decides", async () => {
    counts = { "": { open: 1, funded: 1, fulfilled: 1 }, "חיפה": { open: 1, funded: 0, fulfilled: 0 } };
    render(<GroupBuysClient />);
    await waitFor(() => expect(tabs()).toEqual(["status_open", "status_funded", "status_fulfilled"]));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(tabs()).toEqual(["status_open"]));
    expect(api.get).toHaveBeenCalledWith("/group-buys/counts", { params: { city: "חיפה" } });
  });

  it("counts failed → every tab, as before (fail open)", async () => {
    counts = "fail";
    render(<GroupBuysClient />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/group-buys/counts", { params: {} }));
    expect(tabs()).toEqual(["status_open", "status_funded", "status_fulfilled"]);
  });

  it("a failure after a good count shows every tab again (not the old city's set)", async () => {
    counts = { "": { open: 1, funded: 0, fulfilled: 0 }, "חיפה": "fail" };
    render(<GroupBuysClient />);
    await waitFor(() => expect(tabs()).toEqual(["status_open"]));
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(tabs()).toEqual(["status_open", "status_funded", "status_fulfilled"]));
  });

  it("a late answer for an older city does not overwrite the current one", async () => {
    let releaseOld;
    const old = new Promise((r) => { releaseOld = () => r({ data: { open: 1, funded: 1, fulfilled: 1 } }); });
    counts = { "": () => old, "חיפה": { open: 1, funded: 0, fulfilled: 0 } };
    render(<GroupBuysClient />);
    fireEvent.change(screen.getByTestId("city-input"), { target: { value: "חיפה" } });
    await waitFor(() => expect(tabs()).toEqual(["status_open"]));
    releaseOld();
    await old;
    await new Promise((r) => setTimeout(r, 0));
    expect(tabs()).toEqual(["status_open"]);
  });
});
