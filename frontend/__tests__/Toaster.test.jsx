/**
 * MEH-685 — Toaster default-icon-per-type mapping + bespoke override.
 *
 * The store is a module singleton; fake timers + a full drain in afterEach
 * keep toasts from leaking between cases (auto-dismiss flushes the queue).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import Toaster from "@/components/Toaster";
import { showToast } from "@/lib/toast";

const DRAIN_MS = 5000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Flush every pending auto-dismiss so the singleton store returns to empty.
  act(() => {
    vi.advanceTimersByTime(DRAIN_MS);
  });
  vi.useRealTimers();
});

describe("Toaster — icons (MEH-685)", () => {
  it("renders a default icon (svg) for a plain success toast", () => {
    render(<Toaster />);
    act(() => {
      showToast.success("נשמר");
    });
    expect(screen.getByText("נשמר")).toBeInTheDocument();
    // Phosphor renders an <svg>; the default success icon should be present.
    expect(document.querySelector("svg")).toBeTruthy();
  });

  it("renders a default icon for error + info toasts too", () => {
    render(<Toaster />);
    act(() => {
      showToast.error("שגיאה");
      showToast.info("מידע");
    });
    expect(screen.getByText("שגיאה")).toBeInTheDocument();
    expect(screen.getByText("מידע")).toBeInTheDocument();
    expect(document.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a bespoke icon override instead of the default", () => {
    render(<Toaster />);
    act(() => {
      showToast.success("עוקבת", { icon: <svg data-testid="bell-override" /> });
    });
    expect(screen.getByTestId("bell-override")).toBeInTheDocument();
  });
});
