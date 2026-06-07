import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { showToast } from "@/lib/toast";
import { useAdminAction } from "@/lib/use-admin-action";

// UIS Pattern A hook (MEH-228): double-submit lock + error surface + reset.
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn() } }));
vi.mock("@/lib/errors", () => ({ errorMessage: (e) => `mapped:${e.message}` }));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAdminAction", () => {
  beforeEach(() => {
    showToast.error.mockClear();
  });

  it("runs fn, is busy while in-flight, resets on success", async () => {
    const { result } = renderHook(() => useAdminAction());
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    act(() => {
      result.current.run("k1", fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.isBusy("k1")).toBe(true);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(result.current.isBusy("k1")).toBe(false);
  });

  it("blocks a second call on the same key while in-flight (no double-fire)", async () => {
    const { result } = renderHook(() => useAdminAction());
    const d = deferred();
    const fn = vi.fn(() => d.promise);

    act(() => {
      result.current.run("k1", fn);
    });
    act(() => {
      result.current.run("k1", fn); // ignored — already in flight
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve();
      await d.promise;
    });
  });

  it("allows concurrent different keys", () => {
    const { result } = renderHook(() => useAdminAction());
    act(() => {
      result.current.run("a", () => deferred().promise);
      result.current.run("b", () => deferred().promise);
    });
    expect(result.current.isBusy("a")).toBe(true);
    expect(result.current.isBusy("b")).toBe(true);
  });

  it("surfaces the central errorMessage toast on throw and resets", async () => {
    const { result } = renderHook(() => useAdminAction());
    await act(async () => {
      await result.current.run("k1", () => Promise.reject(new Error("boom")));
    });
    expect(showToast.error).toHaveBeenCalledWith("mapped:boom");
    expect(result.current.isBusy("k1")).toBe(false);
  });

  it("uses a custom string error message when provided", async () => {
    const { result } = renderHook(() => useAdminAction());
    await act(async () => {
      await result.current.run("k1", () => Promise.reject(new Error("x")), "מחיקה נכשלה");
    });
    expect(showToast.error).toHaveBeenCalledWith("מחיקה נכשלה");
  });

  it("calls a custom onError function when provided", async () => {
    const { result } = renderHook(() => useAdminAction());
    const onError = vi.fn();
    await act(async () => {
      await result.current.run("k1", () => Promise.reject(new Error("x")), onError);
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(showToast.error).not.toHaveBeenCalled();
  });
});
