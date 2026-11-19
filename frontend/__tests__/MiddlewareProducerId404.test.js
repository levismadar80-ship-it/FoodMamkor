// @ts-check
/**
 * MEH-3024 — /producer/<id> of a business that does not exist streamed HTTP
 * 200 with the «לא נמצא» UI (measured on production 13/11, browser and
 * Googlebot UA). The middleware now asks the backend first, exactly like
 * /events/<id> (MiddlewareEventDiet404.test.js).
 *
 * DISCRIMINATION: against the old middleware (MEH-1632: no /producer branch)
 * every "→ 404" case below was a pass-through, so each fails on it. The
 * pass-through cases stop "always 404" from satisfying the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-intl/middleware", () => ({
  default: () => () => ({ headers: new Map(), __intl: true }),
}));
const rewrite = vi.fn((url, init) => ({ __rewrite: true, url, status: init?.status }));
vi.mock("next/server", () => ({
  NextResponse: { rewrite: (url, init) => rewrite(url, init), next: () => ({ __next: true }) },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import middleware from "@/middleware";

const requestFor = (pathname) => {
  const nextUrl = { pathname, clone() { return { ...nextUrl, clone: nextUrl.clone }; } };
  return { nextUrl, url: `https://staging.mehamakor.online${pathname}`, headers: new Map() };
};
const backend = ({ status = 200, throws = false } = {}) => {
  global.fetch = vi.fn(async () => {
    if (throws) throw new Error("network");
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null } };
  });
};
const wasNotFound = (res) => Boolean(res?.__rewrite) && res.status === 404;

const ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  rewrite.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("/producer/<id> (MEH-3024)", () => {
  it("backend 404 → real 404 (he, no prefix)", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor(`/producer/${ID}`)))).toBe(true);
  });
  it("backend 404 → real 404 (/en prefix)", async () => {
    backend({ status: 404 });
    expect(wasNotFound(await middleware(requestFor(`/en/producer/${ID}`)))).toBe(true);
  });
  it("backend 422 (not a UUID) → real 404", async () => {
    backend({ status: 422 });
    expect(wasNotFound(await middleware(requestFor("/producer/not-a-uuid")))).toBe(true);
  });
  it("asks the backend's /producers/<id>", async () => {
    backend({ status: 404 });
    await middleware(requestFor(`/he/producer/${ID}`));
    expect(String(global.fetch.mock.calls[0][0])).toMatch(new RegExp(`/producers/${ID}$`));
  });
  it("backend 200 → passes through", async () => {
    backend({ status: 200 });
    expect(wasNotFound(await middleware(requestFor(`/producer/${ID}`)))).toBe(false);
  });
  it("backend 500 → fails open (no 404)", async () => {
    backend({ status: 500 });
    expect(wasNotFound(await middleware(requestFor(`/producer/${ID}`)))).toBe(false);
  });
  it("backend unreachable → fails open (no 404)", async () => {
    backend({ throws: true });
    expect(wasNotFound(await middleware(requestFor(`/producer/${ID}`)))).toBe(false);
  });
  it("/producer/dashboard is never checked (static child)", async () => {
    backend({ status: 422 });
    const res = await middleware(requestFor("/producer/dashboard"));
    expect(wasNotFound(res)).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("every static child of app/[locale]/producer/ is excluded", async () => {
    const dir = path.join(__dirname, "..", "app", "[locale]", "producer");
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("["))
      .map((d) => d.name);
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      backend({ status: 422 });
      const res = await middleware(requestFor(`/producer/${child}`));
      expect(wasNotFound(res), `/producer/${child} must not be 404'd`).toBe(false);
    }
  });
});
