import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
}));

describe("FavoriteButton", () => {
  beforeEach(() => {
    mockUser.current = null;
  });

  it("renders nothing when user is not logged in (default)", () => {
    const { container } = render(<FavoriteButton producerId={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user is not logged in (gallery variant)", () => {
    const { container } = render(<FavoriteButton producerId={1} variant="gallery" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user is not logged in (inline variant)", () => {
    const { container } = render(<FavoriteButton producerId={1} variant="inline" />);
    expect(container.innerHTML).toBe("");
  });

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
    expect(screen.getByTestId("heart-icon")).toBeInTheDocument();
    // No "שמור" text on the gallery overlay
    expect(btn.textContent).not.toContain("שמור");
  });

  it("inline variant: renders HeartStraight icon AND 'שמור' text", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} variant="inline" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(screen.getByTestId("heart-icon")).toBeInTheDocument();
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
