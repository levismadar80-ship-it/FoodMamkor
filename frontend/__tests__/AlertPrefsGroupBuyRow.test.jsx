/**
 * MEH-2828 PR 2 — «הודיעו לי כש…» gains a fifth row, «קבוצות רכישה חדשות»,
 * on by default, read from and saved to notify_new_group_buy. Real he.json
 * copy (row C), so a wording drift fails here too.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, phone: "0500000000" }, updateProfile: vi.fn() }),
}));

import AlertPrefsPanel from "@/components/AlertPrefsPanel";

const ROW = he.sweep_tail.alert_prefs.row_new_group_buy;
const renderPanel = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AlertPrefsPanel producerId="p1" producerName="מאפיית הכפר" />
    </NextIntlClientProvider>,
  );
const rowSwitch = () => screen.getByText(ROW).closest("label").querySelector('[role="switch"]');

beforeEach(() => {
  api.get.mockReset();
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
});

describe("AlertPrefsPanel — group buy row (MEH-2828)", () => {
  it("row C copy is the approved wording", () => {
    expect(ROW).toBe("קבוצות רכישה חדשות");
  });

  it("five type rows, the group-buy one right after recipes, on by default when there are no prefs yet", async () => {
    api.get.mockResolvedValue({ data: { enabled: false } });
    renderPanel();
    await screen.findByText(ROW);
    const labels = [...document.querySelectorAll("label")].map((l) => l.textContent.trim());
    const recipe = labels.indexOf(he.sweep_tail.alert_prefs.row_new_recipe);
    expect(labels[recipe + 1]).toBe(ROW);
    expect(rowSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("reads the saved value and saves the toggle", async () => {
    api.get.mockResolvedValue({
      data: {
        enabled: true, notify_new_event: true, notify_new_product: true, notify_delivery_area: true,
        notify_new_recipe: true, notify_new_group_buy: false, whatsapp_opt_in: true, has_push: false,
      },
    });
    renderPanel();
    await screen.findByText(ROW);
    expect(rowSwitch().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(rowSwitch());
    expect(rowSwitch().getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByText(he.sweep_tail.alert_prefs.save_cta));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toMatchObject({ notify_new_group_buy: true });
  });
});

describe("/join tool list (launch tier ב׳)", () => {
  it("follower_updates label is row D", () => {
    expect(he.business_features.items.follower_updates.label).toBe(
      "עדכון ללקוחות ששמרו אתכם על מוצר, אירוע, מתכון או קבוצת רכישה חדשים",
    );
  });
});
