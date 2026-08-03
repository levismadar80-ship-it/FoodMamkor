import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Tooltip from "@/components/ui/Tooltip";

// ui/Tooltip toggles a role=tooltip bubble on hover / focus / click.
describe("ui/Tooltip", () => {
  it("renders the trigger children", () => {
    render(
      <Tooltip content="הסבר">
        <span>טריגר</span>
      </Tooltip>,
    );
    expect(screen.getByText("טריגר")).toBeInTheDocument();
  });

  it("starts hidden", () => {
    render(
      <Tooltip content="הסבר">
        <span>טריגר</span>
      </Tooltip>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows on mouse enter and hides on mouse leave", () => {
    render(
      <Tooltip content="הסבר">
        <span>טריגר</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("טריגר").parentElement;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("הסבר");
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows on focus and hides on blur (keyboard access)", () => {
    render(
      <Tooltip content="הסבר">
        <span>טריגר</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("טריגר").parentElement;
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles on click (touch fallback)", () => {
    render(
      <Tooltip content="הסבר">
        <span>טריגר</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("טריגר").parentElement;
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("applies the requested position classes", () => {
    render(
      <Tooltip content="הסבר" position="bottom">
        <span>טריגר</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
    expect(screen.getByRole("tooltip").className).toContain("top-full");
  });

  // MEH-1459: start-anchored bottom variant + responsive width keep the
  // TrustBadge social-proof strip inside the narrow 2-col mobile card.
  it("applies the start-anchored bottom variant and a responsive, wrapping width", () => {
    render(
      <Tooltip content="10+ ביקורות עם דירוג ממוצע 4.5 ומעלה" position="bottom-start">
        <span>טריגר</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
    const bubble = screen.getByRole("tooltip");
    expect(bubble.className).toContain("top-full");
    expect(bubble.className).toContain("start-0");
    expect(bubble.className).toContain("break-words");
    expect(bubble.className).toContain("max-w-[8.5rem]");
    expect(bubble.className).not.toContain("w-52");
  });

  it("falls back to the top position for an unknown position", () => {
    render(
      <Tooltip content="הסבר" position="diagonal">
        <span>טריגר</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
    expect(screen.getByRole("tooltip").className).toContain("bottom-full");
  });

  // MEH-1871 — mirrors the ui/Popover contract exactly (separate primitives,
  // MEH-792: same behaviour, no shared abstraction).
  describe("overlay mode — dismiss on scroll (MEH-1871)", () => {
    // Dismissal is triggered by the viewport MOVING, not by a scroll event
    // arriving — see the ui/Popover suite for the measured 150ms-late event.
    const setScroll = (y) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    };
    afterEach(() => setScroll(0));

    const renderOverlay = () =>
      render(
        <Tooltip content="הסבר" overlay>
          <span>טריגר</span>
        </Tooltip>,
      );

    it("closes when the window scrolls while visible", () => {
      renderOverlay();
      fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      setScroll(240);
      fireEvent.scroll(globalThis);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("does NOT close on a scroll event at the SAME position it opened at", () => {
      setScroll(281);
      renderOverlay();
      fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent.scroll(globalThis); // late event, position unchanged
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      setScroll(400);
      fireEvent.scroll(globalThis);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("closes when an ANCESTOR container scrolls (capture phase)", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      try {
        renderOverlay();
        fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
        setScroll(120);
        fireEvent.scroll(container);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      } finally {
        container.remove();
      }
    });

    it("closes on resize and on orientationchange", () => {
      renderOverlay();
      const trigger = screen.getByText("טריגר").parentElement;
      fireEvent.mouseEnter(trigger);
      fireEvent(globalThis, new Event("resize"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent(globalThis, new Event("orientationchange"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    // Parity with the ui/Popover suite (MEH-792: mirror implementations, so
    // cleanup is asserted on BOTH rather than inferred from one).
    it("removes its listeners on close, so a later scroll is inert", () => {
      const spy = vi.spyOn(window, "removeEventListener");
      renderOverlay();
      const trigger = screen.getByText("טריגר").parentElement;
      fireEvent.mouseEnter(trigger);
      setScroll(300);
      fireEvent.scroll(globalThis);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      const removed = spy.mock.calls.map((call) => call[0]);
      expect(removed).toContain("scroll");
      expect(removed).toContain("resize");
      expect(removed).toContain("orientationchange");
      spy.mockRestore();
      // Re-open still works — cleanup did not tear down the show path.
      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("NON-overlay is unaffected: scroll leaves the anchored bubble visible", () => {
      render(
        <Tooltip content="הסבר">
          <span>טריגר</span>
        </Tooltip>,
      );
      fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
      fireEvent.scroll(globalThis);
      fireEvent(globalThis, new Event("resize"));
      const bubble = screen.getByRole("tooltip");
      expect(bubble).toBeInTheDocument();
      expect(bubble.className).toContain("absolute");
    });
  });
});
