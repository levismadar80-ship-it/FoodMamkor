// MEH-3524: GET /admin/rescue/metrics had no screen. /admin/analytics now
// shows the pilot's numbers while the pilot is on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminRescueMetrics from "@/components/admin/AdminRescueMetrics";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const copy = he.admin.analytics.rescue;
const mount = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminRescueMetrics />
    </NextIntlClientProvider>,
  );

// The route's real shape (RescueMetricsOut).
const metrics = (over = {}) => ({
  days: 30, offers_total: 12, offers_per_day: 0.4, bags_offered: 40, bags_reserved: 30, sell_through: 0.75,
  orders_total: 28, no_shows: 2, no_show_rate: 0.0769, orders_cancelled: 2, offers_cancelled: 1,
  buyers_total: 20, repeat_buyers: 6, bags_donated: 3, ...over,
});

describe("AdminRescueMetrics", () => {
  beforeEach(() => api.get.mockReset());

  it("shows the pilot's numbers, rates as whole percents", async () => {
    api.get.mockResolvedValueOnce({ data: metrics() });
    mount();
    await screen.findByTestId("admin-rescue-metrics");
    expect(api.get).toHaveBeenCalledWith("/admin/rescue/metrics", { params: { days: 30 } });
    expect(screen.getByText(copy.heading)).toBeInTheDocument();
    expect(screen.getByTestId("rescue-metric-bags_reserved")).toHaveTextContent("30");
    expect(screen.getByTestId("rescue-metric-sell_through")).toHaveTextContent("75%");
    expect(screen.getByTestId("rescue-metric-no_show_rate")).toHaveTextContent("8%");
    expect(screen.getByTestId("rescue-metric-repeat_buyers")).toHaveTextContent("6");
  });

  it("a rate with nothing under it shows «—», not 0%", async () => {
    api.get.mockResolvedValueOnce({ data: metrics({ bags_offered: 0, bags_reserved: 0, sell_through: null, no_show_rate: null }) });
    mount();
    expect(await screen.findByTestId("rescue-metric-sell_through")).toHaveTextContent("—");
    expect(screen.getByTestId("rescue-metric-no_show_rate")).toHaveTextContent("—");
  });

  it("a rate above zero that rounds to 0 reads <1%, not 0%", async () => {
    api.get.mockResolvedValueOnce({ data: metrics({ no_show_rate: 0.004 }) });
    mount();
    expect(await screen.findByTestId("rescue-metric-no_show_rate")).toHaveTextContent("<1%");
  });

  it("a malformed body is a load error (rule 19)", async () => {
    api.get.mockResolvedValueOnce({ data: metrics({ bags_offered: "forty" }) });
    mount();
    expect(await screen.findByTestId("admin-rescue-metrics-error")).toBeInTheDocument();
  });

  it("renders nothing while the pilot is off (404)", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    const { container } = mount();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("another failure says so", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    mount();
    expect(await screen.findByTestId("admin-rescue-metrics-error")).toHaveTextContent(copy.error);
  });
});
