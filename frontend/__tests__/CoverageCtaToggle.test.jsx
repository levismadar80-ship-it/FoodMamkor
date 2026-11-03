import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CoverageCtaToggle from "@/components/dashboard/CoverageCtaToggle";

const put = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { put } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn() } }));
vi.mock("next-intl", () => ({ useTranslations: (ns) => (k) => `${ns}.${k}` }));

/**
 * MEH-1676 — the owner switch for the public coverage CTA.
 * Pins: role="switch" named by the approved label, aria-checked mirrors the
 * stored flag (absent → on, the column default), a click writes the flipped
 * value to PUT /producers/me, and a failed save rolls the switch back.
 */
describe("CoverageCtaToggle (MEH-1676)", () => {
  // Braces matter: a returned function would be run as a teardown hook.
  beforeEach(() => {
    put.mockReset();
  });

  it("is a labelled switch, on by default", () => {
    render(<CoverageCtaToggle producer={{}} />);
    const sw = screen.getByRole("switch", { name: "dashboard.producer.coverage_cta.label" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("dashboard.producer.coverage_cta.helper")).toBeTruthy();
  });

  it("reflects a stored false and turns it back on through the API", async () => {
    put.mockResolvedValue({});
    const onSaved = vi.fn();
    render(<CoverageCtaToggle producer={{ coverage_cta_enabled: false }} onSaved={onSaved} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    await waitFor(() => expect(put).toHaveBeenCalledWith("/producers/me", { coverage_cta_enabled: true }));
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(onSaved).toHaveBeenCalledWith({ coverage_cta_enabled: true });
  });

  it("rolls back when the save fails", async () => {
    let reject;
    put.mockImplementation(() => new Promise((_, rej) => { reject = rej; }));
    render(<CoverageCtaToggle producer={{ coverage_cta_enabled: true }} />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(put).toHaveBeenCalledWith("/producers/me", { coverage_cta_enabled: false });
    await act(async () => { reject(new Error("save failed")); });
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  });
});
