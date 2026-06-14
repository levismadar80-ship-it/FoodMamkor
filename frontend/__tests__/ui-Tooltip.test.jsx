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

  it("falls back to the top position for an unknown position", () => {
    render(
      <Tooltip content="הסבר" position="diagonal">
        <span>טריגר</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("טריגר").parentElement);
    expect(screen.getByRole("tooltip").className).toContain("bottom-full");
  });
});
