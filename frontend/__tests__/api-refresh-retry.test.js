/**
 * MEH-1315 — axios interceptor retry-once guard.
 * A request that already retried after a successful refresh must not
 * trigger a second refresh. Sequence 401 → refresh-200 → 401 must call
 * /auth/refresh exactly ONCE, expire the session, and reject.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import api from "../lib/api.js";

// Build an axios-shaped rejection the response interceptor understands.
function reject401(config) {
  const err = new Error("Request failed with status code 401");
  err.config = config;
  err.response = { status: 401, data: { detail: "unauthorized" } };
  return Promise.reject(err);
}

function resolve200(config, data) {
  return Promise.resolve({
    status: 200,
    statusText: "OK",
    headers: {},
    config,
    data,
  });
}

let refreshCalls;
let protectedCalls;
let expiredEvents;
let onExpired;

/**
 * Install a mock adapter:
 * - /auth/refresh → refreshResult ("ok" resolves with a new token, "fail" 401s)
 * - protected URLs → per-call script from protectedScript ("401" | "200")
 */
function installAdapter({ refreshResult = "ok", protectedScript }) {
  api.defaults.adapter = (config) => {
    const url = config.url ?? "";
    if (url.startsWith("/auth/refresh")) {
      refreshCalls.push(config);
      return refreshResult === "ok"
        ? resolve200(config, { access_token: "new-token" })
        : reject401(config);
    }
    if (url.startsWith("/auth/login")) {
      return reject401(config);
    }
    protectedCalls.push(config);
    const step = protectedScript[Math.min(protectedCalls.length - 1, protectedScript.length - 1)];
    return step === "200" ? resolve200(config, { ok: true }) : reject401(config);
  };
}

beforeEach(() => {
  refreshCalls = [];
  protectedCalls = [];
  expiredEvents = 0;
  onExpired = () => {
    expiredEvents += 1;
  };
  window.addEventListener("auth:expired", onExpired);
  localStorage.setItem("token", "stale-token");
});

afterEach(() => {
  window.removeEventListener("auth:expired", onExpired);
  localStorage.clear();
  vi.clearAllMocks();
});

describe("MEH-1315 retry-once guard", () => {
  it("401 → refresh-200 → 401 again: exactly ONE refresh call, session expired, rejects", async () => {
    installAdapter({ protectedScript: ["401", "401"] });

    await expect(api.get("/users/me")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toHaveLength(1); // no second refresh — the loop is broken
    expect(protectedCalls).toHaveLength(2); // original + exactly one retry
    expect(expiredEvents).toBe(1);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("happy path unchanged: 401 → refresh-200 → retry 200 resolves with one refresh", async () => {
    installAdapter({ protectedScript: ["401", "200"] });

    const res = await api.get("/users/me");

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(2);
    expect(expiredEvents).toBe(0);
    expect(localStorage.getItem("token")).toBe("new-token");
  });

  it("failed refresh unchanged: 401 → refresh-401 expires session without retrying", async () => {
    installAdapter({ refreshResult: "fail", protectedScript: ["401"] });

    await expect(api.get("/users/me")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(1); // no retry after failed refresh
    expect(expiredEvents).toBe(1);
  });

  it("SKIP_REFRESH unchanged: 401 on /auth/login never triggers refresh", async () => {
    installAdapter({ protectedScript: [] });

    await expect(api.post("/auth/login", {})).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toHaveLength(0);
    expect(expiredEvents).toBe(0);
  });
});
