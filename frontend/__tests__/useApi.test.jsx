/**
 * MEH-3536: the shared data layer (lib/use-api.js). What every screen moved
 * onto it relies on: identical reads share one request, a signed-in read is
 * keyed by the user so the next account never sees the previous one's answer,
 * a failure is not retried behind the screen's back, and a write can refresh
 * every reader of a path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";

const { getMock, authRef } = vi.hoisted(() => ({
  getMock: vi.fn(),
  authRef: { current: { user: { id: 1 }, loading: false } },
}));
vi.mock("@/lib/api", () => ({ default: { get: getMock } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));

import { useApi, useUserApi, invalidateApi, apiKey } from "@/lib/use-api";

// A fresh cache per test; deduping left at the layer's own default so the
// dedup case measures the real setting.
const Fresh = ({ children }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

function Reader({ path, testId = "out", user = false, ...options }) {
  const hook = user ? useUserApi : useApi;
  const { data, error } = hook(path, options);
  return <p data-testid={testId}>{error ? "error" : data === undefined ? "…" : JSON.stringify(data)}</p>;
}

beforeEach(() => {
  getMock.mockReset();
  authRef.current = { user: { id: 1 }, loading: false };
});

describe("useApi (MEH-3536)", () => {
  it("two components reading the same path send one request", async () => {
    getMock.mockResolvedValue({ data: { n: 1 } });
    render(
      <Fresh>
        <Reader path="/categories" testId="a" />
        <Reader path="/categories" testId="b" />
      </Fresh>,
    );
    expect(await screen.findByText('{"n":1}', { selector: '[data-testid="a"]' })).toBeInTheDocument();
    expect(screen.getByTestId("b").textContent).toBe('{"n":1}');
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith("/categories", undefined);
  });

  it("params reach api.get and make a different key", async () => {
    getMock.mockImplementation((_path, cfg) => Promise.resolve({ data: cfg.params.id }));
    render(
      <Fresh>
        <Reader path="/reviews" testId="a" params={{ id: 1 }} />
        <Reader path="/reviews" testId="b" params={{ id: 2 }} />
      </Fresh>,
    );
    await waitFor(() => expect(screen.getByTestId("b").textContent).toBe("2"));
    expect(screen.getByTestId("a").textContent).toBe("1");
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("enabled:false and a null path send nothing", async () => {
    getMock.mockResolvedValue({ data: 1 });
    render(
      <Fresh>
        <Reader path="/a" enabled={false} testId="a" />
        <Reader path={null} testId="b" />
      </Fresh>,
    );
    await act(async () => {});
    expect(getMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("a").textContent).toBe("…");
  });

  it("a failed read shows the error and is not retried automatically", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    // A 5 ms retry interval: if the layer retried, the second call would land
    // well inside the 150 ms below (SWR's default 5 s would hide it).
    render(
      <SWRConfig value={{ provider: () => new Map(), errorRetryInterval: 5 }}>
        <Reader path="/a" />
      </SWRConfig>,
    );
    expect(await screen.findByText("error")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 150));
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("regaining focus does not refetch", { timeout: 6000 }, async () => {
    getMock.mockResolvedValue({ data: 1 });
    render(
      <SWRConfig value={{ provider: () => new Map(), focusThrottleInterval: 0, dedupingInterval: 0 }}>
        <Reader path="/a" />
      </SWRConfig>,
    );
    expect(await screen.findByText("1")).toBeInTheDocument();
    // Past the layer's 2 s dedup window (a hook option, so it beats the
    // SWRConfig above): inside it a focus refetch would be deduped and this
    // case could not tell revalidateOnFocus on from off.
    await new Promise((r) => setTimeout(r, 2100));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("a transform without a view name throws, with one it shapes the cached answer", async () => {
    getMock.mockResolvedValue({ data: [3, 1, 2] });
    // The check runs before any hook, so it can be called directly.
    expect(() => useApi("/categories", { transform: (d) => d })).toThrow(/needs a view name/);
    render(<Fresh><Reader path="/a" view="sorted" transform={(d) => [...d].sort()} /></Fresh>);
    expect(await screen.findByText("[1,2,3]")).toBeInTheDocument();
  });

  it("invalidateApi(path) refetches every reader of that path", async () => {
    let n = 0;
    getMock.mockImplementation(() => Promise.resolve({ data: ++n }));
    // invalidateApi works on the global cache, so this case uses it.
    render(<Reader path="/meh3536-invalidate" />);
    expect(await screen.findByText("1")).toBeInTheDocument();
    await act(() => invalidateApi("/meh3536-invalidate"));
    expect(await screen.findByText("2")).toBeInTheDocument();
  });
});

describe("useUserApi (MEH-3536)", () => {
  it("sends nothing while auth is loading or nobody is signed in", async () => {
    getMock.mockResolvedValue({ data: 1 });
    authRef.current = { user: null, loading: true };
    const { rerender } = render(<Fresh><Reader path="/producers/me" user /></Fresh>);
    authRef.current = { user: null, loading: false };
    rerender(<Fresh><Reader path="/producers/me" user /></Fresh>);
    await act(async () => {});
    expect(getMock).not.toHaveBeenCalled();
  });

  it("a different signed-in user never sees the previous user's cached answer", async () => {
    getMock.mockImplementation(() =>
      Promise.resolve({ data: { owner: authRef.current.user.id } }),
    );
    const cache = new Map();
    const Shared = ({ children }) => <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>;
    const { unmount } = render(<Shared><Reader path="/producers/me" user /></Shared>);
    expect(await screen.findByText('{"owner":1}')).toBeInTheDocument();
    unmount();

    // Same tab, same cache: user 1 logs out, user 2 signs in.
    authRef.current = { user: { id: 2 }, loading: false };
    let resolve;
    getMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<Shared><Reader path="/producers/me" user /></Shared>);
    // While user 2's request is in flight, nothing of user 1's is shown.
    expect(screen.getByTestId("out").textContent).toBe("…");
    await act(async () => resolve({ data: { owner: 2 } }));
    expect(screen.getByTestId("out").textContent).toBe('{"owner":2}');
  });

  it("the key carries the user id", () => {
    expect(apiKey("/producers/me", { userId: 7 })).toEqual(["/producers/me", null, null, 7]);
  });
});
