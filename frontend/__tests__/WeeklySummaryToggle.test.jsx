import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import WeeklySummaryToggle from "@/components/producer/WeeklySummaryToggle";

const get = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get, patch } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: toastError } }));
vi.mock("next-intl", () => ({ useTranslations: (ns) => (k) => `${ns}.${k}` }));

/**
 * MEH-3212 — the owner's switch for the weekly summary email.
 * Pins: hidden while the email is off site-wide or the read fails; a switch
 * named by the approved label that mirrors the stored value; a click PATCHes
 * the flipped value; a failed save rolls back and shows the generic error.
 */
const URL = "/producers/me/weekly-summary";

describe("WeeklySummaryToggle (MEH-3212)", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    toastError.mockReset();
  });

  it("renders nothing while the email is off for the whole site", async () => {
    get.mockResolvedValue({ data: { enabled: true, available: false } });
    const { container } = render(<WeeklySummaryToggle />);
    await waitFor(() => expect(get).toHaveBeenCalledWith(URL));
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the read fails or the payload is malformed", async () => {
    get.mockRejectedValueOnce(new Error("500"));
    const first = render(<WeeklySummaryToggle />);
    await act(async () => {});
    expect(first.container.innerHTML).toBe("");
    first.unmount();

    get.mockResolvedValueOnce({ data: { enabled: "yes" } });
    const second = render(<WeeklySummaryToggle />);
    await act(async () => {});
    expect(second.container.innerHTML).toBe("");
  });

  it("turns a stopped summary back on", async () => {
    get.mockResolvedValue({ data: { enabled: false, available: true } });
    patch.mockResolvedValue({ data: { enabled: true, available: true } });
    render(<WeeklySummaryToggle />);
    const sw = await screen.findByRole("switch", {
      name: "dashboard.producer.weekly_summary.label",
    });
    expect(screen.getByText("dashboard.producer.weekly_summary.heading")).toBeTruthy();
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(patch).toHaveBeenCalledWith(URL, { enabled: true }));
  });

  it("turns it off, and rolls back with the generic error when the save fails", async () => {
    get.mockResolvedValue({ data: { enabled: true, available: true } });
    let reject;
    patch.mockImplementation(() => new Promise((_, rej) => { reject = rej; }));
    render(<WeeklySummaryToggle />);
    const sw = await screen.findByRole("switch");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(patch).toHaveBeenCalledWith(URL, { enabled: false });
    await act(async () => { reject(new Error("save failed")); });
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
    expect(toastError).toHaveBeenCalledWith("error.generic");
  });
});
