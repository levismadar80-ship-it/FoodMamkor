/**
 * «עסק של מילואימניקים» — ReservistOwnedCard isolation tests (MEH-2699 shape).
 *
 * The claim is a switch that saves on toggle: no Save button, the PUT carries
 * ONLY reservist_owned (a stray key would clobber a sibling field on the same
 * endpoint), a failed PUT rolls the switch back, and the badge preview shows
 * exactly when the switch is on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ReservistOwnedCard from "@/app/[locale]/producer/dashboard/edit/ReservistOwnedCard";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/chip-icons", () => ({ badgeIcon: () => null }));

const R = he.dashboard.producer.reservistOwned;
const CHROME = he.dashboard.producer.pricing;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ReservistOwnedCard profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const toggle = () => screen.getByRole("switch", { name: R.label });
const preview = () => screen.queryByTestId("reservist-owned-preview");

describe("ReservistOwnedCard", () => {
  beforeEach(() => {
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  it("renders the approved copy word for word and no Save button", () => {
    renderCard({});
    expect(R.label).toBe("אחד הבעלים משרת במילואים");
    expect(R.scope_helper).toBe("יופיע כתג בכרטיס ובדף העסק");
    expect(screen.getByText(R.scope_helper)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: CHROME.save_cta })).toBeNull();
  });

  it("seeds from producer.reservist_owned, with the badge preview only when on", () => {
    const { unmount } = renderCard({ reservist_owned: true });
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(preview()).toHaveTextContent("עסק של מילואימניקים");
    unmount();
    renderCard({});
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(preview()).toBeNull();
  });

  it("toggling on saves at once and sends only reservist_owned", async () => {
    const { onSave } = renderCard({ reservist_owned: false });
    fireEvent.click(toggle());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, payload] = api.put.mock.calls[0];
    expect(url).toBe("/producers/me");
    expect(payload).toEqual({ reservist_owned: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ reservist_owned: true }));
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText(CHROME.saved)).toBeInTheDocument();
  });

  it("toggling off sends false (the owner can remove the badge any time)", async () => {
    renderCard({ reservist_owned: true });
    fireEvent.click(toggle());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toEqual({ reservist_owned: false });
  });

  it("a failed save rolls the switch back and shows an error", async () => {
    api.put.mockRejectedValueOnce(new Error("boom"));
    const { onSave } = renderCard({ reservist_owned: false });
    fireEvent.click(toggle());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(onSave).not.toHaveBeenCalled();
  });
});
