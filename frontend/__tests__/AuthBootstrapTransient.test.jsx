/**
 * MEH-2467 — AuthProvider bootstrap: a transient failure of GET /auth/me
 * (network error, 5xx) must NOT discard the stored token. Only a server
 * verdict (401/403) may. Before this change the catch removed the token on
 * every failure, so a request that never reached the backend logged the
 * user out with nothing in the server logs — the 28.10 admin logouts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AuthProvider, useAuth } from "../lib/auth-context.js";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

const apiGet = vi.fn();
vi.mock("../lib/api.js", () => ({
  default: {
    get: (...a) => apiGet(...a),
    patch: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
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

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p data-testid="user">{user ? user.name : "null"}</p>;
}

function axiosError(status) {
  const err = new Error(status ? `Request failed with status code ${status}` : "Network Error");
  if (status) err.response = { status, data: {} };
  else err.code = "ERR_NETWORK";
  return err;
}

async function bootWith(error) {
  localStorage.setItem("token", "jwt");
  localStorage.setItem("user", JSON.stringify({ id: "u1", name: "ספיר" }));
  apiGet.mockRejectedValueOnce(error);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByTestId("user");
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AuthProvider bootstrap — transient /auth/me failure (MEH-2467)", () => {
  it("Network Error: the token stays, nobody is logged out", async () => {
    await bootWith(axiosError(null));
    expect(localStorage.getItem("token")).toBe("jwt");
    expect(localStorage.getItem("user")).not.toBeNull();
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("503: the token stays", async () => {
    await bootWith(axiosError(503));
    expect(localStorage.getItem("token")).toBe("jwt");
  });

  it("401: the token is removed (the verdict path is unchanged)", async () => {
    await bootWith(axiosError(401));
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("403: the token is removed", async () => {
    await bootWith(axiosError(403));
    expect(localStorage.getItem("token")).toBeNull();
  });
});
