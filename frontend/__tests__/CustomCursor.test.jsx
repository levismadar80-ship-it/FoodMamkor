/**
 * CustomCursor — stale-hover regression suite (MEH-1575).
 *
 * The bug: `hovered` was written only from a `mousemove` listener, so an
 * element that disappeared under a stationary pointer left the dot stuck at
 * `scale(3)` (class `custom-cursor--hover`) until the mouse moved again.
 *
 * jsdom has no layout, so `document.elementFromPoint` does not exist —
 * every test stubs it to say what is under the pointer.
 */

import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import CustomCursor from "@/components/CustomCursor";

/** Poll cadence in the component; the reset bar is 150ms. */
const POLL_MS = 100;

/** Point `document.elementFromPoint` at `el` (or nothing when null). */
function pointerOver(el) {
  document.elementFromPoint = vi.fn(() => el);
}

/** Move the mouse to (x, y) with `target` as the event target. */
function moveMouseTo(target, x = 10, y = 10) {
  act(() => {
    const ev = new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y });
    target.dispatchEvent(ev);
  });
}

function cursorEl() {
  return document.querySelector(".custom-cursor");
}

describe("CustomCursor — hover liveness (MEH-1575)", () => {
  let button;
  let hadTouchStart;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom defines `ontouchstart` as an own property of `window`, which the
    // component reads as "touch device" and disables itself. Remove it so the
    // desktop (pointer:fine) path this component actually ships on is under
    // test; `matchMedia` already reports false for hover:none / small / reduce.
    hadTouchStart = Object.prototype.hasOwnProperty.call(window, "ontouchstart");
    delete window.ontouchstart;

    button = document.createElement("button");
    button.textContent = "chip";
    document.body.appendChild(button);
    pointerOver(button);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete document.elementFromPoint;
    if (hadTouchStart) window.ontouchstart = null;
    document.body.innerHTML = "";
  });

  it("resets the hover scale when the hovered element is removed, with no pointer movement", () => {
    render(<CustomCursor />);

    moveMouseTo(button);
    expect(cursorEl()).toHaveClass("custom-cursor--hover");

    // The chip disappears under a stationary pointer (filter toggle, sheet
    // close, scroll arrow fading out) — nothing else happens.
    button.remove();
    pointerOver(document.body);

    act(() => {
      vi.advanceTimersByTime(POLL_MS + 20);
    });

    expect(cursorEl()).not.toHaveClass("custom-cursor--hover");
  });

  it("resets when the hovered element becomes hidden rather than removed", () => {
    render(<CustomCursor />);

    moveMouseTo(button);
    expect(cursorEl()).toHaveClass("custom-cursor--hover");

    // `display: none` takes the element out of the hit-test — elementFromPoint
    // now returns whatever is behind it.
    button.style.display = "none";
    pointerOver(document.body);

    act(() => {
      vi.advanceTimersByTime(POLL_MS + 20);
    });

    expect(cursorEl()).not.toHaveClass("custom-cursor--hover");
  });

  it("keeps the hover scale while the element is still under the pointer", () => {
    render(<CustomCursor />);

    moveMouseTo(button);
    expect(cursorEl()).toHaveClass("custom-cursor--hover");

    // Several poll cycles pass and the button never moves.
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 5);
    });

    expect(cursorEl()).toHaveClass("custom-cursor--hover");
  });

  it("leaves normal mouse hover-out unchanged", () => {
    render(<CustomCursor />);

    moveMouseTo(button);
    expect(cursorEl()).toHaveClass("custom-cursor--hover");

    // Mouse moves off the button onto plain background.
    pointerOver(document.body);
    moveMouseTo(document.body, 400, 400);

    expect(cursorEl()).not.toHaveClass("custom-cursor--hover");
  });

  it("stops polling once the cursor is back at base scale", () => {
    render(<CustomCursor />);

    moveMouseTo(button);
    button.remove();
    pointerOver(document.body);

    act(() => {
      vi.advanceTimersByTime(POLL_MS + 20);
    });
    expect(cursorEl()).not.toHaveClass("custom-cursor--hover");

    const callsAfterReset = document.elementFromPoint.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(POLL_MS * 5);
    });

    // No timer is armed while unscaled — the poll is not a permanent tick.
    expect(document.elementFromPoint.mock.calls.length).toBe(callsAfterReset);
  });
});
