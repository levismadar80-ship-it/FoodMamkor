/**
 * MEH-1167 — KashrutCard isolation tests.
 *
 * Renders the CARD directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner) under the REAL NextIntlClientProvider +
 * he.json, mirroring the EditTabLicenseCard.test.jsx harness.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { KashrutCard } from "@/app/[locale]/producer/dashboard/edit/cards";

// cards.jsx imports @/i18n/navigation (view-on-page link); mock so
// createNavigation's next/navigation import never loads in jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const K = he.dashboard.producer.kashrut;
const BADGES = he.kashrut.badges;

function renderCard(profile = {}, props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <KashrutCard
        profile={{ kashrut_badges: [], ...profile }}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: {} });
});

describe("Edit-tab KashrutCard (isolation)", () => {
  it("fetches own requests on mount and shows the empty state", async () => {
    renderCard();
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/producers/me/kashrut-requests"),
    );
    expect(screen.getByText(K.empty)).toBeInTheDocument();
  });

  it("renders an approved badge via KashrutBadgeStrip (zone 1)", async () => {
    renderCard({ kashrut_badges: ["rabanut"] });
    expect(await screen.findByText(K.approved_heading)).toBeInTheDocument();
    // The label renders in BOTH the approved strip and a select option, so
    // ≥2 occurrences prove the strip added its pill on top of the option.
    expect(screen.getAllByText(BADGES.rabanut.label).length).toBeGreaterThanOrEqual(2);
  });

  it("renders a pending request with its status chip (zone 2)", async () => {
    api.get.mockResolvedValue({
      data: [{ id: "r1", badge_code: "badatz", status: "pending", notes: null }],
    });
    renderCard();
    // Scope to the requests list — the badge label also appears in the select.
    const list = await screen.findByTestId("kashrut-requests");
    expect(within(list).getByText(K.status_pending)).toBeInTheDocument();
    expect(within(list).getByText(BADGES.badatz.label)).toBeInTheDocument();
  });

  it("shows a rejected request's admin notes", async () => {
    api.get.mockResolvedValue({
      data: [
        { id: "r2", badge_code: "chalak", status: "rejected", notes: "התעודה לא ברורה" },
      ],
    });
    renderCard();
    const list = await screen.findByTestId("kashrut-requests");
    expect(within(list).getByText(K.status_rejected)).toBeInTheDocument();
    expect(within(list).getByText("התעודה לא ברורה")).toBeInTheDocument();
  });

  it("submits a request via POST /producers/me/kashrut-request and shows success", async () => {
    renderCard();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("kashrut-badge-select"), {
      target: { value: "mehadrin" },
    });
    fireEvent.click(screen.getByRole("button", { name: K.submit_cta }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/producers/me/kashrut-request", {
        badge_code: "mehadrin",
        cert_url: null,
      }),
    );
    expect(await screen.findByText(K.success)).toBeInTheDocument();
  });

  it("surfaces the backend 409 Hebrew detail inline, not a vanishing toast", async () => {
    const detail = "בקשה לbadge זה כבר ממתינה לאישור";
    api.post.mockRejectedValueOnce({ response: { data: { detail } } });
    renderCard();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("kashrut-badge-select"), {
      target: { value: "rabanut" },
    });
    fireEvent.click(screen.getByRole("button", { name: K.submit_cta }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("disables submit until a badge type is chosen", async () => {
    renderCard();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: K.submit_cta })).toBeDisabled();
    fireEvent.change(screen.getByTestId("kashrut-badge-select"), {
      target: { value: "shmitta" },
    });
    expect(screen.getByRole("button", { name: K.submit_cta })).toBeEnabled();
  });

  // MEH-1439: free-text kosher that isn't verified earns no public "כשר" filter
  // appearance (MEH-986). The hint explains why + points at the cert upload.
  describe("filter hint (MEH-1439)", () => {
    it("shows the hint when free-text kosher is set AND not verified", async () => {
      renderCard({ kosher: "חלבי", kashrut_verified_at: null });
      const hint = await screen.findByTestId("kashrut-filter-hint");
      expect(hint).toHaveTextContent(K.filter_hint);
    });

    it("hides the hint once kashrut is verified", async () => {
      renderCard({ kosher: "חלבי", kashrut_verified_at: "2026-01-01T00:00:00Z" });
      await waitFor(() => expect(api.get).toHaveBeenCalled());
      expect(screen.queryByTestId("kashrut-filter-hint")).not.toBeInTheDocument();
    });

    it("hides the hint when there is no free-text kosher", async () => {
      renderCard({ kosher: "", kashrut_verified_at: null });
      await waitFor(() => expect(api.get).toHaveBeenCalled());
      expect(screen.queryByTestId("kashrut-filter-hint")).not.toBeInTheDocument();
    });
  });

  // MEH-2405: an approved badge with no certificate behind it renders as plain
  // text on the public page (MEH-1672 makes it tappable only when a cert is
  // servable). The owner had no way to know. One quiet row per such badge.
  describe("missing-certificate nudge (MEH-2405)", () => {
    const rows = () => screen.queryAllByTestId("kashrut-missing-cert");
    const settle = () =>
      waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me/kashrut-requests"));

    it("no approved badge → no row", async () => {
      renderCard({ kashrut_badges: [] });
      await settle();
      expect(rows()).toHaveLength(0);
    });

    it("approved badge, no request at all → one row naming the badge", async () => {
      renderCard({ kashrut_badges: ["badatz"] });
      await waitFor(() => expect(rows()).toHaveLength(1));
      expect(rows()[0].textContent).toContain(BADGES.badatz.label);
    });

    it("approved badge + approved request carrying a cert → no row", async () => {
      api.get.mockResolvedValue({
        data: [{ id: "a", badge_code: "badatz", status: "approved", cert_url: "https://x/c.jpg" }],
      });
      renderCard({ kashrut_badges: ["badatz"] });
      await settle();
      await waitFor(() => expect(rows()).toHaveLength(0));
    });

    it("approved badge + pending request carrying a cert → no row (the pending chip already says it)", async () => {
      api.get.mockResolvedValue({
        data: [{ id: "p", badge_code: "badatz", status: "pending", cert_url: "https://x/c.jpg" }],
      });
      renderCard({ kashrut_badges: ["badatz"] });
      await screen.findByTestId("kashrut-requests");
      expect(rows()).toHaveLength(0);
    });

    it("approved badge + approved request WITHOUT a cert → row", async () => {
      api.get.mockResolvedValue({
        data: [{ id: "a", badge_code: "badatz", status: "approved", cert_url: null }],
      });
      renderCard({ kashrut_badges: ["badatz"] });
      await waitFor(() => expect(rows()).toHaveLength(1));
    });

    it("rejected request with a cert does not count as covered", async () => {
      api.get.mockResolvedValue({
        data: [{ id: "r", badge_code: "badatz", status: "rejected", cert_url: "https://x/c.jpg" }],
      });
      renderCard({ kashrut_badges: ["badatz"] });
      await waitFor(() => expect(rows()).toHaveLength(1));
    });

    it("two uncovered badges → two rows; a covered third adds none", async () => {
      api.get.mockResolvedValue({
        data: [{ id: "a", badge_code: "rabanut", status: "approved", cert_url: "https://x/c.jpg" }],
      });
      renderCard({ kashrut_badges: ["badatz", "chalak", "rabanut"] });
      await waitFor(() => expect(rows()).toHaveLength(2));
      const text = rows().map((r) => r.textContent).join("|");
      expect(text).toContain(BADGES.badatz.label);
      expect(text).toContain(BADGES.chalak.label);
      expect(text).not.toContain(BADGES.rabanut.label);
    });

    it("request list failed to load → no row (unknown is not 'missing')", async () => {
      api.get.mockRejectedValue(new Error("network"));
      renderCard({ kashrut_badges: ["badatz"] });
      await settle();
      // Give the rejected promise a tick to land before asserting absence.
      await new Promise((r) => setTimeout(r, 0));
      expect(rows()).toHaveLength(0);
    });
  });
});
