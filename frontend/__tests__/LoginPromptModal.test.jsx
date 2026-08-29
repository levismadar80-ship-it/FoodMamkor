import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 3: mock next-intl per PR-A1/B precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      default_message: "כדי לשמור עסקים אוהבים — היכנסו",
      close_aria: "סגרו חלונית",
      title: "רוצה לשמור? 🌿",
      login_cta: "היכנסו",
      dismiss_cta: "אולי אחר כך",
    };
    return flat[key] ?? key;
  },
}));

import LoginPromptModal from "@/components/LoginPromptModal";

// Mock Phosphor X icon
vi.mock("@phosphor-icons/react", () => ({
  X: (props) => <span data-testid="x-icon" {...props} />,
}));

describe("LoginPromptModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <LoginPromptModal open={false} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders when open=true", () => {
    render(<LoginPromptModal open={true} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("רוצה לשמור? 🌿")).toBeInTheDocument();
  });

  it("renders the default message", () => {
    render(<LoginPromptModal open={true} onClose={() => {}} />);
    expect(
      screen.getByText("כדי לשמור עסקים אוהבים — היכנסו"),
    ).toBeInTheDocument();
  });

  it("renders a custom message when passed", () => {
    render(
      <LoginPromptModal
        open={true}
        onClose={() => {}}
        message="התחברי כדי להמשיך"
      />,
    );
    expect(screen.getByText("התחברי כדי להמשיך")).toBeInTheDocument();
  });

  it("login link carries the nextPath in encoded form", () => {
    render(
      <LoginPromptModal
        open={true}
        onClose={() => {}}
        nextPath="/producer/42"
      />,
    );
    const link = screen.getByText("היכנסו");
    expect(link.getAttribute("href")).toBe("/login?redirect=%2Fproducer%2F42");
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("סגרו חלונית"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when 'אולי אחר כך' is clicked", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("אולי אחר כך"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    // The outermost div has role="presentation" and the click handler
    const backdrop = screen.getByRole("presentation");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when dialog body is clicked", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── MEH-2215: the overlay must be a DIRECT child of <body> ────────────────
  //
  // Mounted in place, this modal rendered inside ImageGallery's
  // `absolute … z-20` wrapper (ImageGallery.jsx:375), which is a stacking
  // context — so its z-[9500] only ranked inside that wrapper and the page's
  // `sticky z-[1050]` Header and `sticky z-30` tab bar painted over it.
  //
  // These two assertions are falsifiable by exactly that change and by nothing
  // else: run them against the pre-portal component and both fail (the overlay
  // is then a child of the RTL container div, not of <body>). Demonstrated
  // before this test was committed, per .claude/rules/testing.md.
  it("portals the overlay to <body> so no ancestor can trap it", () => {
    render(<LoginPromptModal open={true} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement;

    // The overlay is the `fixed inset-0` scrim; its parent is <body> itself.
    expect(overlay).toHaveClass("fixed", "inset-0");
    expect(overlay.parentElement).toBe(document.body);
    expect(dialog.parentElement.parentElement).toBe(document.body);
  });

  it("leaves NOTHING in the mount container when open (the whole tree moved)", () => {
    // The mirror of the assertion above, and the one that catches a partial
    // portal: if only the panel were portalled and the scrim stayed behind,
    // the check above would still pass while the trap survived in the scrim.
    const { container } = render(
      <LoginPromptModal open={true} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal and aria-labelledby for screen readers", () => {
    render(<LoginPromptModal open={true} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "login-prompt-title");
  });
});
