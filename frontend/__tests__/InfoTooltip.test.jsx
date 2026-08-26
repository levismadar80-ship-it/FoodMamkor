import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = { trigger_aria: "מידע נוסף" };
    return flat[key] ?? key;
  },
}));

import InfoTooltip from "@/components/InfoTooltip";

describe("InfoTooltip", () => {
  it("renders trigger button with default aria-label", () => {
    render(<InfoTooltip content="hello" />);
    expect(screen.getByRole("button", { name: "מידע נוסף" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("accepts a custom aria-label", () => {
    render(<InfoTooltip content="hello" label="הסבר על המצב" />);
    expect(screen.getByRole("button", { name: "הסבר על המצב" })).toBeInTheDocument();
  });

  it("click toggles open and sets aria-describedby", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).not.toHaveAttribute("aria-describedby");

    fireEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("עזרה");
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn.getAttribute("aria-describedby")).toBe(tip.getAttribute("id"));

    fireEvent.click(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("Escape key closes the tooltip", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("pointerdown outside the wrapper closes the tooltip", () => {
    render(
      <div>
        <InfoTooltip content="עזרה" />
        <button type="button" data-testid="outside">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "מידע נוסף" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders ReactNode content (multi-line)", () => {
    render(
      <InfoTooltip
        content={
          <>
            line A<br />line B
          </>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("line A");
    expect(tip).toHaveTextContent("line B");
    expect(tip.querySelector("br")).not.toBeNull();
  });

  it("focus opens the tooltip (keyboard a11y)", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

// MEH-2178 — the REAL pointer sequences.
//
// Why these exist even though "click toggles open" above was already green:
// that test fires a BARE click. A real browser never does. It emits
//   mouseenter -> pointerdown -> mousedown -> focus -> click
// so onMouseEnter had already opened the tooltip by the time onClick ran, and
// onClick toggled it straight back shut. The bare-click test passed against a
// component that was dead on every real device — a green with two causes.
//
// Each helper below replays a full sequence, so these DISCRIMINATE: run them
// against the pre-fix component and both openers fail.
describe("InfoTooltip — real pointer sequences (MEH-2178)", () => {
  const mouseOpenSequence = (btn) => {
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    fireEvent.mouseEnter(btn);
    fireEvent.pointerDown(btn, { pointerType: "mouse" });
    fireEvent.mouseDown(btn);
    fireEvent.focus(btn);
    fireEvent.click(btn);
  };

  // A touch tap. Mobile browsers synthesize the mouse events too, which is
  // precisely why guarding hover on pointerType matters.
  const tapSequence = (btn) => {
    fireEvent.pointerEnter(btn, { pointerType: "touch" });
    fireEvent.mouseEnter(btn);
    fireEvent.pointerDown(btn, { pointerType: "touch" });
    fireEvent.mouseDown(btn);
    fireEvent.focus(btn);
    fireEvent.click(btn);
  };

  it("tap opens the tooltip", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    tapSequence(btn);

    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent("עזרה");
  });

  it("tapping a second time closes it", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    tapSequence(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    tapSequence(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("a real mouse click leaves the tooltip open, and a second click closes it", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    mouseOpenSequence(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Still hovered and focused, so no new mouseenter/focus fires.
    fireEvent.pointerDown(btn, { pointerType: "mouse" });
    fireEvent.mouseDown(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("hover alone still opens, and mouseleave still closes", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("a touch hover does NOT open it — only the tap does", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    fireEvent.pointerEnter(btn, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keyboard: focus opens, Escape closes, blur closes", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("click reopens after Escape closed it", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    mouseOpenSequence(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Without clearing the baseline this computes !true === false and the
    // click silently does nothing.
    fireEvent.click(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("tap reopens after an outside pointerdown closed it", () => {
    render(
      <div>
        <InfoTooltip content="עזרה" />
        <button type="button" data-testid="outside">outside</button>
      </div>,
    );
    const btn = screen.getByRole("button", { name: "מידע נוסף" });

    tapSequence(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    tapSequence(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  // Counted, not merely "present" — a presence assertion cannot see a
  // double-open, which is the whole point of this check.
  it("never renders more than one [role=tooltip] at a time", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    expect(screen.queryAllByRole("tooltip")).toHaveLength(0);

    tapSequence(btn);
    expect(screen.queryAllByRole("tooltip")).toHaveLength(1);

    // Hover on top of an already-tapped-open tooltip must not add a second.
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    fireEvent.mouseEnter(btn);
    expect(screen.queryAllByRole("tooltip")).toHaveLength(1);
  });
});
