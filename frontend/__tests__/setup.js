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
