/**
 * MEH-1258 — LicenseCard isolation tests.
 *
 * Renders the CARD directly (not ProducerDashboardEditPage — the full-page
 * mount hangs the vitest runner) under the REAL NextIntlClientProvider +
 * he.json, mirroring the EditTabCategoriesCard.test.jsx harness.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { LicenseCard } from "@/app/[locale]/producer/dashboard/edit/cards";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const L = he.dashboard.producer.license;
const ADMIN = he.admin.producers.form.fields;

function renderCard(profile = {}, props = {}) {
  const onSave = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <LicenseCard
        profile={{ producer_license_number: "", categories: [], ...profile }}
        onSave={onSave}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab LicenseCard (isolation)", () => {
  it("saves the entered license via PUT /producers/me and patches the parent", async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByLabelText(L.field_label), {
      target: { value: "1234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: L.save_cta }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        producer_license_number: "1234567",
      }),
    );
    expect(onSave).toHaveBeenCalledWith({ producer_license_number: "1234567" });
  });

  it("clearing sends null and surfaces the backend Hebrew 422 detail inline", async () => {
    // The MEH-999 2c guard (clear while a license-required category is held)
    // lives server-side — the card must only surface its Hebrew detail.
    api.put.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ msg: "נדרש רישיון יצרן" }] } },
    });
    renderCard({ producer_license_number: "1234567" });
    fireEvent.change(screen.getByLabelText(L.field_label), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: L.save_cta }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("נדרש רישיון יצרן");
    expect(alert.textContent).not.toContain("[object Object]");
    expect(api.put).toHaveBeenCalledWith("/producers/me", {
      producer_license_number: null,
    });
  });

  it("shows the non-blocking amber format warning for a non-7-10-digit value", () => {
    renderCard();
    fireEvent.change(screen.getByLabelText(L.field_label), {
      target: { value: "123" },
    });
    expect(screen.getByText(ADMIN.license_format_warning)).toBeInTheDocument();
    // Non-blocking: save stays enabled (manual-approval flow, MEH-530).
    expect(screen.getByRole("button", { name: L.save_cta })).not.toBeDisabled();
  });

  it("shows the required hint only when a selected category requires a license", () => {
    // "דבש" is in LICENSE_REQUIRED_CATEGORIES (MEH-743).
    renderCard({ categories: [{ id: 5, name: "דבש" }] });
    expect(screen.getByText(L.required_hint)).toBeInTheDocument();
  });

  it("omits the required hint for license-free categories", () => {
    renderCard({ categories: [{ id: 9, name: "שמנים" }] });
    expect(screen.queryByText(L.required_hint)).not.toBeInTheDocument();
  });

  it("lifts its dirty flag via reportDirty('license', …)", () => {
    const reportDirty = vi.fn();
    renderCard({}, { reportDirty });
    expect(reportDirty).toHaveBeenLastCalledWith("license", false);
    fireEvent.change(screen.getByLabelText(L.field_label), {
      target: { value: "1" },
    });
    expect(reportDirty).toHaveBeenLastCalledWith("license", true);
  });
});
