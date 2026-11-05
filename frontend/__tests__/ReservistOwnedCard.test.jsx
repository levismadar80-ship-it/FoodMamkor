/**
 * «עסק של מילואימניקים» — ReservistOwnedCard isolation tests.
 *
 * Same harness and contract as GrassFedCard.test.jsx: real he.json, the
 * checkbox seeds from producer.reservist_owned, Save stays disabled until the
 * value changes, and the PUT carries ONLY reservist_owned (a stray key would
 * clobber a sibling card's value on the same endpoint).
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

const R = he.dashboard.producer.reservistOwned;
const CHROME = he.dashboard.producer.pricing;

function renderCard(profile = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ReservistOwnedCard profile={profile} onSave={onSave} reportDirty={() => {}} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

const box = () => screen.getByRole("checkbox", { name: R.label });
const saveBtn = () => screen.getByRole("button", { name: CHROME.save_cta });

describe("ReservistOwnedCard", () => {
  beforeEach(() => {
    api.put.mockReset();
    api.put.mockResolvedValue({ data: {} });
  });

  it("renders the approved copy word for word", () => {
    renderCard({});
    expect(R.label).toBe("אחד הבעלים משרת במילואים");
    expect(R.scope_helper).toBe("יופיע כתג בכרטיס ובדף העסק");
    expect(screen.getByText(R.scope_helper)).toBeInTheDocument();
  });

  it("seeds the checkbox from producer.reservist_owned === true", () => {
    renderCard({ reservist_owned: true });
    expect(box()).toBeChecked();
  });

  it("seeds unchecked when reservist_owned is false or absent", () => {
    const { unmount } = renderCard({ reservist_owned: false });
    expect(box()).not.toBeChecked();
    unmount();
    renderCard({});
    expect(box()).not.toBeChecked();
  });

  it("save is disabled until the value changes, then sends only reservist_owned", async () => {
    const { onSave } = renderCard({ reservist_owned: false });
    expect(saveBtn()).toBeDisabled();

    fireEvent.click(box());
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, payload] = api.put.mock.calls[0];
    expect(url).toBe("/producers/me");
    expect(Object.keys(payload)).toEqual(["reservist_owned"]);
    expect(payload).toEqual({ reservist_owned: true });
    expect(onSave).toHaveBeenCalledWith({ reservist_owned: true });
  });

  it("unchecking sends false (the owner can remove the badge any time)", async () => {
    renderCard({ reservist_owned: true });
    fireEvent.click(box());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toEqual({ reservist_owned: false });
  });
});
