/**
 * MEH-2521 — the admin ProducerForm no longer offers kosher, organic_certified
 * or has_delivery.
 *
 * None of the three reaches a public surface: kosher is public only when
 * VERIFIED (MEH-986, a separate flow), the organic badge was removed by
 * MEH-1259, and delivery is derived from the delivery areas (MEH-1836/2046).
 * A control for each told the admin she was setting something she was not —
 * the same trap as the retired ambassador badge.
 *
 * Two kinds of assertion, because either alone has a blind spot:
 *   1. the controls are absent (by the labels they had — the i18n keys are
 *      deleted with them, so the strings are pinned here);
 *   2. the submitted PAYLOAD carries none of the three keys. The admin PUT is
 *      exclude_unset, so omitting a key is what keeps a stored value intact.
 * grass_fed, a sibling checkbox this card leaves alone, is the positive
 * control in both: present + checked from `initial`, and sent as true.
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

// The he.json values of the deleted keys, as they stood on staging before
// MEH-2521 (admin.producers.form.fields.*).
const OLD_LABELS = {
  organic_certified: "אורגני מוסמך",
  has_delivery: "יש משלוחים",
  kosher: "כשרות",
  kosher_mehadrin: "כשר למהדרין",
  kosher_not_kosher: "לא כשר",
};

const INITIAL = {
  name: "עסק לבדיקה",
  grass_fed: true,
  kosher: "כשר למהדרין",
  organic_certified: true,
  has_delivery: true,
};

function renderForm(props = {}) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm {...props} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe("Admin ProducerForm — dead fields removed (MEH-2521)", () => {
  it("renders no organic / has_delivery checkbox and no kosher select", async () => {
    renderForm({ producerId: "p-1", initial: INITIAL });

    // Control: the sibling checkbox renders and loaded its initial value.
    const grass = await screen.findByRole("checkbox", { name: F.grass_fed });
    expect(grass.checked).toBe(true);

    expect(
      screen.queryByRole("checkbox", { name: OLD_LABELS.organic_certified }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: OLD_LABELS.has_delivery }),
    ).toBeNull();
    expect(screen.queryByRole("combobox", { name: OLD_LABELS.kosher })).toBeNull();
    expect(
      screen.queryByRole("option", { name: OLD_LABELS.kosher_mehadrin }),
    ).toBeNull();
    expect(
      screen.queryByRole("option", { name: OLD_LABELS.kosher_not_kosher }),
    ).toBeNull();
  });

  it("an edit submits none of the three keys (stored values stay intact)", async () => {
    renderForm({ producerId: "p-1", initial: INITIAL });
    await screen.findByRole("checkbox", { name: F.grass_fed });

    fireEvent.submit(
      screen
        .getByRole("button", { name: he.admin.producers.form.submit_update })
        .closest("form"),
    );

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const payload = api.put.mock.calls[0][1];

    expect(payload.grass_fed).toBe(true); // control: the payload is the real one
    expect(Object.keys(payload)).not.toContain("kosher");
    expect(Object.keys(payload)).not.toContain("organic_certified");
    expect(Object.keys(payload)).not.toContain("has_delivery");
  });
});
