// MEH-3524: GET /admin/license-expiry-reminders had no screen. The admin home
// now lists the licences that run out within 30 days.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import AdminLicenceExpiry from "@/components/admin/AdminLicenceExpiry";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const copy = he.admin.dashboard.licences;
const mount = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AdminLicenceExpiry />
    </NextIntlClientProvider>,
  );

// The route's real shape (LicenseExpiryReminderOut in schemas).
const row = (id, name, days, expires) => ({
  producer_id: `7d1f5f3e-1c2b-4e5a-9f00-00000000000${id}`, name, phone_masked: "050-***-1234",
  expires_at: expires, days_remaining: days, producer_license_number: null,
});
const body = (rows) => ({ window_days: 30, total: rows.length, rows });

describe("AdminLicenceExpiry", () => {
  beforeEach(() => api.get.mockReset());

  it("0 licences: renders nothing", async () => {
    api.get.mockResolvedValueOnce({ data: body([]) });
    const { container } = mount();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/license-expiry-reminders"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("1 licence: one row with its days and a link to the business", async () => {
    api.get.mockResolvedValueOnce({ data: body([row(1, "מאפיית שקד", 1, "2026-11-22")]) });
    mount();
    const panel = await screen.findByTestId("admin-home-licences");
    expect(panel).toHaveTextContent(copy.heading);
    expect(panel).toHaveTextContent("מאפיית שקד");
    expect(panel).toHaveTextContent("נשאר יום אחד");
    expect(screen.getByRole("link", { name: copy.open })).toHaveAttribute(
      "href", expect.stringContaining("/admin/producers/7d1f5f3e-1c2b-4e5a-9f00-000000000001/edit"),
    );
  });

  it("many licences: a row each, today's one says so", async () => {
    api.get.mockResolvedValueOnce({
      data: body([row(1, "א", 0, "2026-11-21"), row(2, "ב", 12, "2026-12-03"), row(3, "ג", 30, "2026-12-21")]),
    });
    mount();
    const panel = await screen.findByTestId("admin-home-licences");
    expect(panel.querySelectorAll("li")).toHaveLength(3);
    expect(panel).toHaveTextContent("פג היום");
    expect(panel).toHaveTextContent("נשארו 12 ימים");
  });

  it("a failed read says so instead of looking empty", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500 } });
    mount();
    expect(await screen.findByTestId("admin-home-licences-error")).toHaveTextContent(copy.error);
  });

  it("a malformed body is a load error (rule 19)", async () => {
    api.get.mockResolvedValueOnce({ data: { window_days: 30, total: 1, rows: [{ name: "x" }] } });
    mount();
    expect(await screen.findByTestId("admin-home-licences-error")).toBeInTheDocument();
  });
});
