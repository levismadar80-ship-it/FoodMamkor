/**
 * MEH-1485 — profile city ↔ localStorage bridge.
 *
 * seedCityFromProfile: one-shot seed on auth load (localStorage wins).
 * auth-context write-back: a logged-in city pick (city-changed event) PUTs
 * to the profile; guests are a no-op.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth-context.js";
import {
  seedCityFromProfile,
  readUserCity,
  USER_CITY_CHANGED_EVENT,
} from "../lib/use-user-city.js";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

// Mutable handles so each test controls /auth/me + spies on /users/me.
const apiGet = vi.fn(() => Promise.reject(new Error("no token")));
const apiPatch = vi.fn((_url, body) =>
  Promise.resolve({ data: { id: "u1", name: "טסט", city: body.city } }),
);
vi.mock("../lib/api.js", () => ({
  default: {
    get: (...a) => apiGet(...a),
    patch: (...a) => apiPatch(...a),
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

vi.mock("../lib/toast.js", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

function UserDisplay() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p data-testid="user">{user ? user.name : "null"}</p>;
}

describe("seedCityFromProfile (MEH-1485)", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("seeds localStorage from the profile when localStorage is empty + dispatches the event", () => {
    const onEvent = vi.fn();
    window.addEventListener(USER_CITY_CHANGED_EVENT, onEvent);
    seedCityFromProfile("רעננה");
    window.removeEventListener(USER_CITY_CHANGED_EVENT, onEvent);

    expect(readUserCity()).toBe("רעננה");
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("localStorage wins — does NOT overwrite an existing explicit choice", () => {
    localStorage.setItem("user_city", "תל אביב");
    const onEvent = vi.fn();
    window.addEventListener(USER_CITY_CHANGED_EVENT, onEvent);
    seedCityFromProfile("רעננה");
    window.removeEventListener(USER_CITY_CHANGED_EVENT, onEvent);

    expect(readUserCity()).toBe("תל אביב");
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("no profile city → no-op", () => {
    seedCityFromProfile(null);
    expect(readUserCity()).toBeNull();
  });
});

describe("auth-context city write-back (MEH-1485)", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("logged-in city pick writes back to the profile (best-effort PATCH)", async () => {
    localStorage.setItem("token", "jwt");
    apiGet.mockResolvedValueOnce({
      data: { id: "u1", name: "דנה", city: "חיפה" },
    });

    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>,
    );
    await screen.findByText("דנה");

    // An explicit pick elsewhere sets localStorage + fires the shared event.
    await act(async () => {
      localStorage.setItem("user_city", "רעננה");
      window.dispatchEvent(new CustomEvent(USER_CITY_CHANGED_EVENT));
    });

    expect(apiPatch).toHaveBeenCalledWith("/users/me", { city: "רעננה" });
  });

  it("seed value (localCity === profile city) does NOT trigger a redundant PATCH", async () => {
    localStorage.setItem("token", "jwt");
    apiGet.mockResolvedValueOnce({
      data: { id: "u1", name: "דנה", city: "חיפה" },
    });

    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>,
    );
    await screen.findByText("דנה");

    await act(async () => {
      localStorage.setItem("user_city", "חיפה"); // same as profile
      window.dispatchEvent(new CustomEvent(USER_CITY_CHANGED_EVENT));
    });

    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("guest city pick is a no-op — no PATCH fired", async () => {
    // No token → /auth/me rejects → user stays null.
    render(
      <AuthProvider>
        <UserDisplay />
      </AuthProvider>,
    );
    await screen.findByText("null");

    await act(async () => {
      localStorage.setItem("user_city", "רעננה");
      window.dispatchEvent(new CustomEvent(USER_CITY_CHANGED_EVENT));
    });

    expect(apiPatch).not.toHaveBeenCalled();
  });
});
