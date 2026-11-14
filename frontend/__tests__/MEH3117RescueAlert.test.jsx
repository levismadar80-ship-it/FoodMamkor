/**
 * MEH-3117 — the follower alert for rescue bags, and the way out of an empty
 * hub tab. Real he.json copy, so a wording drift against the approved table
 * (Sapir 14/11, rows 1, 4, 5, 6) fails here.
 *
 * Cells covered (5-state rule): rescue list 0 → hint, 1 → no hint;
 * group buys 0 → hint, many → no hint; prefs row present with the pilot on,
 * absent with it off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, phone: "0500000000" }, updateProfile: vi.fn() }),
}));
const fetchOffers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rescue", async (importOriginal) => ({ ...(await importOriginal()), fetchOffers }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/HubShell", () => ({ default: () => null }));

const wrap = (ui) => (
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    {ui}
  </NextIntlClientProvider>
);

const H = he.hub_alert_hint;

describe("approved copy (MEH-3117 table)", () => {
  it("rows 1, 4, 5, 6 are word for word", () => {
    expect(he.sweep_tail.alert_prefs.row_new_rescue).toBe("סלי הפתעה");
    expect(H.rescue).toBe("רוצים לדעת כשיש? שמרו בית עסק ובחרו התראה על סלי הפתעה.");
    expect(H.cta).toBe("לבתי העסק");
    expect(H.group_buys).toBe("רוצים לדעת כשנפתחת קבוצה? שמרו בית עסק ובחרו התראה על קבוצות רכישה.");
  });
});

describe("/rescue list", () => {
  let RescueList;
  beforeEach(async () => {
    fetchOffers.mockReset();
    ({ default: RescueList } = await import("@/components/rescue/RescueList"));
  });

  it("0 bags: the hint and a button to the business list", async () => {
    fetchOffers.mockResolvedValue([]);
    render(wrap(<RescueList />));
    const hint = await screen.findByTestId("hub-alert-hint-rescue");
    expect(hint.textContent).toContain(H.rescue);
    const link = screen.getByText(H.cta).closest("a");
    expect(link.getAttribute("href")).toBe("/producers");
  });

  it("a failed fetch is not empty: no hint", async () => {
    fetchOffers.mockRejectedValue(new Error("net"));
    render(wrap(<RescueList />));
    await screen.findByTestId("rescue-list-error");
    expect(screen.queryByTestId("hub-alert-hint-rescue")).toBeNull();
  });
});

describe("/group-buys", () => {
  let GroupBuysClient;
  beforeEach(async () => {
    api.get.mockReset();
    ({ default: GroupBuysClient } = await import("@/app/[locale]/group-buys/GroupBuysClient"));
  });

  it("0 groups: the hint under the empty state", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(wrap(<GroupBuysClient />));
    const empty = await screen.findByTestId("group-buys-empty");
    expect(empty.querySelector('[data-testid="hub-alert-hint-group_buys"]').textContent).toContain(H.group_buys);
  });

  it("groups listed: no hint", async () => {
    const gb = (id) => ({
      id, producer_id: "p1", producer_name: "מאפייה", title: "קמח", product_name: "קמח", unit: "ק״ג",
      status: "open", price_per_unit_group: 8, price_per_unit_regular: 10, min_participants: 3,
      commits_count: 1, deadline: new Date(Date.now() + 864e5 * 5).toISOString(), city: "חיפה",
    });
    api.get.mockResolvedValue({ data: [gb("a"), gb("b")] });
    render(wrap(<GroupBuysClient />));
    await waitFor(() => expect(screen.getAllByTestId("group-buy-card").length).toBe(2));
    expect(screen.queryByTestId("hub-alert-hint-group_buys")).toBeNull();
  });
});

describe("AlertPrefsPanel — rescue row", () => {
  const original = process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED;
  afterEach(() => {
    process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED = original;
  });
  const ROW = he.sweep_tail.alert_prefs.row_new_rescue;

  const renderPanel = async () => {
    const { default: AlertPrefsPanel } = await import("@/components/AlertPrefsPanel");
    render(wrap(<AlertPrefsPanel producerId="p1" producerName="מאפיית הכפר" />));
    await screen.findByText(he.sweep_tail.alert_prefs.row_new_group_buy);
  };

  it("pilot on: the row is last in «what», on by default, and is saved", async () => {
    process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED = "true";
    api.get.mockResolvedValue({ data: { enabled: false } });
    api.put.mockResolvedValue({ data: {} });
    await renderPanel();
    const labels = [...document.querySelectorAll("label")].map((l) => l.textContent.trim());
    expect(labels[labels.indexOf(he.sweep_tail.alert_prefs.row_new_group_buy) + 1]).toBe(ROW);
    const sw = screen.getByText(ROW).closest("label").querySelector('[role="switch"]');
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    fireEvent.click(screen.getByText(he.sweep_tail.alert_prefs.save_cta));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toMatchObject({ notify_new_rescue: false });
  });

  it("pilot off: no rescue row", async () => {
    process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED = "false";
    api.get.mockResolvedValue({ data: { enabled: false } });
    await renderPanel();
    expect(screen.queryByText(ROW)).toBeNull();
  });
});
