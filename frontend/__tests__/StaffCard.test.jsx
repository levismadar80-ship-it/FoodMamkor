/**
 * MEH-3526 — «צוות להזמנות» on the owner's tools tab.
 * 0 / 1 / many rows, the cap (expired invites do not count), invite, remove,
 * and no card at all while on-site ordering is off (settings 404 → null).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import StaffCard from "@/components/dashboard/staff/StaffCard";

const loadSettings = vi.fn();
vi.mock("@/lib/product-orders", () => ({ loadSettings: (...a) => loadSettings(...a) }));
const listStaff = vi.fn();
const inviteStaff = vi.fn();
const removeStaff = vi.fn();
vi.mock("@/lib/staff", () => ({
  listStaff: (...a) => listStaff(...a),
  inviteStaff: (...a) => inviteStaff(...a),
  removeStaff: (...a) => removeStaff(...a),
}));

const row = (n, extra = {}) => ({ id: `id-${n}`, email: `p${n}@example.com`, status: "active", expired: false, created_at: "2026-11-24T10:00:00Z", ...extra });
const renderCard = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <StaffCard />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  loadSettings.mockReset().mockResolvedValue({});
  listStaff.mockReset();
  inviteStaff.mockReset();
  removeStaff.mockReset();
});

describe("MEH-3526 StaffCard", () => {
  it("renders nothing while on-site ordering is off", async () => {
    loadSettings.mockResolvedValue(null);
    const { container } = renderCard();
    await waitFor(() => expect(loadSettings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(listStaff).not.toHaveBeenCalled();
  });

  it("0 rows: the empty line and the invite form", async () => {
    listStaff.mockResolvedValue({ staff: [], max_staff: 5 });
    renderCard();
    expect(await screen.findByTestId("staff-empty")).toBeInTheDocument();
    expect(screen.getByTestId("staff-invite-form")).toBeInTheDocument();
    expect(screen.getByTestId("staff-count")).toHaveTextContent("0 מתוך 5");
  });

  it("1 row: its address and status, and removing it reloads", async () => {
    listStaff.mockResolvedValueOnce({ staff: [row(1)], max_staff: 5 }).mockResolvedValueOnce({ staff: [], max_staff: 5 });
    removeStaff.mockResolvedValue(undefined);
    renderCard();
    expect(await screen.findByText("p1@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("staff-row-status")).toHaveTextContent("בצוות");
    fireEvent.click(screen.getByTestId("staff-remove"));
    await waitFor(() => expect(removeStaff).toHaveBeenCalledWith("id-1"));
    expect(await screen.findByTestId("staff-empty")).toBeInTheDocument();
  });

  it("many rows at the cap: the form gives way to «הצוות מלא»", async () => {
    listStaff.mockResolvedValue({ staff: [1, 2, 3, 4, 5].map((n) => row(n)), max_staff: 5 });
    renderCard();
    expect(await screen.findByTestId("staff-full")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-invite-form")).toBeNull();
    expect(screen.getAllByTestId("staff-row")).toHaveLength(5);
  });

  it("an expired invite does not count, and offers «שליחה מחדש»", async () => {
    const rows = [1, 2, 3, 4].map((n) => row(n)).concat(row(5, { status: "pending", expired: true }));
    listStaff.mockResolvedValue({ staff: rows, max_staff: 5 });
    inviteStaff.mockResolvedValue(row(5, { status: "pending" }));
    renderCard();
    expect(await screen.findByTestId("staff-invite-form")).toBeInTheDocument();
    expect(screen.getByTestId("staff-count")).toHaveTextContent("4 מתוך 5");
    fireEvent.click(screen.getByTestId("staff-resend"));
    await waitFor(() => expect(inviteStaff).toHaveBeenCalledWith("p5@example.com"));
  });

  it("an invite sends the address and confirms; a 409 shows the server's reason", async () => {
    listStaff.mockResolvedValue({ staff: [], max_staff: 5 });
    inviteStaff.mockResolvedValueOnce(row(9, { status: "pending" })).mockRejectedValueOnce({ response: { status: 409, data: { detail: "הכתובת הזאת כבר בצוות של בית העסק." } } });
    renderCard();
    const field = (await screen.findByTestId("staff-email")).querySelector("input") ?? screen.getByTestId("staff-email");
    fireEvent.change(field, { target: { value: "new@example.com" } });
    fireEvent.submit(screen.getByTestId("staff-invite-form"));
    expect(await screen.findByTestId("staff-message")).toHaveTextContent("new@example.com");
    fireEvent.change(field, { target: { value: "new@example.com" } });
    fireEvent.submit(screen.getByTestId("staff-invite-form"));
    await waitFor(() => expect(screen.getByTestId("staff-message")).toHaveTextContent("הכתובת הזאת כבר בצוות של בית העסק."));
  });
});
