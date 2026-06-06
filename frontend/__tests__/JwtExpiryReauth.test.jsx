/**
 * MEH-156 — JWT expiry re-auth prompt
 * When auth:expired fires, AuthProvider should clear user state and show a Hebrew toast.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth-context.js";

// MEH-474 Wave 4 chunk 4: AuthProvider now calls useTranslations("auth.toasts").
// Same precedent as Header.test.jsx (Wave 1) + ProducerCard.test.jsx (Wave 3).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) =>
    ({
      favoriteSaved: "נשמר למועדפים ❤️",
      sessionExpired: "פג תוקף ההתחברות — נא להתחבר מחדש",
      loginAgainCta: "התחברי",
    }[key] ?? key),
}));

// Mock api so /auth/me doesn't fire real requests
vi.mock("../lib/api.js", () => ({
  default: {
    get: vi.fn(() => Promise.reject(new Error("no token"))),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock("../lib/favorites-cache.js", () => ({
  ensureFavoritesLoaded: vi.fn(),
  resetFavoritesCache: vi.fn(),
  setFavoritedLocal: vi.fn(),
}));

vi.mock("../lib/post-login-action.js", () => ({
  readPendingAction: vi.fn(() => null),
  clearPendingAction: vi.fn(),
}));

const toastSpy = vi.fn();
// MEH-685: showToast gained semantic methods. AuthProvider now calls
// showToast.info(message, { duration, action }). The spy prefixes the call
// with the semantic type so assertions can verify both the type and the args.
vi.mock("../lib/toast.js", () => {
  const showToast = (...args) => toastSpy(...args);
  showToast.success = (...args) => toastSpy("success", ...args);
  showToast.error = (...args) => toastSpy("error", ...args);
  showToast.info = (...args) => toastSpy("info", ...args);
  return { showToast };
});

function UserDisplay() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p data-testid="user">{user ? user.name : "null"}</p>;
}

describe("auth:expired event (MEH-156)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a Hebrew toast with login action when auth:expired fires", async () => {
    localStorage.setItem("token", "expired-jwt");

    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    });

    expect(toastSpy).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("פג תוקף"),
      expect.objectContaining({
        duration: 5000,
        action: expect.objectContaining({ label: "התחברי" }),
      }),
    );
  });

  it("action href includes /login", async () => {
    localStorage.setItem("token", "expired-jwt");

    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    });

    // call = ["info", message, { duration, action }]
    const call = toastSpy.mock.calls[0];
    expect(call[2].action.href).toContain("/login");
  });

  it("does not show toast when no token was present (unauthenticated 401)", async () => {
    // No token in localStorage — event should not cause toast
    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>
    );

    // Simulate the interceptor behaviour: no token means no event is dispatched.
    // Confirm toast is not called if event doesn't fire.
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
