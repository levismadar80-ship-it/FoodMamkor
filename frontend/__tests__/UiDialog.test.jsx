/**
 * MEH-3096 — the shared ui/Dialog shell: backdrop and Escape dismiss honour
 * `dismissible` and `closeOnBackdrop`, and the body scroll lock is restored.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import Dialog from "../components/ui/Dialog";

function renderDialog(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Dialog label="test dialog" testId="ui-dialog" onClose={onClose} {...props}>
      <textarea aria-label="notes" />
      <button type="button" data-autofocus>safe</button>
    </Dialog>,
  );
  const panel = screen.getByTestId("ui-dialog");
  return { onClose, panel, overlay: panel.parentElement, ...utils };
}

describe("ui/Dialog", () => {
  it("backdrop click and Escape close by default", () => {
    const { onClose, overlay } = renderDialog();
    fireEvent.click(overlay);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("a click inside the panel does not close", () => {
    const { onClose, panel } = renderDialog();
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closeOnBackdrop={false}: scrim click keeps typed text, Escape still closes", () => {
    const { onClose, overlay } = renderDialog({ closeOnBackdrop: false });
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismissible={false} (request in flight): neither scrim nor Escape closes", () => {
    const { onClose, overlay } = renderDialog({ dismissible: false });
    fireEvent.click(overlay);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("initial focus goes to [data-autofocus]; body scroll lock restored on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = renderDialog();
    expect(document.activeElement?.textContent).toBe("safe");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});
