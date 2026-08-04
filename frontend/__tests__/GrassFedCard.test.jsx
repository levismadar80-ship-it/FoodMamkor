/**
 * MEH-1851 row 23 (EXPOSE) — GrassFedCard isolation tests.
 *
 * Renders the card under the REAL NextIntlClientProvider + he.json (mirrors the
 * DietaryScopeCard harness). Covers both directions:
 *   - seed grass_fed → the checkbox reflects it (true and false);
 *   - toggling + Save → api.put carries { grass_fed: <bool> } and nothing else;
 *   - Save stays disabled until the value actually changes (no no-op PUT).
 *
 * The payload-shape assertion is the load-bearing one. `grass_fed` is the ONLY
 * key this card may send: PricingCard and DietaryScopeCard write disjoint keys
 * on the same endpoint, and a stray key here would clobber a sibling card's
 * value on save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import GrassFedCard from "@/app/[locale]/producer/dashboard/edit/GrassFedCard";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const G = he.dashboard.producer.grassFed;
const CHROME = he.dashboard.producer.pricing;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <GrassFedCard profile={profile} onSave={onSave} reportDirty={() => {}} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const box = () => screen.getByRole("checkbox", { name: G.label });
const saveBtn = () => screen.getByRole("button", { name: CHROME.save_cta });

describe("GrassFedCard (MEH-1851 row 23)", () => {
  beforeEach(() => {
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  it("seeds the checkbox from producer.grass_fed === true", () => {
    renderCard({ grass_fed: true });
    expect(box()).toBeChecked();
  });

  it("seeds unchecked when grass_fed is false or absent", () => {
    const { unmount } = renderCard({ grass_fed: false });
    expect(box()).not.toBeChecked();
    unmount();
    renderCard({});
    expect(box()).not.toBeChecked();
  });

  it("save is disabled until the value changes, then sends only grass_fed", async () => {
    const { onSave } = renderCard({ grass_fed: false });
    // Control: an untouched card cannot fire a PUT. Without this the payload
    // assertion below would also pass on a card that saves on mount.
    expect(saveBtn()).toBeDisabled();

    fireEvent.click(box());
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, payload] = api.put.mock.calls[0];
    expect(url).toBe("/producers/me");
    expect(payload).toEqual({ grass_fed: true });
    // Exact-shape, not just "contains": a stray key here overwrites whatever
    // a sibling card on the same endpoint last saved.
    expect(Object.keys(payload)).toEqual(["grass_fed"]);
    expect(onSave).toHaveBeenCalledWith({ grass_fed: true });
  });

  it("un-declaring sends grass_fed:false (the claim is retractable)", async () => {
    renderCard({ grass_fed: true });
    fireEvent.click(box());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toEqual({ grass_fed: false });
  });

  it("the owner-facing label matches the consumer chip string exactly", async () => {
    // MEH-1507 locked "גראס פד" as the /map chip label. If the dashboard calls
    // the same attribute something else, the owner cannot tell what she is
    // turning on. This assertion is what keeps the two strings from drifting.
    const { TOGGLE_CHIPS } = await import("@/lib/map-chips");
    const chip = TOGGLE_CHIPS.find((c) => c.key === "grass_fed");
    expect(chip).toBeDefined();
    expect(G.label).toBe(chip.label);
  });
});
