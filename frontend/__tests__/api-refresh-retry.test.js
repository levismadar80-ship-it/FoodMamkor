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

// MEH-2467: the two non-verdict ways a refresh can fail — the request never
// reached a server (axios sets no `response`), or the server was down (5xx).
function rejectNetwork(config) {
  const err = new Error("Network Error");
  err.config = config;
  err.code = "ERR_NETWORK";
  return Promise.reject(err);
}

function reject503(config) {
  const err = new Error("Request failed with status code 503");
  err.config = config;
  err.response = { status: 503, data: "Service Unavailable" };
  return Promise.reject(err);
}

/**
 * Install a mock adapter:
 * - /auth/refresh → refreshResult ("ok" resolves with a new token, "fail" 401s,
 *   "network" rejects with no response, "503" rejects with a 503 — MEH-2467)
 * - protected URLs → per-call script from protectedScript ("401" | "200")
 */
function installAdapter({ refreshResult = "ok", protectedScript }) {
  api.defaults.adapter = (config) => {
    const url = config.url ?? "";
    if (url.startsWith("/auth/refresh")) {
      refreshCalls.push(config);
      if (refreshResult === "ok") return resolve200(config, { access_token: "new-token" });
      if (refreshResult === "network") return rejectNetwork(config);
      if (refreshResult === "503") return reject503(config);
      return reject401(config);
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

    await expect(api.get("/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toHaveLength(1); // no second refresh — the loop is broken
    expect(protectedCalls).toHaveLength(2); // original + exactly one retry
    expect(expiredEvents).toBe(1);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("happy path unchanged: 401 → refresh-200 → retry 200 resolves with one refresh", async () => {
    installAdapter({ protectedScript: ["401", "200"] });

    const res = await api.get("/auth/me");

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(2);
    expect(expiredEvents).toBe(0);
    expect(localStorage.getItem("token")).toBe("new-token");
  });

  it("failed refresh: 401 → refresh-401 expires session, one anonymous retry, no refresh loop", async () => {
    installAdapter({ refreshResult: "fail", protectedScript: ["401", "401"] });

    await expect(api.get("/auth/me")).rejects.toMatchObject({
      response: { status: 401 },
    });

    // MEH-1315's invariant — the reason this test exists — is unchanged and
    // still the load-bearing assertion: a failed refresh must never lead to
    // another refresh.
    expect(refreshCalls).toHaveLength(1);
    expect(expiredEvents).toBe(1);

    // MEH-1627 changed the count below from 1 to 2, deliberately. The extra
    // call is the credential-free replay (a guest with a stale token should
    // still see a public resource), NOT an authenticated retry — which is
    // what the header assertion below pins. It terminates: the replay carries
    // _retry, so its own 401 rejects rather than refreshing again.
    expect(protectedCalls).toHaveLength(2);
    expect(protectedCalls[1].headers.Authorization).toBeUndefined();
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

/**
 * MEH-1627 — the backend now propagates a 401 for a present-but-invalid
 * Bearer token instead of silently treating the caller as anonymous. These
 * pin the two frontend halves of that contract.
 */
describe("MEH-1627 anonymous retry after failed refresh", () => {
  it("GET: failed refresh → exactly one retry, sent WITHOUT Authorization", async () => {
    // Guest with a stale localStorage token hitting a public resource:
    // the refresh fails (no valid refresh cookie), but the page itself
    // renders fine anonymously — so the retry must actually succeed.
    installAdapter({ refreshResult: "fail", protectedScript: ["401", "200"] });

    const res = await api.get("/producers");

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(2); // original + one anonymous retry
    // The whole point: the replay carries no credentials.
    expect(protectedCalls[1].headers.Authorization).toBeUndefined();
    expect(protectedCalls[1]._noAuth).toBe(true);
    // Session still expired — the toast fires exactly once, not twice.
    expect(expiredEvents).toBe(1);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("GET: anonymous retry that also 401s rejects without a second refresh", async () => {
    installAdapter({ refreshResult: "fail", protectedScript: ["401", "401"] });

    await expect(api.get("/producers")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(refreshCalls).toHaveLength(1); // no refresh loop
    expect(protectedCalls).toHaveLength(2); // no retry loop
    expect(expiredEvents).toBe(1); // _noAuth suppresses the duplicate
  });

  it("POST: failed refresh does NOT retry without auth", async () => {
    // Blocked by design. POST /auth/register/producer replayed without a
    // Bearer takes the anonymous-registration branch and 422s on the
    // absent email — re-creating MEH-1627's original bug behind a
    // success-shaped code path.
    installAdapter({ refreshResult: "fail", protectedScript: ["401", "200"] });

    await expect(api.post("/home-products", { name: "x" })).rejects.toMatchObject(
      { response: { status: 401 } }
    );

    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(1); // original only — no replay
    expect(expiredEvents).toBe(1);
  });

  it("POST /auth/register/producer is no longer skipped: 401 triggers refresh + retry", async () => {
    // The launch blocker. Both "/auth/register" and
    // "/auth/register/producer" prefix-match SKIP_REFRESH, so before
    // MEH-1627 the expired-token upgrade never got a refresh at all.
    installAdapter({ protectedScript: ["401", "200"] });

    const res = await api.post("/auth/register/producer", { producer_name: "x" });

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(1);
    expect(protectedCalls).toHaveLength(2); // original + authenticated replay
    expect(expiredEvents).toBe(0); // refresh succeeded — session intact
  });

  it("POST /auth/register/producer/oauth stays skipped (exact match, not prefix)", async () => {
    // A different endpoint that takes no optional auth; un-skipping it
    // would be collateral damage from a prefix match.
    installAdapter({ protectedScript: [] });

    await expect(
      api.post("/auth/register/producer/oauth", {})
    ).rejects.toMatchObject({ response: { status: 401 } });

    expect(refreshCalls).toHaveLength(0);
  });
});

// MEH-2467: a refresh that fails WITHOUT a server verdict (the request never
// arrived, or the server was down) must not end the session. Sapir was logged
// out of the admin twice on 28.10 with no 401/refresh/logout in the backend
// logs — the token was discarded client-side. Only 401/403 may do that.
describe("MEH-2467 transient refresh failure keeps the session", () => {
  it("401 → refresh Network Error: token kept, no auth:expired, rejects with the refresh error", async () => {
    installAdapter({ refreshResult: "network", protectedScript: ["401", "200"] });

    await expect(api.get("/users/me/favorites")).rejects.toMatchObject({
      code: "ERR_NETWORK",
    });

    expect(refreshCalls).toHaveLength(1);
    expect(expiredEvents).toBe(0);
    expect(localStorage.getItem("token")).toBe("stale-token");
    // No anonymous replay either: the session is not over, so there is no
    // guest to show a public view to.
    expect(protectedCalls).toHaveLength(1);
  });

  it("401 → refresh 503: same — the session outlives a backend outage", async () => {
    installAdapter({ refreshResult: "503", protectedScript: ["401", "200"] });

    await expect(api.get("/users/me/favorites")).rejects.toMatchObject({
      response: { status: 503 },
    });

    expect(refreshCalls).toHaveLength(1);
    expect(expiredEvents).toBe(0);
    expect(localStorage.getItem("token")).toBe("stale-token");
    expect(protectedCalls).toHaveLength(1);
  });

  it("401 → refresh 401 still ends the session (the verdict path is unchanged)", async () => {
    installAdapter({ refreshResult: "fail", protectedScript: ["401", "401"] });

    await expect(api.get("/users/me/favorites")).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(expiredEvents).toBe(1);
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("the shared in-flight refresh is released after a transient failure (next 401 refreshes again)", async () => {
    installAdapter({ refreshResult: "network", protectedScript: ["401", "401"] });
    await expect(api.get("/users/me/favorites")).rejects.toMatchObject({ code: "ERR_NETWORK" });

    // refreshCalls is deliberately NOT reset: the second round must add
    // exactly one refresh on top of the first round's. protectedCalls IS
    // reset — the adapter indexes its script by that list's length, so a
    // carried-over entry would answer round two's first call with "200" and
    // the 401 → refresh path under test would never run.
    protectedCalls = [];
    installAdapter({ refreshResult: "ok", protectedScript: ["401", "200"] });
    const res = await api.get("/users/me/favorites");

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toHaveLength(2); // 1 (network) + 1 (ok) — not stuck on the dead promise
    expect(expiredEvents).toBe(0);
  });
});
