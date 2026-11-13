/**
 * MEH-3093 — the modal contract, by behaviour (the guard only reads source).
 * Tab wraps inside, Escape closes, [data-autofocus] gets focus, focus returns
 * to the opener, and `open` with nothing mounted installs no Tab trap.
 */
import { useRef, useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import useDialogFocus, { useDialogEscape } from "@/hooks/useDialogFocus";

function Harness({ mountPanel = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDialogFocus(ref, open);
  useDialogEscape(open, () => setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <button>outside</button>
      {open && mountPanel && (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="d">
          <button>confirm</button>
          <button data-autofocus>cancel</button>
        </div>
      )}
    </>
  );
}

describe("useDialogFocus + useDialogEscape", () => {
  it("focuses [data-autofocus], wraps Tab, closes on Escape, returns focus", () => {
    render(<Harness />);
    const opener = screen.getByText("open");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByText("cancel"));
    // Tab from the last focusable wraps to the first
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("confirm"));
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("cancel"));
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("open with no panel mounted traps nothing", () => {
    render(<Harness mountPanel={false} />);
    fireEvent.click(screen.getByText("open"));
    const ev = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
