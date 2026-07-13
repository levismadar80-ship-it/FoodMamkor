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
  default: () => <div data-testid="chat-widget-stub" />,
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
});
