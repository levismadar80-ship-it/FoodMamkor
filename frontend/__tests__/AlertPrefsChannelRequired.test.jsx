import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2526 — AlertPrefsPanel tells the user that updates cannot reach her until
 * at least one delivery channel (WhatsApp or browser push) is chosen.
 *
 * Channel count matrix: 0 → message shown · 1 (WhatsApp, or push) → hidden ·
 * 2 (both) → hidden; plus the live transition 1 → 0 when WhatsApp is switched off.
 */

const CHANNEL_REQUIRED =
  "כדי שהעדכונים יגיעו אלייך, צריך לבחור לפחות דרך אחת: וואטסאפ או התראות בדפדפן.";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", phone: "0501234567" }, updateProfile: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  return { showToast };
});

const push = vi.hoisted(() => ({ key: null }));
vi.mock("@/lib/push", () => ({
  getVapidPublicKey: () => Promise.resolve(push.key),
  requestPushPermission: vi.fn(),
  subscribeToPush: vi.fn(),
}));

import api from "@/lib/api";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";

const prefs = (whatsapp) => ({
  enabled: true,
  notify_new_event: true,
  notify_new_product: true,
  notify_delivery_area: true,
  notify_new_recipe: true,
  whatsapp_opt_in: whatsapp,
  has_push: false,
});

function setPushPermission(permission) {
  if (permission == null) {
    delete window.Notification;
    push.key = null;
    return;
  }
  window.Notification = { permission };
  push.key = "vapid-key";
}

const renderPanel = () =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <AlertPrefsPanel producerId="p1" producerName="חווה" />
    </NextIntlClientProvider>,
  );

const loaded = () => screen.findByText(he.sweep_tail.alert_prefs.group_how);

beforeEach(() => {
  vi.clearAllMocks();
  setPushPermission(null);
});

describe("MEH-2526 · channel-required message", () => {
  it("copy is verbatim, with an English twin", () => {
    expect(he.sweep_tail.alert_prefs.channel_required).toBe(CHANNEL_REQUIRED);
    expect(en.sweep_tail.alert_prefs.channel_required).not.toMatch(/[֐-׿]/);
  });

  it("0 channels (no WhatsApp, push not granted) → message shown", async () => {
    api.get.mockResolvedValue({ data: prefs(false) });
    setPushPermission("default");
    renderPanel();
    await loaded();
    expect(screen.getByTestId("alert-channel-required")).toHaveTextContent(CHANNEL_REQUIRED);
  });

  it("0 channels, push unsupported → message shown", async () => {
    api.get.mockResolvedValue({ data: prefs(false) });
    renderPanel();
    await loaded();
    expect(screen.getAllByTestId("alert-channel-required")).toHaveLength(1);
  });

  it("1 channel (WhatsApp) → message hidden", async () => {
    api.get.mockResolvedValue({ data: prefs(true) });
    renderPanel();
    await loaded();
    expect(screen.queryByTestId("alert-channel-required")).toBeNull();
  });

  it("1 channel (browser push granted) → message hidden", async () => {
    api.get.mockResolvedValue({ data: prefs(false) });
    setPushPermission("granted");
    renderPanel();
    await loaded();
    await waitFor(() => expect(screen.getByText(he.sweep_tail.alert_prefs.push_active)).toBeInTheDocument());
    expect(screen.queryByTestId("alert-channel-required")).toBeNull();
  });

  it("2 channels (WhatsApp + push) → message hidden", async () => {
    api.get.mockResolvedValue({ data: prefs(true) });
    setPushPermission("granted");
    renderPanel();
    await loaded();
    await waitFor(() => expect(screen.getByText(he.sweep_tail.alert_prefs.push_active)).toBeInTheDocument());
    expect(screen.queryByTestId("alert-channel-required")).toBeNull();
  });

  it("switching the only channel off makes the message appear", async () => {
    api.get.mockResolvedValue({ data: prefs(true) });
    renderPanel();
    await loaded();
    expect(screen.queryByTestId("alert-channel-required")).toBeNull();
    const switches = screen.getAllByRole("switch");
    // The WhatsApp switch is the fifth row (four alert types, then channels).
    fireEvent.click(switches[4]);
    expect(screen.getByTestId("alert-channel-required")).toHaveTextContent(CHANNEL_REQUIRED);
  });
});
