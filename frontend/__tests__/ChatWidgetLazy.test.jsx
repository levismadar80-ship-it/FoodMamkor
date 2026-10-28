import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1168 P3 + map-quality PR 3: ChatWidgetLazy suppresses the FAB on the
// producer detail route AND on /map (all locales). usePathname (from
// @/i18n/navigation) is locale-stripped; mock it so the wrapper can be
// exercised per route without pulling in next-intl navigation internals.
const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn(() => "/") }));
vi.mock("@/i18n/navigation", () => ({ usePathname: mockUsePathname }));

import ChatWidgetLazy from "@/components/ChatWidgetLazy";

// Stub the heavy widget so this smoke test stays deterministic and offline —
// we assert the lazy wrapper mounts and its `next/dynamic` import resolves,
// not ChatWidget's internals (next-intl / api / browser APIs).
vi.mock("@/components/ChatWidget", () => ({
  default: ({ hideOnMobile }) => (
    <div data-testid="chat-widget-stub" data-hide-on-mobile={hideOnMobile ? "true" : "false"} />
  ),
}));

describe("ChatWidgetLazy", () => {
  beforeEach(() => mockUsePathname.mockReturnValue("/"));

  it("mounts and resolves the lazy ChatWidget without error", async () => {
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toBeInTheDocument();
  });

  it("does NOT render the widget on /map (FAB vs legend-toggle collision)", () => {
    mockUsePathname.mockReturnValue("/map");
    const { container } = render(<ChatWidgetLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does NOT render on /map subroutes either", () => {
    mockUsePathname.mockReturnValue("/map/whatever");
    const { container } = render(<ChatWidgetLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  it("suppresses the FAB on the producer detail route (/producer/[id])", () => {
    mockUsePathname.mockReturnValue("/producer/abc-123");
    render(<ChatWidgetLazy />);
    expect(screen.queryByTestId("chat-widget-stub")).not.toBeInTheDocument();
  });

  it("keeps the FAB on the producer dashboard subtree", async () => {
    mockUsePathname.mockReturnValue("/producer/dashboard/edit");
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toBeInTheDocument();
  });

  it("keeps the FAB on the dashboard root (exact, no trailing slash)", async () => {
    mockUsePathname.mockReturnValue("/producer/dashboard");
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toBeInTheDocument();
  });

  // MEH-1203: the FAB overlapped the first card of the 2-col favorites grid.
  it("does NOT render the widget on /favorites (FAB vs first card)", () => {
    mockUsePathname.mockReturnValue("/favorites");
    const { container } = render(<ChatWidgetLazy />);
    expect(container).toBeEmptyDOMElement();
  });

  // MEH-2512: on phones the launcher sat over primary form buttons (login
  // submit, register preflight, password field, contact input). Form pages
  // ask the widget to skip mobile; desktop keeps it.
  it.each(["/login", "/register", "/register/producer", "/forgot-password", "/reset-password", "/contact"])(
    "asks the widget to hide on mobile on the form page %s",
    async (route) => {
      mockUsePathname.mockReturnValue(route);
      render(<ChatWidgetLazy />);
      expect(await screen.findByTestId("chat-widget-stub")).toHaveAttribute("data-hide-on-mobile", "true");
    },
  );

  it("does not match a path that only shares a prefix (/contact-us/faq)", async () => {
    // two segments: a single-segment "/contact-us" is slug-shaped and would be
    // gated as a business page (isProducerDetail), proving nothing here.
    mockUsePathname.mockReturnValue("/contact-us/faq");
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toHaveAttribute("data-hide-on-mobile", "false");
  });

  it("does not ask it on a content page (control)", async () => {
    mockUsePathname.mockReturnValue("/about");
    render(<ChatWidgetLazy />);
    expect(await screen.findByTestId("chat-widget-stub")).toHaveAttribute("data-hide-on-mobile", "false");
  });
});
