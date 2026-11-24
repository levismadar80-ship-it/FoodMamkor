/**
 * MEH-3690 — our own Google button. It is on screen before Google's script
 * has loaded, a tap opens Google's popup (GIS code client), the one-time code
 * is swapped at POST /auth/google/code, and the ID token that comes back goes
 * to loginWithGoogle exactly as the rendered button's credential did.
 *
 * What is real: GoogleAuthButton, ui/GoogleButton, useGoogleCodeSignIn,
 * loadGsiScript and the response schema. Faked: Google (window.google, the
 * <script> load event), the api client and the auth context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ default: { post: (...a) => post(...a) } }));
const loginWithGoogle = vi.fn(async () => {});
vi.mock("@/lib/auth-context", () => ({
  PasskeyStepRequired: class extends Error {},
  useAuth: () => ({ loginWithGoogle }),
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/register", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "ours.apps.googleusercontent.com" } }));

import GoogleAuthButton from "@/components/GoogleAuthButton";

const GSI = 'script[src^="https://accounts.google.com/gsi/client"]';
let codeClient;

function installFakeGoogle() {
  codeClient = { config: null, requestCode: vi.fn() };
  window.google = {
    accounts: {
      id: { initialize: vi.fn(), cancel: vi.fn(), renderButton: vi.fn(), prompt: vi.fn() },
      oauth2: {
        initCodeClient: vi.fn((config) => {
          codeClient.config = config;
          return codeClient;
        }),
      },
    },
  };
}

async function mount(props = {}) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  await act(async () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <GoogleAuthButton onSuccess={onSuccess} onError={onError} {...props} />
      </NextIntlClientProvider>,
    );
  });
  return { onSuccess, onError, button: screen.getByTestId("google-auth-button") };
}

beforeEach(() => {
  post.mockReset();
  loginWithGoogle.mockReset();
  loginWithGoogle.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  delete window.google;
  document.querySelectorAll(GSI).forEach((s) => s.remove());
});

describe("our own Google button (MEH-3690)", () => {
  it("is on screen, enabled and labelled before Google's script has loaded", async () => {
    const { button } = await mount();
    expect(window.google).toBeUndefined();
    expect(button.textContent).toBe("להמשיך עם Google");
    expect(button.disabled).toBe(false);
    expect(document.querySelectorAll(GSI)).toHaveLength(1);
  });

  it("asks Google for a popup code with the openid scope, for our client id", async () => {
    installFakeGoogle();
    await mount();
    expect(codeClient.config).toMatchObject({
      client_id: "ours.apps.googleusercontent.com",
      ux_mode: "popup",
    });
    expect(codeClient.config.scope.split(" ")).toContain("openid");
  });

  it("a tap opens Google's popup", async () => {
    installFakeGoogle();
    const { button } = await mount();
    fireEvent.click(button);
    expect(codeClient.requestCode).toHaveBeenCalledTimes(1);
  });

  it("a tap before the script loaded opens the popup once it has", async () => {
    const { button } = await mount();
    fireEvent.click(button);
    installFakeGoogle();
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("load")); });
    expect(codeClient.requestCode).toHaveBeenCalledTimes(1);
  });

  it("swaps the code, signs in with the ID token, and hands it to the caller", async () => {
    installFakeGoogle();
    post.mockResolvedValue({ data: { id_token: "google-id-token" } });
    const { onSuccess, onError } = await mount({ termsAccepted: true });
    await act(async () => { await codeClient.config.callback({ code: "4/0Abc" }); });
    expect(post).toHaveBeenCalledWith("/auth/google/code", { code: "4/0Abc" });
    expect(loginWithGoogle).toHaveBeenCalledWith("google-id-token", { termsAccepted: true });
    expect(onSuccess).toHaveBeenCalledWith("google-id-token");
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the server's Hebrew reason when the swap is refused", async () => {
    installFakeGoogle();
    post.mockRejectedValue({ response: { status: 401, data: { detail: "ההתחברות עם Google לא הושלמה. נסו שוב." } } });
    const { onSuccess, onError } = await mount();
    await act(async () => { await codeClient.config.callback({ code: "used" }); });
    expect(onError).toHaveBeenCalledWith("ההתחברות עם Google לא הושלמה. נסו שוב.");
    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not sign in on an answer without an ID token", async () => {
    installFakeGoogle();
    post.mockResolvedValue({ data: { access_token: "at" } });
    const { onError } = await mount();
    await act(async () => { await codeClient.config.callback({ code: "4/0Abc" }); });
    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(he.auth.oauth.google_error);
  });

  it("is disabled while the swap and the sign-in run", async () => {
    installFakeGoogle();
    let finish;
    post.mockReturnValue(new Promise((r) => { finish = r; }));
    const { button } = await mount();
    let pending;
    await act(async () => { pending = codeClient.config.callback({ code: "4/0Abc" }); });
    expect(button.disabled).toBe(true);
    await act(async () => { finish({ data: { id_token: "t" } }); await pending; });
    expect(button.disabled).toBe(false);
  });

  it("closing the popup or declining is not an error", async () => {
    installFakeGoogle();
    const { onError } = await mount();
    act(() => { codeClient.config.error_callback({ type: "popup_closed" }); });
    await act(async () => { await codeClient.config.callback({ error: "access_denied" }); });
    expect(onError).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("a popup that could not open is reported", async () => {
    installFakeGoogle();
    const { onError } = await mount();
    act(() => { codeClient.config.error_callback({ type: "popup_failed_to_open" }); });
    expect(onError).toHaveBeenCalledWith(he.auth.oauth.google_error);
  });

  it("a tap after the script failed to load is reported, not silent", async () => {
    const { button, onError } = await mount();
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("error")); });
    fireEvent.click(button);
    expect(onError).toHaveBeenCalledWith(he.auth.oauth.google_error);
  });

  // MEH-3690 review: a popup opened long after the tap is blocked by the
  // browser, so a late script leaves the button ready for a second tap.
  it("a tap more than a second before the script loaded waits for a second tap", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const { button } = await mount();
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    installFakeGoogle();
    now.mockReturnValue(12_000);
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("load")); });
    expect(codeClient.requestCode).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(codeClient.requestCode).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("a tap that waited for a script that then failed is reported", async () => {
    const { button, onError } = await mount();
    fireEvent.click(button);
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("error")); });
    expect(onError).toHaveBeenCalledWith(he.auth.oauth.google_error);
    expect(button.disabled).toBe(false);
  });

  it("a Google script without the code client is reported, not a dead button", async () => {
    window.google = { accounts: { id: { initialize: vi.fn() } } };
    const { button, onError } = await mount();
    fireEvent.click(button);
    expect(onError).toHaveBeenCalledWith(he.auth.oauth.google_error);
  });

  it("after a failed load, a tap reports and loads the script again for the next tap", async () => {
    const { button, onError } = await mount();
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("error")); });
    expect(document.querySelectorAll(GSI)).toHaveLength(0);
    await act(async () => { fireEvent.click(button); });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(GSI)).toHaveLength(1);
    installFakeGoogle();
    await act(async () => { document.querySelector(GSI).dispatchEvent(new Event("load")); });
    fireEvent.click(button);
    expect(codeClient.requestCode).toHaveBeenCalledTimes(1);
  });

  it("an answer from Google after the button is gone is ignored", async () => {
    installFakeGoogle();
    post.mockResolvedValue({ data: { id_token: "t" } });
    const { onSuccess } = await mount();
    const { callback } = codeClient.config;
    cleanup();
    await act(async () => { await callback({ code: "4/0Abc" }); });
    expect(post).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
