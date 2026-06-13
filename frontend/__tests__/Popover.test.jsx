import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Popover from "@/components/ui/Popover";

// MEH-800: contract tests for the click-popover primitive. The dismissal
// contract (document mousedown + window keydown) mirrors what the BadgeRow
// suite asserts on the migrated consumer.

function renderPopover(extra = {}) {
  return render(
    <Popover
      trigger={<button type="button">פתחי</button>}
      contentTestId="pop-content"
      {...extra}
    >
      תוכן עשיר
    </Popover>,
  );
}

describe("ui/Popover", () => {
  it("opens on trigger click, closes on second click", () => {
    renderPopover();
    const btn = screen.getByText("פתחי");
    expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId("pop-content")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
  });

  it("closes on outside mousedown", () => {
    renderPopover();
    fireEvent.click(screen.getByText("פתחי"));
    expect(screen.getByTestId("pop-content")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderPopover();
    const btn = screen.getByText("פתחי");
    fireEvent.click(btn);
    expect(screen.getByTestId("pop-content")).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: "Escape" });
    expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(btn);
  });

  it("stops propagation: tap on the trigger inside a card Link does not navigate", () => {
    const parentClick = vi.fn();
    render(
       
      <div onClick={parentClick}>
        <Popover trigger={<button type="button">פתחי</button>} contentTestId="pop-content">
          תוכן
        </Popover>
      </div>,
    );
    fireEvent.click(screen.getByText("פתחי"));
    expect(screen.getByTestId("pop-content")).toBeInTheDocument();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("wires aria: haspopup + expanded on the trigger, labelledby on the content", () => {
    renderPopover();
    const btn = screen.getByText("פתחי");
    expect(btn).toHaveAttribute("aria-haspopup", "true");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const content = screen.getByTestId("pop-content");
    expect(content).toHaveAttribute("role", "tooltip");
    expect(content).toHaveAttribute("aria-labelledby", btn.id);
    expect(btn.id).not.toBe("");
  });

  it("still runs the trigger's own onClick before toggling", () => {
    const own = vi.fn();
    render(
      <Popover trigger={<button type="button" onClick={own}>פתחי</button>} contentTestId="pop-content">
        תוכן
      </Popover>,
    );
    fireEvent.click(screen.getByText("פתחי"));
    expect(own).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pop-content")).toBeInTheDocument();
  });

  it('placement "top" anchors above (bottom-full), default anchors below (top-full)', () => {
    const { unmount } = renderPopover({ placement: "top" });
    fireEvent.click(screen.getByText("פתחי"));
    expect(screen.getByTestId("pop-content").className).toContain("bottom-full");
    unmount();
    renderPopover();
    fireEvent.click(screen.getByText("פתחי"));
    expect(screen.getByTestId("pop-content").className).toContain("top-full");
  });
});
