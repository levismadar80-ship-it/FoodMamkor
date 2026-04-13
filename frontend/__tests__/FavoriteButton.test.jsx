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

describe("FavoriteButton", () => {
  beforeEach(() => {
    mockUser.current = null;
  });

  it("renders nothing when user is not logged in", () => {
    const { container } = render(<FavoriteButton producerId={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders heart icon when user is logged in", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe("🤍");
  });

  it("shows correct aria-label for unfavorited state", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} />);
    expect(screen.getByLabelText("הוסף למועדפים")).toBeInTheDocument();
  });

  it("has aria-pressed=false in initial state", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});
