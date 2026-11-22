/**
 * MEH-3628 — the header and the footer load a page from the first touch too.
 *
 * IntentPrefetchNav.test.jsx covers the bottom nav and the hook. This file
 * covers the other two users of useIntentPrefetch, so deleting the spread on
 * a Header NavLink, the logo or the footer «/producers» link goes red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

const { prefetch, pathnameRef, anchor } = vi.hoisted(() => ({
  prefetch: vi.fn(),
  pathnameRef: { current: "/about" },
  anchor: ({ children, href, prefetch: _p, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>{children}</a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: anchor,
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ prefetch, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: anchor }));
// eslint-disable-next-line @next/next/no-img-element
vi.mock("next/image", () => ({ default: ({ alt }) => <img alt={alt ?? ""} /> }));
vi.mock("next-intl", () => ({ useLocale: () => "he", useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));
vi.mock("@phosphor-icons/react", () => {
  const icon = () => null;
  return {
    MagnifyingGlass: icon, SealCheck: icon, Globe: icon,
    InstagramLogo: icon, FacebookLogo: icon, TiktokLogo: icon, YoutubeLogo: icon, ArrowRight: icon, CaretDown: icon,
  };
});

import Header from "@/components/Header";
import Footer from "@/components/Footer";

beforeEach(() => {
  prefetch.mockClear();
  pathnameRef.current = "/about";
});

describe("header — prefetch on intent (MEH-3628)", () => {
  it("renders without prefetching anything", () => {
    render(<Header />);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("a touch on the logo starts loading the home page", () => {
    const { container } = render(<Header />);
    const logo = container.querySelector('header a[href="/"]');
    expect(logo).not.toBeNull();
    fireEvent.touchStart(logo);
    expect(prefetch.mock.calls).toEqual([["/"]]);
  });

  it("a page link in the pill prefetches its own href; the open page does not", () => {
    const { container } = render(<Header />);
    const map = container.querySelector('header nav a[href="/map"]');
    const open = container.querySelector('header nav a[aria-current="page"]');
    expect(map).not.toBeNull();
    // /about is open, and it is one of the pill's links: the case below needs it.
    expect(open?.getAttribute("href")).toBe("/about");
    fireEvent.pointerEnter(map);
    fireEvent.pointerEnter(open);
    expect(prefetch.mock.calls).toEqual([["/map"]]);
  });
});

describe("footer — prefetch on intent (MEH-3059 · MEH-3628)", () => {
  it("a touch on «כל בתי העסק» starts loading /producers", () => {
    const { container } = render(<Footer />);
    const link = container.querySelector('footer a[href="/producers"]');
    expect(link).not.toBeNull();
    fireEvent.touchStart(link);
    expect(prefetch.mock.calls).toEqual([["/producers"]]);
  });
});
