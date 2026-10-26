/**
 * MEH-2324 — the owner-claim link must reach the middleware.
 *
 * The admin copies `<site>/claim/<token>` (producer_claim.py builds it with no
 * locale). The token is a JWT, so the path has dots, and the catch-all matcher
 * skips any path with a dot (it is there to let /favicon.ico and other files
 * through). Without its own entry the link never gets next-intl's locale
 * rewrite and the visitor lands on a 404 — measured with a real backend before
 * this entry existed.
 *
 * Asserted with Next's own matcher (unstable_doesMiddlewareMatch), so what is
 * tested is what Next runs, not a regex copied here.
 * DISCRIMINATION: drop "/claim/:path*" from config.matcher → the first case
 * fails; the controls stop "match everything" from passing.
 */
import { describe, it, expect, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("next-intl/middleware", () => ({ default: () => () => ({ headers: new Map() }) }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

const { config } = await import("@/middleware");
const matches = (path) => unstable_doesMiddlewareMatch({ config, url: `https://mehamakor.co.il${path}` });

const JWT = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl-_x";

describe("middleware matcher — owner-claim link", () => {
  it("runs on the bare /claim/<jwt> link the admin sends", () => {
    expect(matches(`/claim/${JWT}`)).toBe(true);
  });

  it("control: still runs on an ordinary page", () => {
    expect(matches("/about")).toBe(true);
  });

  it("control: still skips static files", () => {
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/images/hero.webp")).toBe(false);
  });
});
