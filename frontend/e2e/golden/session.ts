/**
 * Module:   golden/session
 * Purpose:  Log a golden persona in ONCE per worker, serially, and hand the
 *           specs (a) an authenticated API client and (b) a browser
 *           storageState for the same login.
 * Does NOT: create, seed or repair accounts — `seed_demo_business.py --golden`
 *           does that, on staging, run by Sapir. Does NOT log a password or a
 *           token.
 * Related:  e2e/login-retry.ts (`withRateLimitRetry`, MEH-2895 — the 429 retry
 *           this uses) · e2e/global-setup.ts (the same login + localStorage
 *           shape for the demo roles) · e2e/golden/personas.ts
 * History:  MEH-2897 (creation).
 *
 * ─── Serial logins ──────────────────────────────────────────────────────────
 *
 * `/auth/login` allows 5 a minute per client IP (anchor plan §E2). The golden
 * project runs one worker, and every login here also goes through one promise
 * chain, so two logins never overlap even if a spec asks for two personas at
 * once. A 429 is waited out by `withRateLimitRetry`; anything else fails loudly.
 *
 * ─── One request context per persona ───────────────────────────────────────
 *
 * The access token is bound to the `__Secure-Fgp` cookie set by the login
 * response (auth.py `_check_fingerprint`, MEH-327). API calls therefore go
 * through the SAME request context that logged in, which carries the cookie,
 * and the browser state is built from that context's cookies.
 *
 * The client is named `api` so scripts/check_api_contract.py (Deploy gate)
 * checks every path and verb the golden specs call against the real routes.
 */
import {
  expect,
  request,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { withRateLimitRetry } from "../login-retry";
import { PERSONAS, type Persona, type PersonaKey } from "./personas";

/** Re-login after this long: the access token lives 15 minutes (config.py). */
const TOKEN_REUSE_MS = 12 * 60 * 1000;

type Me = {
  id: string;
  email: string;
  role: string;
  producer_id?: string | null;
  producer_kind?: string | null;
};

type JsonBody = Record<string, unknown> | unknown[];

/** The authenticated client. Paths are backend paths; `/api` is added here. */
type GoldenApi = {
  get(path: string): Promise<APIResponse>;
  post(path: string, data?: JsonBody): Promise<APIResponse>;
  put(path: string, data?: JsonBody): Promise<APIResponse>;
  patch(path: string, data?: JsonBody): Promise<APIResponse>;
  delete(path: string): Promise<APIResponse>;
};

export type GoldenSession = {
  persona: Persona;
  me: Me;
  api: GoldenApi;
  /** A browser context logged in as this persona (caller closes it). */
  newContext(browser: Browser): Promise<BrowserContext>;
};

type Entry = { session: GoldenSession; ctx: APIRequestContext; at: number };

const cache = new Map<PersonaKey, Entry>();
let loginChain: Promise<unknown> = Promise.resolve();

function isLocal(baseURL: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);
}

function bypassHeaders(baseURL: string): Record<string, string> {
  if (isLocal(baseURL)) return {};
  const secret =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    process.env.VERCEL_BYPASS_SECRET ||
    "";
  if (!secret) {
    throw new Error(
      `[golden] ${baseURL} is behind Vercel Deployment Protection and ` +
        "VERCEL_AUTOMATION_BYPASS_SECRET is not set — every request would 302 to the SSO wall.",
    );
  }
  return { "x-vercel-protection-bypass": secret };
}

function makeApi(ctx: APIRequestContext, token: string): GoldenApi {
  // Per-verb calls, not a generic request with a templated URL: the contract
  // checker reads a templated request URL as a call to the route `/api{_}`
  // and reports it as an orphan (Deploy gate). The verbs below are checked
  // where the specs call `api.<verb>("/path")`.
  const headers = { Authorization: `Bearer ${token}` };
  const opts = (data?: JsonBody) =>
    data === undefined ? { headers } : { headers, data };
  return {
    get: (path) => ctx.get(`/api${path}`, opts()),
    post: (path, data) => ctx.post(`/api${path}`, opts(data)),
    put: (path, data) => ctx.put(`/api${path}`, opts(data)),
    patch: (path, data) => ctx.patch(`/api${path}`, opts(data)),
    delete: (path) => ctx.delete(`/api${path}`, opts()),
  };
}

async function login(key: PersonaKey, baseURL: string): Promise<Entry> {
  // The personas exist only on staging; their writes must never reach the
  // live site (anchor plan §C.2: no production smoke before `is_test`).
  if (/(^|\.)mehamakor\.co\.il$/i.test(new URL(baseURL).hostname)) {
    throw new Error(
      `[golden] refusing to run against production (${baseURL}).`,
    );
  }
  const persona = PERSONAS[key];
  const password = process.env[persona.passwordEnv];
  if (!password) {
    throw new Error(
      `[golden] ${persona.passwordEnv} is not set — cannot log in ${persona.email}. ` +
        "The golden personas use the existing QA secrets (MEH-2897).",
    );
  }
  const ctx = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: bypassHeaders(baseURL),
  });
  const { response, attempts } = await withRateLimitRetry(
    () =>
      ctx.post("/api/auth/login", { data: { email: persona.email, password } }),
    {
      onRetry: ({ attempt, waitMs }) =>
        console.warn(
          `[golden] login for ${key} got HTTP 429 (attempt ${attempt}) — ` +
            `waiting ${Math.round(waitMs / 1000)}s for the per-IP limit window.`,
        ),
    },
  );
  if (!response.ok()) {
    await ctx.dispose();
    throw new Error(
      `[golden] login failed for ${key} (${persona.email}) at ${baseURL}: HTTP ` +
        `${response.status()} after ${attempts} attempt(s). Has Sapir run ` +
        "`seed_demo_business.py --golden` on this target?",
    );
  }
  const { access_token: token } = await response.json();
  if (!token)
    throw new Error(`[golden] login for ${key} returned no access_token.`);

  const api = makeApi(ctx, token);
  const meRes = await api.get("/auth/me");
  expect(meRes.status(), `${key}: GET /auth/me`).toBe(200);
  const me = (await meRes.json()) as Me;
  expect(me.email, `${key}: logged in as the persona`).toBe(persona.email);
  expect(me.role, `${key}: role`).toBe(persona.role);

  const origin = new URL(baseURL).origin;
  const session: GoldenSession = {
    persona,
    me,
    api,
    async newContext(browser) {
      const state = await ctx.storageState();
      state.origins = [
        {
          origin,
          localStorage: [
            // The SPA reads its JWT from here (lib/auth-context.js).
            { name: "token", value: token },
            // Same as global-setup: keep the cookie banner's dialog out of
            // every locator (MEH-1241).
            { name: "cookieConsent", value: "essential" },
          ],
        },
      ];
      return browser.newContext({ storageState: state });
    },
  };
  return { session, ctx, at: Date.now() };
}

/**
 * The persona's session, logging in if this worker has not yet (or if the
 * token is near its 15-minute expiry). Logins are serialised across callers.
 */
export async function goldenSession(
  key: PersonaKey,
  baseURL: string,
): Promise<GoldenSession> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TOKEN_REUSE_MS) return cached.session;
  const next = loginChain.then(async () => {
    if (cached) await cached.ctx.dispose();
    const entry = await login(key, baseURL);
    cache.set(key, entry);
    return entry.session;
  });
  // Keep the chain alive after a failure, so the next persona still logs in.
  loginChain = next.catch(() => undefined);
  return next;
}

/** Fail with the response body in the message — a bare status hides the cause. */
export async function expectStatus(
  res: APIResponse,
  expected: number | number[],
  what: string,
): Promise<void> {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(res.status())) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${what}: HTTP ${res.status()} (expected ${allowed.join("/")}) — ${body.slice(0, 300)}`,
    );
  }
}

/** A tag that makes everything a run creates recognisable, and unique per run. */
export function runTag(): string {
  return `golden-${Date.now().toString(36)}`;
}

/** Matches a `runTag()` inside a name or title. Seeded rows never carry one. */
const RUN_TAG = /golden-[0-9a-z]{6,}/;

/**
 * Remove what an EARLIER run created and never cleaned up — a test killed by
 * its timeout skips its `finally`. Called at the start of the spec that would
 * collide with the leftover, before it creates anything. Only rows whose name
 * carries a run tag are touched; seeded rows have none.
 */
export async function sweepLeftovers(session: GoldenSession): Promise<number> {
  const { api } = session;
  let swept = 0;
  if (session.persona.key === "g1") {
    const products = await api.get("/producers/me/products");
    await expectStatus(products, 200, "GET /producers/me/products (sweep)");
    for (const p of (await products.json()) as { id: string; name: string }[]) {
      if (!RUN_TAG.test(p.name)) continue;
      await expectStatus(
        await api.delete(`/producers/me/products/${p.id}`),
        [200, 204],
        "DELETE /producers/me/products/{id} (sweep)",
      );
      swept += 1;
    }
    const buys = await api.get("/producers/me/group-buys");
    await expectStatus(buys, 200, "GET /producers/me/group-buys (sweep)");
    for (const gb of (await buys.json()) as {
      id: string;
      title: string;
      status: string;
    }[]) {
      if (!RUN_TAG.test(gb.title) || !["open", "funded"].includes(gb.status))
        continue;
      await expectStatus(
        await api.patch(`/group-buys/${gb.id}/status`, { status: "cancelled" }),
        200,
        "PATCH /group-buys/{id}/status (sweep)",
      );
      swept += 1;
    }
  }
  if (session.persona.key === "g2") {
    const events = await api.get("/events/mine");
    await expectStatus(events, 200, "GET /events/mine (sweep)");
    for (const ev of (await events.json()) as { id: string; title: string }[]) {
      if (!RUN_TAG.test(ev.title)) continue;
      await expectStatus(
        await api.delete(`/events/${ev.id}`),
        [200, 204],
        "DELETE /events/{id} (sweep)",
      );
      swept += 1;
    }
  }
  if (swept > 0)
    console.warn(
      `[golden] swept ${swept} leftover(s) of an earlier run for ${session.persona.key}.`,
    );
  return swept;
}
