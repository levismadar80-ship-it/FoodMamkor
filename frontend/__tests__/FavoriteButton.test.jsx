import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FavoriteButton from "@/components/FavoriteButton";

// Mock auth context — default: no user (logged out)
const mockUser = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

// Mock API
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

// Mock toast
vi.mock("@/lib/toast", () => ({
  showToast: vi.fn(),
}));

// Mock Phosphor HeartStraight — rendered as a span so we can assert presence
vi.mock("@phosphor-icons/react", () => ({
  HeartStraight: (props) => <span data-testid="heart-icon" {...props} />,
  X: (props) => <span data-testid="x-icon" {...props} />,
}));

describe("FavoriteButton", () => {
  beforeEach(() => {
    mockUser.current = null;
  });

  // ------------------------------------------------------------------
  // Guest behavior (MEH-8 — button is VISIBLE to guests)
  // ------------------------------------------------------------------

  it("guest: default variant renders the button (not null)", () => {
    const { container } = render(<FavoriteButton producerId={1} />);
    expect(container.querySelector("button")).toBeInTheDocument();
  });

  it("guest: gallery variant renders the button", () => {
    render(<FavoriteButton producerId={1} variant="gallery" />);
    expect(screen.getByRole("button", { name: "הוסף למועדפים" })).toBeInTheDocument();
  });

  it("guest: inline variant renders the button with 'שמור' text", () => {
    render(<FavoriteButton producerId={1} variant="inline" />);
    const btn = screen.getByRole("button", { name: "הוסף למועדפים" });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("שמור");
  });

  it("guest: clicking the button opens the login modal", () => {
    render(<FavoriteButton producerId={1} />);
    // Modal not rendered initially
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Click the heart
    fireEvent.click(screen.getByRole("button", { name: "הוסף למועדפים" }));
    // Modal appears with the spec message
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("כדי לשמור עסקים אוהבים — היכנסי"),
    ).toBeInTheDocument();
  });

  it("guest: clicking does NOT call favorites API", async () => {
    const api = (await import("@/lib/api")).default;
    render(<FavoriteButton producerId={1} />);
    fireEvent.click(screen.getByRole("button", { name: "הוסף למועדפים" }));
    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Logged-in behavior (unchanged from MEH-7)
  // ------------------------------------------------------------------

  it("default variant: renders emoji heart when logged in", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe("🤍");
  });

  it("gallery variant: renders HeartStraight icon and no text", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} variant="gallery" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(screen.getAllByTestId("heart-icon").length).toBeGreaterThan(0);
    expect(btn.textContent).not.toContain("שמור");
  });

  it("inline variant: renders HeartStraight icon AND 'שמור' text", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} variant="inline" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(screen.getAllByTestId("heart-icon").length).toBeGreaterThan(0);
    expect(btn.textContent).toContain("שמור");
  });

  it("shows correct aria-label for unfavorited state (all variants)", () => {
    mockUser.current = { id: 1, name: "Test" };
    const { rerender } = render(<FavoriteButton producerId={1} />);
    expect(screen.getByLabelText("הוסף למועדפים")).toBeInTheDocument();

    rerender(<FavoriteButton producerId={1} variant="gallery" />);
    expect(screen.getByLabelText("הוסף למועדפים")).toBeInTheDocument();

    rerender(<FavoriteButton producerId={1} variant="inline" />);
    expect(screen.getByLabelText("הוסף למועדפים")).toBeInTheDocument();
  });

  it("has aria-pressed=false in initial state (all variants)", () => {
    mockUser.current = { id: 1, name: "Test" };
    const { rerender } = render(<FavoriteButton producerId={1} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<FavoriteButton producerId={1} variant="gallery" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<FavoriteButton producerId={1} variant="inline" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});
