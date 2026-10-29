import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

/**
 * MEH-2526 — the permanent «קבלת עדכונים» button on the producer page.
 *
 * The four states the owner named, each asserted on BEHAVIOUR (which API calls
 * fire, with which body, and what aria-pressed reads afterwards):
 *   1. logged out          → login prompt, intent stored, ZERO API writes
 *   2. logged in, not saved → POST favorite + PUT alerts ON, cache updated
 *   3. saved, updates off   → PUT alerts ON only (no second POST)
 *   4. saved, updates on    → PUT alerts OFF (all four types false), no DELETE
 *
 * Real he.json through the real NextIntlClientProvider, so the label assertion
 * reads the shipped string, not a stand-in.
 */

const PID = "11111111-1111-4111-8111-111111111111";

const mockUser = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

// LoginPromptModal is FavoriteButton's logged-out path; stub it to an
// observable open flag so the test asserts the hand-off, not the modal.
vi.mock("@/components/LoginPromptModal", () => ({
  default: ({ open, message }) =>
    open ? <div data-testid="login-prompt">{message}</div> : null,
}));

import api from "@/lib/api";
import { isFavorited, resetFavoritesCache } from "@/lib/favorites-cache";
import ProducerUpdatesButton from "@/components/ProducerUpdatesButton";

const ALERTS_URL = `/users/me/favorites/${PID}/alerts`;

const OFF = {
  enabled: false,
  notify_new_event: false,
  notify_new_product: false,
  notify_delivery_area: false,
  notify_new_recipe: false,
  whatsapp_opt_in: false,
  has_push: false,
};

/** Route GETs: the favorites list (cache) and this producer's alert prefs. */
function serve({ favorites = [], alerts = OFF } = {}) {
  api.get.mockImplementation((url) => {
    if (url === "/users/me/favorites") return Promise.resolve({ data: favorites });
    if (url === ALERTS_URL) return Promise.resolve({ data: alerts });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

const renderButton = (props = {}) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerUpdatesButton producerId={PID} {...props} />
    </NextIntlClientProvider>,
  );

const button = () => screen.getByTestId("producer-updates-button");

beforeEach(() => {
  vi.clearAllMocks();
  resetFavoritesCache();
  sessionStorage.clear();
  mockUser.current = null;
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
  serve();
});

describe("MEH-2526 · copy", () => {
  it("the label is exactly «קבלת עדכונים», with an English twin", () => {
    expect(he.favorites.updates_button.label).toBe("קבלת עדכונים");
    expect(typeof en.favorites.updates_button.label).toBe("string");
    expect(en.favorites.updates_button.label).not.toMatch(/[֐-׿]/);
  });
});

describe("MEH-2526 · ProducerUpdatesButton", () => {
  it("logged out: renders the label, opens the login prompt, stores the intent, writes nothing", async () => {
    renderButton();
    expect(button()).toHaveTextContent(he.favorites.updates_button.label);
    expect(button()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button());

    expect(screen.getByTestId("login-prompt")).toHaveTextContent(
      he.favorites.button.login_prompt_message,
    );
    expect(JSON.parse(sessionStorage.getItem("pending_action"))).toMatchObject({
      type: "updates",
      producerId: PID,
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("logged in, NOT saved: saves to favorites AND turns updates on", async () => {
    mockUser.current = { id: "u1" };
    const onOpenAlerts = vi.fn();
    renderButton({ onOpenAlerts });
    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(button()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(`/users/me/favorites/${PID}`);
    // Order matters: the backend 400s an alerts PUT for an unsaved business.
    expect(api.post.mock.invocationCallOrder[0]).toBeLessThan(
      api.put.mock.invocationCallOrder[0],
    );
    expect(api.put).toHaveBeenCalledWith(ALERTS_URL, {
      notify_new_event: true,
      notify_new_product: true,
      notify_delivery_area: true,
      notify_new_recipe: true,
      whatsapp_opt_in: false,
      push_subscription: null,
    });
    expect(isFavorited(PID)).toBe(true);
    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "true"));
    // No delivery channel yet → the channel picker opens so the user can pick one.
    expect(onOpenAlerts).toHaveBeenCalledTimes(1);
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("not saved: a prefs read that fails mid-save does not leave the button inert after the PUT", async () => {
    // The save flips the shared favorites state, which re-reads the prefs
    // while the alerts PUT is still in flight. The row does not exist yet, so
    // that read can fail; the successful PUT is then the known state.
    mockUser.current = { id: "u1" };
    let readFails = false;
    api.get.mockImplementation((url) => {
      if (url === "/users/me/favorites") return Promise.resolve({ data: [] });
      if (url === ALERTS_URL) {
        return readFails ? Promise.reject(new Error("404")) : Promise.resolve({ data: OFF });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    let finishPut;
    api.put.mockImplementation(() => new Promise((r) => { finishPut = () => r({ data: {} }); }));
    renderButton({ onOpenAlerts: vi.fn() });
    await waitFor(() => expect(button()).not.toBeDisabled());

    readFails = true;
    const reads = api.get.mock.calls.filter(([u]) => u === ALERTS_URL).length;
    fireEvent.click(button());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([u]) => u === ALERTS_URL).length).toBeGreaterThan(reads),
    );
    await act(async () => { finishPut(); });

    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(button()).toHaveAttribute("aria-pressed", "true");
  });

  it("saved, updates OFF: turns updates on without re-saving", async () => {
    mockUser.current = { id: "u1" };
    serve({ favorites: [{ producer_id: PID }], alerts: OFF });
    renderButton();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(ALERTS_URL));
    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(button()).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put.mock.calls[0][1]).toMatchObject({
      notify_new_event: true,
      notify_new_product: true,
      notify_delivery_area: true,
      notify_new_recipe: true,
    });
    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "true"));
  });

  it("saved, an alert row with every type off still reads as OFF", async () => {
    mockUser.current = { id: "u1" };
    serve({ favorites: [{ producer_id: PID }], alerts: { ...OFF, enabled: true } });
    renderButton();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(ALERTS_URL));
    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(button()).toHaveAttribute("aria-pressed", "false");
  });

  it("saved, updates ON: shows the on state and toggles them off (favorite kept)", async () => {
    mockUser.current = { id: "u1", phone: "0501234567" };
    const onOpenAlerts = vi.fn();
    serve({
      favorites: [{ producer_id: PID }],
      alerts: {
        ...OFF,
        enabled: true,
        notify_new_event: true,
        notify_new_product: true,
        whatsapp_opt_in: true,
      },
    });
    renderButton({ onOpenAlerts });
    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(button());

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith(ALERTS_URL, {
      notify_new_event: false,
      notify_new_product: false,
      notify_delivery_area: false,
      notify_new_recipe: false,
      // The chosen channel survives an off/on cycle.
      whatsapp_opt_in: true,
      push_subscription: null,
    });
    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "false"));
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(isFavorited(PID)).toBe(true);
    expect(onOpenAlerts).not.toHaveBeenCalled();
  });

  it("turning ON with a channel already chosen does not reopen the channel picker", async () => {
    mockUser.current = { id: "u1", phone: "0501234567" };
    const onOpenAlerts = vi.fn();
    serve({
      favorites: [{ producer_id: PID }],
      alerts: { ...OFF, enabled: true, whatsapp_opt_in: true },
    });
    renderButton({ onOpenAlerts });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(ALERTS_URL));
    await waitFor(() => expect(button()).not.toBeDisabled());

    fireEvent.click(button());

    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "true"));
    expect(api.put.mock.calls[0][1].whatsapp_opt_in).toBe(true);
    expect(onOpenAlerts).not.toHaveBeenCalled();
  });

  it("a guest's stored intent completes after sign-in: save + updates on", async () => {
    sessionStorage.setItem(
      "pending_action",
      JSON.stringify({ type: "updates", producerId: PID, scrollY: 0 }),
    );
    window.scrollTo = vi.fn();
    mockUser.current = { id: "u1" };
    renderButton();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("pending_action")).toBeNull();
  });

  it("a failed prefs GET leaves the button inert — no click can PUT defaults over stored prefs", async () => {
    mockUser.current = { id: "u1", phone: "0501234567" };
    api.get.mockImplementation((url) => {
      if (url === "/users/me/favorites") return Promise.resolve({ data: [{ producer_id: PID }] });
      if (url === ALERTS_URL) return Promise.reject(new Error("network"));
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderButton();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(ALERTS_URL));
    // Let the rejected GET settle before probing.
    await new Promise((r) => setTimeout(r, 20));
    expect(button()).toBeDisabled();
    fireEvent.click(button());
    await new Promise((r) => setTimeout(r, 20));
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("POST favorite ok + alerts PUT fails: shared favorites state reads saved, error toasted once", async () => {
    const { showToast } = await import("@/lib/toast");
    mockUser.current = { id: "u1" };
    const onChanged = vi.fn();
    api.put.mockRejectedValueOnce(new Error("network"));
    renderButton({ onChanged });
    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(isFavorited(PID)).toBe(false);

    fireEvent.click(button());

    await waitFor(() => expect(showToast.error).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(isFavorited(PID)).toBe(true);
    expect(button()).toHaveAttribute("aria-pressed", "false");
    expect(showToast.success).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("a successful write reports onChanged so the page can re-read an open panel", async () => {
    mockUser.current = { id: "u1", phone: "0501234567" };
    const onChanged = vi.fn();
    serve({
      favorites: [{ producer_id: PID }],
      alerts: { ...OFF, enabled: true, notify_new_event: true, whatsapp_opt_in: true },
    });
    renderButton({ onChanged });
    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(button());

    await waitFor(() => expect(button()).toHaveAttribute("aria-pressed", "false"));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("a failed alerts PUT reverts the on state and toasts an error", async () => {
    const { showToast } = await import("@/lib/toast");
    mockUser.current = { id: "u1" };
    serve({ favorites: [{ producer_id: PID }], alerts: OFF });
    api.put.mockRejectedValueOnce(new Error("network"));
    renderButton();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(ALERTS_URL));
    await waitFor(() => expect(button()).not.toBeDisabled());

    fireEvent.click(button());

    await waitFor(() => expect(showToast.error).toHaveBeenCalledTimes(1));
    expect(button()).toHaveAttribute("aria-pressed", "false");
  });
});
