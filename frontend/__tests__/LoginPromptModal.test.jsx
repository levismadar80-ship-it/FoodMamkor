import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
      screen.getByText("כדי לשמור עסקים אוהבים — היכנסי"),
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
    const link = screen.getByText("היכנסי");
    expect(link.getAttribute("href")).toBe("/login?next=%2Fproducer%2F42");
  });

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("סגרי חלונית"));
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

  it("has aria-modal and aria-labelledby for screen readers", () => {
    render(<LoginPromptModal open={true} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "login-prompt-title");
  });
});
