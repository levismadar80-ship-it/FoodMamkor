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
// An owner whose public page CAN show the CTA: a WhatsApp phone, delivery on,
// and a named-areas list (DeliveryChecker's gate 3 passes).
const REACHABLE = {
  phone: "0501234567",
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_excluded_cities: [],
  delivery_areas: [{ city: "חיפה" }],
};

describe("CoverageCtaToggle (MEH-1676)", () => {
  // Braces matter: a returned function would be run as a teardown hook.
  beforeEach(() => {
    put.mockReset();
  });

  it("is a labelled switch, on by default", () => {
    render(<CoverageCtaToggle producer={REACHABLE} />);
    const sw = screen.getByRole("switch", { name: "dashboard.producer.coverage_cta.label" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("dashboard.producer.coverage_cta.helper")).toBeTruthy();
  });

  it("reflects a stored false and turns it back on through the API", async () => {
    put.mockResolvedValue({});
    const onSaved = vi.fn();
    render(<CoverageCtaToggle producer={{ ...REACHABLE, coverage_cta_enabled: false }} onSaved={onSaved} />);
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
    render(<CoverageCtaToggle producer={{ ...REACHABLE, coverage_cta_enabled: true }} />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(put).toHaveBeenCalledWith("/producers/me", { coverage_cta_enabled: false });
    await act(async () => { reject(new Error("save failed")); });
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "true"));
  });

  // 03/11 ערב (1): the visual track stays 40×24, the tap target is ≥ 44×44.
  // jsdom has no layout, so this pins the classes; the 375 px measurement is
  // in the PR body.
  it("gives the switch a 44×44 hit area", () => {
    render(<CoverageCtaToggle producer={REACHABLE} />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toMatch(/\bmin-h-touch/);
    expect(sw.className).toMatch(/\bmin-w-touch/);
  });
});

// 03/11 ערב (2): an owner whose page never renders the CTA does not see the
// switch. Same gate as the public page (DeliveryChecker + CoverageRequestCta),
// imported, not copied.
describe("CoverageCtaToggle visibility (MEH-1676)", () => {
  it.each([
    ["delivery off", { ...REACHABLE, offers_delivery: false }],
    ["nationwide, no exclusions", { ...REACHABLE, delivery_nationwide: true, delivery_areas: [] }],
    ["local, no named areas", { ...REACHABLE, delivery_areas: [] }],
    ["no WhatsApp phone", { ...REACHABLE, phone: "" }],
  ])("is not rendered when %s (0)", (_name, producer) => {
    render(<CoverageCtaToggle producer={producer} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("is rendered for nationwide with an exclusion list (1)", () => {
    render(
      <CoverageCtaToggle
        producer={{ ...REACHABLE, delivery_nationwide: true, delivery_areas: [], delivery_excluded_cities: ["אילת"] }}
      />,
    );
    expect(screen.getByRole("switch")).toBeTruthy();
  });
});
