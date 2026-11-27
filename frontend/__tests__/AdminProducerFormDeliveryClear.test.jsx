/**
 * Admin ProducerForm — unticking "משלוחים" clears the delivery block (MEH-1879).
 *
 * CHECK producer_nationwide_requires_delivery landed in 09fbfbe9 (MEH-1849).
 * The form's delivery block is CONDITIONALLY RENDERED (`form.offers_delivery &&`),
 * and unmounting a React subtree does not clear the state behind it — so the
 * sequence tick משלוחים → tick לכל הארץ → untick משלוחים submitted
 * offers_delivery=false alongside delivery_nationwide=true and the admin
 * manual-approval path returned 500.
 *
 * These assert on the PAYLOAD handed to api.put/api.post, not on which controls
 * are visible. Visibility was never the bug: the nationwide checkbox already
 * disappeared correctly at :839 while its state survived underneath. A test
 * that asserted "the checkbox is gone" would have passed against the broken
 * form — it is exactly the assertion that let this ship.
 *
 * MEH-3475: create form only — the edit page has no delivery controls
 * here (AdminProducerFormDeliveryUnchanged.test.jsx).
 *
 * All THREE fields the block owns are checked. delivery_cities matters
 * independently of the 500: it submits as delivery_area_cities ungated, so
 * leaving it stale writes delivery_areas rows onto a business declaring no
 * delivery — the cross-table contradiction a CHECK cannot express.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const F = he.admin.producers.form.fields;

function renderForm(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm {...props} />
    </NextIntlClientProvider>,
  );
}

/** The checkbox whose label is exactly `label` (getByLabelText is ambiguous
 *  across the several checkboxes this form renders). */
const checkbox = (label) => screen.getByRole("checkbox", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe("Admin ProducerForm — delivery clear on untick (MEH-1879)", () => {
  it("tick משלוחים → tick לכל הארץ → untick משלוחים submits no contradiction", async () => {
    // MEH-3475: the CREATE form. On the edit page these controls are gone —
    // the owner's DeliveryCard there owns the fields, and its own contradiction
    // handling is covered by the owner-card tests (EditTabDeliveryCard).
    renderForm({});

    await waitFor(() => expect(checkbox(F.offers_delivery)).toBeInTheDocument());

    fireEvent.click(checkbox(F.offers_delivery)); // 1 — delivery on
    await waitFor(() =>
      expect(checkbox(F.delivery_nationwide)).toBeInTheDocument(),
    );
    fireEvent.click(checkbox(F.delivery_nationwide)); // 2 — nationwide on
    fireEvent.click(checkbox(F.offers_delivery)); // 3 — delivery OFF again

    // The nationwide control unmounts here. That was always true; the state
    // behind it is what this asserts.
    expect(
      screen.queryByRole("checkbox", { name: F.delivery_nationwide }),
    ).not.toBeInTheDocument();

    fireEvent.submit(screen.getByRole("button", { name: he.admin.producers.form.submit_create }).closest("form"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];

    expect(payload.offers_delivery).toBe(false);
    // The 500: this was `true` before MEH-1879.
    expect(payload.delivery_nationwide).toBe(false);
    // The cross-table sibling.
    expect(payload.delivery_area_cities).toEqual([]);
    expect(payload.delivery_excluded_cities).toEqual([]);
  });

  it("CONTROL — leaving משלוחים ticked keeps nationwide, so the clear is not unconditional", async () => {
    renderForm({});

    await waitFor(() => expect(checkbox(F.offers_delivery)).toBeInTheDocument());
    fireEvent.click(checkbox(F.offers_delivery));
    await waitFor(() =>
      expect(checkbox(F.delivery_nationwide)).toBeInTheDocument(),
    );
    fireEvent.click(checkbox(F.delivery_nationwide));

    fireEvent.submit(screen.getByRole("button", { name: he.admin.producers.form.submit_create }).closest("form"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];

    expect(payload.offers_delivery).toBe(true);
    expect(payload.delivery_nationwide).toBe(true);
  });

  it("MEH-3972: משלוחים with no cities is savable — a hint, not a block", async () => {
    renderForm({});

    await waitFor(() => expect(checkbox(F.offers_delivery)).toBeInTheDocument());
    fireEvent.click(checkbox(F.offers_delivery));
    await waitFor(() => expect(screen.getByText(he.dashboard.producer.delivery.delivery_cities_optional_hint)).toBeInTheDocument());

    const submit = screen.getByRole("button", { name: he.admin.producers.form.submit_create });
    expect(submit).not.toBeDisabled();
    fireEvent.submit(submit.closest("form"));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload.offers_delivery).toBe(true);
    expect(payload.delivery_nationwide).toBe(false);
    expect(payload.delivery_area_cities).toEqual([]);
  });
});
