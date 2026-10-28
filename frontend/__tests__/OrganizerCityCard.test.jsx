/**
 * MEH-2475 — an organizer edits her city from the dashboard. The organizer
 * page shows `city`, and an organizer has no locations editor (MEH-2460), so
 * this card is her only way to change it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import OrganizerCityCard from "@/app/[locale]/producer/dashboard/edit/OrganizerCityCard";

vi.mock("@/lib/api", () => ({ default: { put: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn() } }));
// CitySearch is the house city autocomplete (registration uses it); a plain
// input stands in so the test drives the value directly.
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, label, value, onChange }) => (
    <label htmlFor={id}>
      {label}
      <input id={id} value={value} onChange={(e) => onChange(e.target.value, { known: true })} />
    </label>
  ),
}));

const t = he.dashboard.producer.organizer_city;

function renderCard(profile = { city: "חיפה" }, onSave = vi.fn()) {
  render(
    <NextIntlClientProvider locale="he" messages={he}>
      <OrganizerCityCard profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return onSave;
}

beforeEach(() => vi.clearAllMocks());

describe("OrganizerCityCard (MEH-2475)", () => {
  it("shows the current city and a save button that is off until it changes", () => {
    renderCard();
    expect(screen.getByLabelText(t.label)).toHaveValue("חיפה");
    expect(screen.getByRole("button", { name: t.save })).toBeDisabled();
  });

  it("saves the new city with PUT /producers/me and reports it upward", async () => {
    api.put.mockResolvedValue({ data: {} });
    const onSave = renderCard();
    fireEvent.change(screen.getByLabelText(t.label), { target: { value: "עכו" } });
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me", { city: "עכו" }));
    expect(onSave).toHaveBeenCalledWith({ city: "עכו" });
  });

  it("a failed save shows the error and does not report a change", async () => {
    api.put.mockRejectedValue({ response: { status: 500 } });
    const onSave = renderCard();
    fireEvent.change(screen.getByLabelText(t.label), { target: { value: "עכו" } });
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(await screen.findByText(t.error)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
