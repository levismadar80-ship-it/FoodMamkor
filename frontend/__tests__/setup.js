import "@testing-library/jest-dom";
import { vi } from "vitest";

// MEH-729: jsdom omits a few browser APIs that components touch during
// render/interaction. Stub them globally so unit tests don't each have to.
// These are environment shims, not behavioural mocks — no component logic
// is changed.

// `window.matchMedia` — used by getWhatsAppHref() desktop detection.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// `Element.prototype.scrollIntoView` — called by the settings page tab nav.
// `Element.prototype.scrollTo` — ChipScrollRow scrolls the active chip into
// view (/favorites mounts one since MEH-2560).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// MEH-2579: app/ and components/ take Link from `@/i18n/navigation` (so an
// /en reader keeps /en). That module calls next-intl's createNavigation, whose
// next/navigation import does not resolve in jsdom. Default stand-in: Link
// renders the same plain <a href> next/link does, so DOM assertions are
// unchanged; a test that needs other behaviour still vi.mock()s the module
// in its own file, which overrides this one.
vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  const toHref = (href) =>
    typeof href === "string"
      ? href
      : `${href?.pathname ?? ""}${href?.query ? `?${new URLSearchParams(href.query)}` : ""}${href?.hash ? `#${href.hash}` : ""}`;
  const Link = React.forwardRef(function Link({ href, children, prefetch, locale, scroll, replace, shallow, ...rest }, ref) {
    return React.createElement("a", { href: toHref(href), ...rest, ref }, children);
  });
  const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
  return {
    Link,
    redirect: vi.fn(),
    usePathname: () => "/",
    useRouter: () => router,
    getPathname: ({ href }) => toHref(href),
  };
});
