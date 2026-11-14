/**
 * MEH-2467 — AuthProvider bootstrap: a transient failure of GET /auth/me
 * (network error, 5xx) must NOT discard the stored token. Only a server
 * verdict (401/403) may. Before this change the catch removed the token on
 * every failure, so a request that never reached the backend logged the
 * user out with nothing in the server logs — the 28.10 admin logouts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
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

// MEH-3172: the same split, exposed as a flag the layouts read.
function FlagProbe() {
  const { loading, authUnreachable } = useAuth();
  if (loading) return <p>loading</p>;
  return <p data-testid="flag">{String(authUnreachable)}</p>;
}

async function flagAfter(error) {
  localStorage.setItem("token", "jwt");
  apiGet.mockRejectedValueOnce(error);
  render(
    <AuthProvider>
      <FlagProbe />
    </AuthProvider>,
  );
  return (await screen.findByTestId("flag")).textContent;
}

describe("AuthProvider — authUnreachable (MEH-3172)", () => {
  it("Network Error with a stored token → unreachable", async () => {
    expect(await flagAfter(axiosError(null))).toBe("true");
  });

  it("502 → unreachable", async () => {
    expect(await flagAfter(axiosError(502))).toBe("true");
  });

  it("401 → not unreachable (a real sign-out)", async () => {
    expect(await flagAfter(axiosError(401))).toBe("false");
  });

  it("no stored token → not unreachable", async () => {
    render(
      <AuthProvider>
        <FlagProbe />
      </AuthProvider>,
    );
    expect((await screen.findByTestId("flag")).textContent).toBe("false");
    expect(apiGet).not.toHaveBeenCalled();
  });
});

// MEH-3172: the real provider's retry and the paths that must clear the flag.
function RetryProbe() {
  const { user, loading, authUnreachable, retrySession, logout } = useAuth();
  if (loading) return <p data-testid="loading">loading</p>;
  return (
    <div>
      <p data-testid="state">{`${user ? user.name : "null"}|${authUnreachable}`}</p>
      <button onClick={retrySession}>retry</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

async function bootUnreachable() {
  localStorage.setItem("token", "jwt");
  apiGet.mockRejectedValueOnce(axiosError(502));
  render(
    <AuthProvider>
      <RetryProbe />
    </AuthProvider>,
  );
  expect((await screen.findByTestId("state")).textContent).toBe("null|true");
}

describe("AuthProvider — retrySession and clearing the flag (MEH-3172)", () => {
  it("502 → retry → 200: user set, flag cleared, and loading in between", async () => {
    await bootUnreachable();
    let resolve;
    apiGet.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByText("retry"));
    // While the retry is in flight the layouts must see loading, not "signed out".
    expect(screen.getByTestId("loading")).toBeTruthy();
    await act(async () => resolve({ data: { id: "u1", name: "ספיר" } }));
    expect((await screen.findByTestId("state")).textContent).toBe("ספיר|false");
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("502 → retry → 401: token removed, flag cleared (a real sign-out)", async () => {
    await bootUnreachable();
    apiGet.mockRejectedValueOnce(axiosError(401));
    fireEvent.click(screen.getByText("retry"));
    expect((await screen.findByTestId("state")).textContent).toBe("null|false");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("flag true → logout(): flag cleared, token removed", async () => {
    await bootUnreachable();
    fireEvent.click(screen.getByText("logout"));
    expect(screen.getByTestId("state").textContent).toBe("null|false");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("flag true → auth:expired event: flag cleared", async () => {
    await bootUnreachable();
    act(() => { window.dispatchEvent(new Event("auth:expired")); });
    expect(screen.getByTestId("state").textContent).toBe("null|false");
  });
});
