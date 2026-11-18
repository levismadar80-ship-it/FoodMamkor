import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, PasskeyStepRequired, useAuth } from "../lib/auth-context.js";
import api from "../lib/api.js";
import { getPasskeyAssertion } from "../lib/webauthn.js";

/**
 * MEH-3305 — the second sign-in step in the browser.
 *
 * Pinned: a ticket answer from /auth/login stores NO token until the passkey
 * (or a recovery code) finishes it; a cancelled device prompt keeps the ticket
 * for the recovery form and throws PasskeyStepRequired (so the login page
 * shows no generic error); a consumer's sign-in is unchanged.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("../lib/api.js", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));
vi.mock("../lib/webauthn.js", () => ({ getPasskeyAssertion: vi.fn() }));
vi.mock("../lib/favorites-cache.js", () => ({
  ensureFavoritesLoaded: vi.fn(),
  resetFavoritesCache: vi.fn(),
  setFavoritedLocal: vi.fn(),
}));
vi.mock("../lib/post-login-action.js", () => ({
  readPendingAction: vi.fn(() => null),
  clearPendingAction: vi.fn(),
}));

const TICKET = { passkey_required: true, ticket: "tk", options: { challenge: "c" } };
let auth;
function Grab() {
  auth = useAuth();
  return <p data-testid="ticket">{auth.passkeyTicket ?? "none"}</p>;
}

async function mount() {
  render(
    <AuthProvider>
      <Grab />
    </AuthProvider>
  );
  await waitFor(() => expect(auth).toBeTruthy());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.get.mockResolvedValue({ data: { id: "u1", email: "a@example.com", role: "admin" } });
});

describe("passkey sign-in step", () => {
  it("passkey answered: verify is called, then the token is stored", async () => {
    await mount();
    getPasskeyAssertion.mockResolvedValue({ id: "cred" });
    api.post.mockImplementation(async (url) =>
      url === "/auth/login" ? { data: TICKET } : { data: { access_token: "final" } }
    );
    await act(() => auth.login("a@example.com", "pw"));
    expect(api.post).toHaveBeenCalledWith("/auth/passkey/login/verify", {
      ticket: "tk",
      credential: { id: "cred" },
    });
    expect(localStorage.getItem("token")).toBe("final");
  });

  it("prompt cancelled: no token, the ticket is kept, PasskeyStepRequired", async () => {
    await mount();
    getPasskeyAssertion.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    api.post.mockResolvedValue({ data: TICKET });
    let thrown;
    await act(async () => {
      try {
        await auth.login("a@example.com", "pw");
      } catch (e) {
        thrown = e;
      }
    });
    expect(thrown).toBeInstanceOf(PasskeyStepRequired);
    expect(localStorage.getItem("token")).toBeNull();
    expect(screen.getByTestId("ticket")).toHaveTextContent("tk");

    api.post.mockResolvedValue({ data: { access_token: "by-code" } });
    await act(() => auth.loginWithRecoveryCode("AAAAA-BBBBB"));
    expect(api.post).toHaveBeenLastCalledWith("/auth/passkey/login/recovery", {
      ticket: "tk",
      code: "AAAAA-BBBBB",
    });
    expect(localStorage.getItem("token")).toBe("by-code");
    expect(screen.getByTestId("ticket")).toHaveTextContent("none");
  });

  it("a consumer: the token from /auth/login is used as before", async () => {
    await mount();
    api.post.mockResolvedValue({ data: { access_token: "plain" } });
    await act(() => auth.login("c@example.com", "pw"));
    expect(getPasskeyAssertion).not.toHaveBeenCalled();
    expect(localStorage.getItem("token")).toBe("plain");
  });
});
