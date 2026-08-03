import { describe, it, expect } from "vitest";
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
