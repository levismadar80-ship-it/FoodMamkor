import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

    // MEH-3271 (Sapir 18/11): a visible ✕ on the sheet when the caller names it.
    it("the sheet shows a labelled ✕ that closes it and returns focus", () => {
      const restore = mobileMatchMedia();
      try {
        renderPopover({ sheetOnMobile: true, closeLabel: "סגור" });
        const trigger = screen.getByText("פתחי");
        fireEvent.click(trigger);
        const close = screen.getByTestId("close-pop-content");
        expect(close).toHaveAttribute("aria-label", "סגור");
        fireEvent.click(close);
        expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      } finally {
        restore();
      }
    });

    it("no ✕ without a label, and never on the anchored desktop panel", () => {
      const restore = mobileMatchMedia();
      try {
        renderPopover({ sheetOnMobile: true });
        fireEvent.click(screen.getByText("פתחי"));
        expect(screen.queryByTestId("close-pop-content")).not.toBeInTheDocument();
      } finally {
        restore();
      }
      cleanup();
      renderPopover({ sheetOnMobile: true, closeLabel: "סגור" });
      fireEvent.click(screen.getByText("פתחי"));
      expect(screen.queryByTestId("close-pop-content")).not.toBeInTheDocument();
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

    // MEH-2622: rendered in place, the sheet resolved `position: fixed` against
    // ProducerCard's pressed `scale(0.98)` and opened inside the card on iOS.
    it("portals the sheet AND its backdrop out of a transformed ancestor", () => {
      const restore = mobileMatchMedia();
      try {
        render(
          <div data-testid="card" style={{ transform: "scale(0.98)" }}>
            <Popover
              trigger={<button type="button">פתחי</button>}
              contentTestId="pop-content"
              sheetOnMobile
            >
              תוכן עשיר
            </Popover>
          </div>,
        );
        fireEvent.click(screen.getByText("פתחי"));
        const card = screen.getByTestId("card");
        const panel = screen.getByTestId("pop-content");
        const backdrop = screen.getByTestId("pop-content-backdrop");
        expect(card.contains(panel)).toBe(false);
        expect(card.contains(backdrop)).toBe(false);
        expect(panel.parentElement).toBe(document.body);
        expect(backdrop.parentElement).toBe(document.body);
      } finally {
        restore();
      }
    });

    it("taps on the portalled sheet/backdrop never reach the card's click handler", () => {
      const restore = mobileMatchMedia();
      const onCardClick = vi.fn();
      try {
        render(
          <div onClick={onCardClick}>
            <Popover
              trigger={<button type="button">פתחי</button>}
              contentTestId="pop-content"
              sheetOnMobile
            >
              תוכן עשיר
            </Popover>
          </div>,
        );
        fireEvent.click(screen.getByText("פתחי"));
        fireEvent.click(screen.getByTestId("pop-content"));
        expect(screen.getByTestId("pop-content")).toBeInTheDocument();
        // The backdrop's own mousedown must not close it (else the click would
        // fall through to whatever is underneath).
        fireEvent.mouseDown(screen.getByTestId("pop-content-backdrop"));
        expect(screen.getByTestId("pop-content-backdrop")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("pop-content-backdrop"));
        expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
        expect(onCardClick).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it("sheet, backdrop and trigger are not text-selectable (iOS long press)", () => {
      const restore = mobileMatchMedia();
      try {
        renderPopover({ sheetOnMobile: true });
        const btn = screen.getByText("פתחי");
        fireEvent.click(btn);
        for (const el of [
          screen.getByTestId("pop-content"),
          screen.getByTestId("pop-content-backdrop"),
          btn,
        ]) {
          expect(el.className).toContain("select-none");
          expect(el.className).toContain("[-webkit-touch-callout:none]");
        }
      } finally {
        restore();
      }
    });
  });

  // MEH-2622: overlay panels are portalled too, so their clicks must not
  // bubble (React tree) into a card's navigate handler either.
  it("overlay panel clicks never reach the card's click handler", () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <Popover
          trigger={<button type="button">פתחי</button>}
          contentTestId="pop-content"
          overlay
        >
          תוכן עשיר
        </Popover>
      </div>,
    );
    fireEvent.click(screen.getByText("פתחי"));
    fireEvent.click(screen.getByTestId("pop-content"));
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("the anchored panel's text stays selectable (select-none is trigger-only)", () => {
    renderPopover();
    fireEvent.click(screen.getByText("פתחי"));
    const panel = screen.getByTestId("pop-content");
    expect(panel.className).not.toContain("select-none");
    expect(panel.parentElement.className).not.toContain("select-none");
  });

  // MEH-1871: an open overlay panel is portalled to <body> and `position:
  // fixed`, so it is anchored to the viewport, not to the card. Before this
  // change the panel repositioned on scroll — and because `reposition` clamps
  // into the viewport, a panel whose anchor had scrolled away pinned at the
  // top edge and rode the scroll instead of leaving with it. It now dismisses.
  describe("overlay mode — dismiss on scroll (MEH-1871)", () => {
    // The page position is part of the contract: dismissal is triggered by the
    // viewport MOVING, not by a scroll event arriving.
    const setScroll = (y) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    };
    afterEach(() => setScroll(0));

    it("closes when the window scrolls while open", () => {
      renderPopover({ overlay: true });
      fireEvent.click(screen.getByText("פתחי"));
      expect(screen.getByTestId("pop-content")).toBeInTheDocument();
      setScroll(240);
      fireEvent.scroll(globalThis);
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
    });

    // The MEH-1871 regression this suite exists to prevent a SECOND time:
    // opening a below-the-fold trigger scrolls it into view first, and the
    // resulting scroll event lands ~150ms AFTER the panel opened, already at
    // the settled position. Dismissing on that event closes the panel the tap
    // just opened — measured on e2e badge-tooltip-collision S1 at 375px.
    it("does NOT close on a scroll event at the SAME position it opened at", () => {
      setScroll(281);
      renderPopover({ overlay: true });
      fireEvent.click(screen.getByText("פתחי"));
      expect(screen.getByTestId("pop-content")).toBeInTheDocument();
      fireEvent.scroll(globalThis); // late event, position unchanged
      expect(screen.getByTestId("pop-content")).toBeInTheDocument();
      // …and a genuine move still closes it.
      setScroll(400);
      fireEvent.scroll(globalThis);
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
    });

    it("closes when an ANCESTOR container scrolls (scroll does not bubble — capture does)", () => {
      // The listener is registered with {capture:true} precisely so an inner
      // scrollable container counts. A bubble-phase window listener would
      // never see this event, so this case is what makes `capture` load-bearing.
      const container = document.createElement("div");
      document.body.appendChild(container);
      try {
        renderPopover({ overlay: true });
        fireEvent.click(screen.getByText("פתחי"));
        expect(screen.getByTestId("pop-content")).toBeInTheDocument();
        setScroll(120);
        fireEvent.scroll(container);
        expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
      } finally {
        container.remove();
      }
    });

    it("closes on resize and on orientationchange", () => {
      renderPopover({ overlay: true });
      fireEvent.click(screen.getByText("פתחי"));
      fireEvent(globalThis, new Event("resize"));
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("פתחי"));
      expect(screen.getByTestId("pop-content")).toBeInTheDocument();
      fireEvent(globalThis, new Event("orientationchange"));
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
    });

    it("NON-overlay is unaffected: scroll leaves the anchored panel open", () => {
      renderPopover();
      fireEvent.click(screen.getByText("פתחי"));
      fireEvent.scroll(globalThis);
      fireEvent(globalThis, new Event("resize"));
      const panel = screen.getByTestId("pop-content");
      expect(panel).toBeInTheDocument();
      expect(panel.className).toContain("absolute");
    });

    it("removes its listeners on close, so a later scroll is inert", () => {
      const spy = vi.spyOn(window, "removeEventListener");
      renderPopover({ overlay: true });
      fireEvent.click(screen.getByText("פתחי"));
      setScroll(300);
      fireEvent.scroll(globalThis);
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
      const removed = spy.mock.calls.map((c) => c[0]);
      expect(removed).toContain("scroll");
      expect(removed).toContain("resize");
      expect(removed).toContain("orientationchange");
      spy.mockRestore();
      // Re-open: still works, i.e. cleanup did not tear down the open path.
      fireEvent.click(screen.getByText("פתחי"));
      expect(screen.getByTestId("pop-content")).toBeInTheDocument();
    });
  });
});

// MEH-3271: the mobile sheet takes focus when it opens, so every way of
// closing it has to give focus back, and its Tab loop has to hold.
describe("ui/Popover sheet — focus (MEH-3271)", () => {
  const asMobile = () => {
    const prev = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
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

  it("closing by the backdrop returns focus to the trigger", () => {
    const restore = asMobile();
    try {
      renderPopover({ sheetOnMobile: true });
      const trigger = screen.getByText("פתחי");
      fireEvent.click(trigger);
      // control: the sheet really took focus away from the trigger
      expect(document.activeElement).toBe(screen.getByTestId("pop-content"));

      fireEvent.click(screen.getByTestId("pop-content-backdrop"));
      expect(screen.queryByTestId("pop-content")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    } finally {
      restore();
    }
  });

  it("Tab from outside the sheet lands on its first control, skipping a disabled one", () => {
    const restore = asMobile();
    try {
      render(
        <>
          <button type="button">בחוץ</button>
          <Popover
            trigger={<button type="button">פתחי</button>}
            contentTestId="pop-content"
            sheetOnMobile
          >
            <button type="button" disabled>
              כבוי
            </button>
            <button type="button">ראשון</button>
            <button type="button">אחרון</button>
          </Popover>
        </>,
      );
      fireEvent.click(screen.getByText("פתחי"));
      screen.getByText("בחוץ").focus();

      fireEvent.keyDown(window, { key: "Tab" });
      expect(document.activeElement).toBe(screen.getByText("ראשון"));

      screen.getByText("בחוץ").focus();
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(screen.getByText("אחרון"));
    } finally {
      restore();
    }
  });
});
