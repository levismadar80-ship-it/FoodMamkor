/**
 * MEH-2534 — the URL of a DELETED business shows "no longer on Mehamakor",
 * not the generic 404.
 *
 * The backend answers 410 for a slug held by an ownerless `retired_slugs`
 * tombstone (MEH-2528). Behaviour at the page and middleware boundaries:
 *
 * DISCRIMINATION: against the pre-change resolver a 410 fell into `!res.ok`
 * and THREW (error page + Sentry), so the "renders ProducerGone" and
 * "noindex metadata" cases fail on it; against the pre-change middleware a
 * 410 was logged as a backend fault, so the "no console.error" case fails.
 * The 404 cases are the controls — they passed before and must still pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "@/messages/he.json";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: vi.fn() }));
// MEH-2534: ProducerGone uses the locale-aware Link (house mock).
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/[locale]/producer/[id]/ProducerDetail", () => ({
  default: () => null,
}));
vi.mock("next-intl/middleware", () => ({
  default: () => () => ({
    headers: new Map([
      ["x-middleware-next", "1"],
      ["x-middleware-request-x-next-intl-locale", "en"],
    ]),
    __intl: true,
  }),
}));
const rewrite = vi.fn((url, init) => ({
  __rewrite: true,
  url,
  status: init?.status,
  headers: new Map(),
}));
vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (url, init) => rewrite(url, init),
    next: () => ({ __next: true }),
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import ProducerSlugPage, { generateMetadata } from "@/app/[locale]/[slug]/page";
import ProducerGone from "@/app/[locale]/[slug]/ProducerGone";
import middleware from "@/middleware";
import { serverFetch } from "@/lib/server-fetch";
import { notFound } from "next/navigation";

const SLUG = "maafiyat-hagalil";
const params = Promise.resolve({ slug: SLUG, locale: "he" });
const response = (status) => ({
  status,
  statusText: `status ${status}`,
  ok: status >= 200 && status < 300,
  json: async () => null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("MEH-2534 — [slug] page", () => {
  it("410 -> renders ProducerGone, never notFound()", async () => {
    serverFetch.mockResolvedValue(response(410));
    const el = await ProducerSlugPage({ params });
    expect(el.type).toBe(ProducerGone);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("410 -> metadata is noindex", async () => {
    serverFetch.mockResolvedValue(response(410));
    const meta = await generateMetadata({ params });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("404 control -> still notFound()", async () => {
    serverFetch.mockResolvedValue(response(404));
    await expect(ProducerSlugPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("MEH-2534 — middleware", () => {
  const requestFor = (pathname) => {
    const nextUrl = {
      pathname,
      clone() {
        return { ...nextUrl, clone: nextUrl.clone };
      },
    };
    return { nextUrl, url: `https://staging.mehamakor.online${pathname}`, headers: new Map() };
  };
  const backendReturns = (status) => {
    global.fetch = vi.fn(async () => ({ ok: status >= 200 && status < 300, status }));
  };

  it("410 -> rewrites to the page itself with a real 410, without a fault log", async () => {
    // The page streams (200 by the time it renders), so the status has to be
    // set here or a crawler never sees the backend's 410.
    backendReturns(410);
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(res.__rewrite && res.status).toBe(410);
    expect(res.url.pathname).toBe(`/he/${SLUG}`);
    expect(console.error).not.toHaveBeenCalled();
    // next-intl's locale override rides along; its routing verdict does not.
    expect(res.headers.get("x-middleware-request-x-next-intl-locale")).toBe("en");
    expect(res.headers.has("x-middleware-next")).toBe(false);
  });

  it("410 on a prefix-less URL -> rewrites to the default locale", async () => {
    backendReturns(410);
    const res = await middleware(requestFor(`/${SLUG}`));
    expect(res.status).toBe(410);
    expect(res.url.pathname).toBe(`/he/${SLUG}`);
  });

  it("404 control -> still the hard 404 rewrite", async () => {
    backendReturns(404);
    const res = await middleware(requestFor(`/he/${SLUG}`));
    expect(res.__rewrite && res.status).toBe(404);
  });
});

describe("MEH-2534 — ProducerGone copy", () => {
  it("renders the approved Hebrew heading and message, with both ways out", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he}>
        <ProducerGone />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByRole("heading", { name: "בית העסק הזה כבר לא במהמקור" })
    ).toBeTruthy();
    expect(
      screen.getByText("הדף שלו הוסר מהאתר. במפה מחכים לכם בתי עסק מקומיים אחרים.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /גלו עסקים במפה/ }).getAttribute("href")).toBe("/map");
    expect(screen.getByRole("link", { name: /חזרה לדף הבית/ }).getAttribute("href")).toBe("/");
  });
});

describe("MEH-2534 — Hebrew slugs arrive percent-encoded", () => {
  // Next hands the [slug] param and the middleware pathname over encoded.
  // DISCRIMINATION: the pre-change page failed SLUG_SHAPE on the `%` and
  // called notFound() without fetching; the pre-change middleware did the
  // same before its backend check. Both cases below fail on that code.
  const HE = "חוות-הגליל";
  const ENC = encodeURIComponent(HE);

  it("page fetches the decoded slug once-encoded, and renders the business", async () => {
    serverFetch.mockResolvedValue({ ...response(200), json: async () => ({ id: 1, name: "חווה" }) });
    await ProducerSlugPage({ params: Promise.resolve({ slug: ENC, locale: "he" }) });
    expect(notFound).not.toHaveBeenCalled();
    expect(serverFetch.mock.calls[0][0]).toContain(`/producers/by-slug/${ENC}`);
    expect(serverFetch.mock.calls[0][0]).not.toContain("%25");
  });

  it("middleware checks the backend for an encoded Hebrew slug instead of hard-404ing", async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const nextUrl = { pathname: `/he/${ENC}`, clone() { return { ...nextUrl }; } };
    const res = await middleware({ nextUrl, url: `https://x${nextUrl.pathname}`, headers: new Map() });
    expect(res?.__rewrite).toBeFalsy();
    expect(global.fetch).toHaveBeenCalled();
  });

  it("a malformed escape is left as is and still 404s without a backend call", async () => {
    const { decodeSlugParam } = await import("@/lib/slug");
    expect(decodeSlugParam("%E0%A4%A")).toBe("%E0%A4%A");
    expect(decodeSlugParam(HE)).toBe(HE);
    expect(decodeSlugParam("%2525")).toBe("%25"); // decoded once, then fails the shape check
    await expect(
      ProducerSlugPage({ params: Promise.resolve({ slug: "%E0%A4%A", locale: "he" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(serverFetch).not.toHaveBeenCalled();
  });
});
