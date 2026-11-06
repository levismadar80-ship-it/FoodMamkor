/**
 * MEH-2766 — the owner's on-site sign-up list (closed-by-default disclosure).
 *
 * The 5-state rule as a matrix, one test per cell:
 *   (0 / 1 / many) × (closed / open)
 * plus the open-and-failed state and "loads once".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import RegistrationsList from "@/components/RegistrationsList";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const L = he.registration.list;
const row = (n, status = "registered") => ({
  id: `r${n}`,
  name: `נרשמת ${n}`,
  phone: `050-000000${n}`,
  email: `r${n}@example.com`,
  status,
  created_at: "2026-11-06T10:00:00Z",
  cancelled_at: status === "cancelled" ? "2026-11-06T11:00:00Z" : null,
});

function renderList(count) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RegistrationsList kind="experiences" itemId="ex1" count={count} />
    </NextIntlClientProvider>,
  );
  return document.querySelector("[data-testid=registrations-list]");
}

function open(details) {
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

const summaryText = (n) => L.summary.replace("{count}", String(n));

beforeEach(() => vi.clearAllMocks());

describe("RegistrationsList", () => {
  it.each([0, 1, 3])("closed × %i: summary shows the count, nothing fetched", (n) => {
    const d = renderList(n);
    expect(d.open).toBe(false);
    expect(screen.getByText(summaryText(n))).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("open × 0: the empty line", async () => {
    api.get.mockResolvedValue({ data: [] });
    open(renderList(0));
    await waitFor(() => expect(screen.getByText(L.empty)).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledWith("/experiences/ex1/registrations");
    expect(screen.queryAllByTestId("registration-row")).toHaveLength(0);
  });

  it("open × 1: one row with tappable phone and email", async () => {
    api.get.mockResolvedValue({ data: [row(1)] });
    open(renderList(1));
    await waitFor(() => expect(screen.getAllByTestId("registration-row")).toHaveLength(1));
    expect(screen.getByText("050-0000001").closest("a")).toHaveAttribute("href", "tel:050-0000001");
    expect(screen.getByText("r1@example.com").closest("a")).toHaveAttribute("href", "mailto:r1@example.com");
    expect(screen.queryByText(L.empty)).not.toBeInTheDocument();
  });

  it("open × many: every row, a cancelled one marked «בוטלה»", async () => {
    api.get.mockResolvedValue({ data: [row(1), row(2, "cancelled"), row(3)] });
    open(renderList(2));
    await waitFor(() => expect(screen.getAllByTestId("registration-row")).toHaveLength(3));
    expect(screen.getAllByText(L.cancelled)).toHaveLength(1);
    expect(screen.getByText("נרשמת 2").className).toContain("line-through");
  });

  it("open × failed: one error line, no empty line", async () => {
    api.get.mockRejectedValue(new Error("500"));
    open(renderList(1));
    await waitFor(() => expect(screen.getByText(L.load_error)).toBeInTheDocument());
    expect(screen.queryByText(L.empty)).not.toBeInTheDocument();
  });

  it("re-opening does not fetch again", async () => {
    api.get.mockResolvedValue({ data: [row(1)] });
    const d = renderList(1);
    open(d);
    await waitFor(() => expect(screen.getAllByTestId("registration-row")).toHaveLength(1));
    d.open = false;
    fireEvent(d, new Event("toggle"));
    open(d);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
