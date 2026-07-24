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

  // MEH-1334 chunk 3: opt-in mobile bottom-sheet presentation.
  describe("sheetOnMobile (MEH-1334)", () => {
    const mobileMatchMedia = () => {
      const prev = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true, // (max-width: 1023px) → mobile
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      return () => {
        window.matchMedia = prev;
      };
    };

    it("presents as a modal dialog sheet with a backdrop on mobile", () => {
      const restore = mobileMatchMedia();
      try {
        renderPopover({ sheetOnMobile: true });
        fireEvent.click(screen.getByText("פתחי"));
        const panel = screen.getByTestId("pop-content");
        expect(panel).toHaveAttribute("role", "dialog");
        expect(panel).toHaveAttribute("aria-modal", "true");
        expect(panel.className).toContain("fixed");
        expect(screen.getByTestId("pop-content-backdrop")).toBeInTheDocument();
      } finally {
        restore();
      }
    });

    it("backdrop click closes the sheet; Esc still returns focus to trigger", () => {
      const restore = mobileMatchMedia();
      try {
        renderPopover({ sheetOnMobile: true });
        const btn = screen.getByText("פתחי");
        fireEvent.click(btn);
        fireEvent.click(screen.getByTestId("pop-content-backdrop"));
        expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
        // reopen → Esc path
        fireEvent.click(btn);
        fireEvent.keyDown(globalThis, { key: "Escape" });
        expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(btn);
      } finally {
        restore();
      }
    });

    it("traps Tab inside the sheet (wraps from last to first focusable)", () => {
      const restore = mobileMatchMedia();
      try {
        render(
          <Popover
            trigger={<button type="button">פתחי</button>}
            contentTestId="pop-content"
            sheetOnMobile
          >
            <a href="/a">ראשון</a>
            <a href="/b">אחרון</a>
          </Popover>,
        );
        fireEvent.click(screen.getByText("פתחי"));
        const last = screen.getByText("אחרון");
        last.focus();
        fireEvent.keyDown(globalThis, { key: "Tab" });
        expect(document.activeElement).toBe(screen.getByText("ראשון"));
      } finally {
        restore();
      }
    });

    it("desktop (matchMedia false) keeps the anchored popover — no dialog, no backdrop", () => {
      // setup.js matchMedia shim returns matches:false by default.
      renderPopover({ sheetOnMobile: true });
      fireEvent.click(screen.getByText("פתחי"));
      const panel = screen.getByTestId("pop-content");
      expect(panel).toHaveAttribute("role", "tooltip");
      expect(panel.className).toContain("absolute");
      expect(screen.queryByTestId("pop-content-backdrop")).not.toBeInTheDocument();
    });
  });
});
