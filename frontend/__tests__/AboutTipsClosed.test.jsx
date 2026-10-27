import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-2416 — the /about tips accordion ("מה כדאי לדעת") starts with EVERY
 * answer closed. It used to open the first one (eggs) on load. Count × state:
 * 0 open at load · 1 open after a click · back to 0 on a second click.
 * Mocks mirror AboutPortraitAriaRole.test.jsx (keys pass through as-is).
 */
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// MEH-2193: `get` must resolve to a promise. A bare `vi.fn()` returns
// undefined, which no real client does — and once AboutClient gained the
// HowWeChoose child (which calls `api.get(...).then(...)` in an effect), the
// under-specified mock crashed the whole tree during commit, reddening three
// assertions that have nothing to do with fetching. The shape below is what
// axios actually returns.
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

// Real <img> so the component's own onError path can be exercised (below),
// rather than simulating the failed state with a second mock.
vi.mock("next/image", () => ({
  default: ({ alt, src, onError }) => (
    <img alt={alt} src={typeof src === "string" ? src : ""} onError={onError} />
  ),
}));

// jsdom doesn't implement IntersectionObserver — FadeInSection (framer-motion
// whileInView) needs it. Same stub as PaginationCounter.test.jsx.
beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

import AboutClient from "@/app/[locale]/about/AboutClient";

const tipButtons = () =>
  screen.getAllByRole("button").filter((b) => (b.getAttribute("aria-controls") || "").startsWith("tip-panel-"));

describe("MEH-2416 — /about tips accordion starts closed", () => {
  it("renders three tip questions, none expanded and no answer visible", () => {
    const { container } = render(<AboutClient />);
    const btns = tipButtons();
    expect(btns).toHaveLength(3);
    for (const b of btns) expect(b).toHaveAttribute("aria-expanded", "false");
    expect([...container.querySelectorAll('[id^="tip-panel-"]')].filter((p) => !p.hidden)).toHaveLength(0);
  });

  it("a click opens exactly that one; a second click closes it again", () => {
    const { container } = render(<AboutClient />);
    const visible = () => [...container.querySelectorAll('[id^="tip-panel-"]')].filter((p) => !p.hidden).map((p) => p.id);
    fireEvent.click(tipButtons()[1]);
    expect(tipButtons()[1]).toHaveAttribute("aria-expanded", "true");
    expect(visible()).toEqual(["tip-panel-1"]);
    fireEvent.click(tipButtons()[1]);
    expect(visible()).toEqual([]);
  });
});
