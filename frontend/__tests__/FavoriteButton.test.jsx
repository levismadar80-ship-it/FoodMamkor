import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-475 PR-C4a chunk 3: mock next-intl per PR-A1/B precedent.
// FavoriteButton mounts LoginPromptModal as a child; modal needs the mock too.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      // modals.login_prompt (chunk 3)
      default_message: "כדי לשמור עסקים אוהבים — היכנסו",
      close_aria: "סגרו חלונית",
      title: "רוצה לשמור? 🌿",
      login_cta: "היכנסו",
      dismiss_cta: "אולי אחר כך",
      // favorites.button (chunk 4b)
      saved_toast_first_time: "נשמר! תמצאי את המועדפים בלשונית ❤️ בתחתית",
      saved_toast: "נשמר למועדפים ❤️",
      removed_toast: "הוסר מהמועדפים",
      error_generic: "משהו השתבש, נסי שוב",
      add_aria: "הוסף למועדפים",
      remove_aria: "הסר ממועדפים",
      inline_label: "שמור",
      login_prompt_message: "כדי לשמור עסקים אוהבים — היכנסו",
    };
    return flat[key] ?? key;
  },
}));

import FavoriteButton from "@/components/FavoriteButton";
// MEH-1325: favorites-cache is intentionally NOT mocked here — the regression
// tests assert FavoriteButton writes through to the real shared store so card
// hearts stay in sync. api (its data source) is mocked below.
import {
  isFavorited,
  subscribeFavorites,
  resetFavoritesCache,
} from "@/lib/favorites-cache";

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

// Mock toast — MEH-685: showToast is a function with .success/.error/.info
// semantic methods. FavoriteButton now calls showToast.success/.error.
vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

// Mock Phosphor icons as spans so we can assert presence. HeartStraight/X keep
// stable test-ids; the rest (MEH-1325: the default/inline save path mounts
// AlertPrefsPanel, which pulls in Bell/Truck/…) render as generic spans.
vi.mock("@phosphor-icons/react", () => ({
  HeartStraight: (props) => <span data-testid="heart-icon" {...props} />,
  X: (props) => <span data-testid="x-icon" {...props} />,
  Bell: (props) => <span data-testid="phosphor-icon" {...props} />,
  BellSlash: (props) => <span data-testid="phosphor-icon" {...props} />,
  Check: (props) => <span data-testid="phosphor-icon" {...props} />,
  Confetti: (props) => <span data-testid="phosphor-icon" {...props} />,
  Handbag: (props) => <span data-testid="phosphor-icon" {...props} />,
  Truck: (props) => <span data-testid="phosphor-icon" {...props} />,
  ChatCircle: (props) => <span data-testid="phosphor-icon" {...props} />,
}));

describe("FavoriteButton", () => {
  beforeEach(() => {
    mockUser.current = null;
    // MEH-1325: reset the shared favorites-cache singleton between tests so
    // the `loaded` flag + ids set don't leak across cases.
    resetFavoritesCache();
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
      screen.getByText("כדי לשמור עסקים אוהבים — היכנסו"),
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

  it("default variant: renders HeartStraight icon (no emoji) when logged in", () => {
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={1} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    // MEH-990: ❤️/🤍 emoji pair → Phosphor HeartStraight (Emoji LOCK).
    expect(screen.getAllByTestId("heart-icon").length).toBeGreaterThan(0);
    expect(btn.textContent).toBe("");
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

  // ------------------------------------------------------------------
  // MEH-1325 — favorites-cache sync + green ink (no red)
  // ------------------------------------------------------------------

  // A distinct producer id for the cache-sync cases (kept off the id=1 the
  // guest/logged-in cases above use, so the shared cache never overlaps).
  const PID = 42;

  it("does NOT fetch /users/me/favorites directly (reads via favorites-cache)", async () => {
    const api = (await import("@/lib/api")).default;
    api.get.mockClear();
    mockUser.current = { id: 1, name: "Test" };
    render(<FavoriteButton producerId={PID} />);
    // The single GET that happens comes from favorites-cache's ensureFavoritesLoaded,
    // hydrated once per session — not a per-mount fetch owned by this component.
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith("/users/me/favorites");
  });

  it("toggling on writes through to favorites-cache and notifies subscribers", async () => {
    const api = (await import("@/lib/api")).default;
    mockUser.current = { id: 1, name: "Test" };
    const listener = vi.fn();
    const unsub = subscribeFavorites(listener);

    render(<FavoriteButton producerId={PID} />);
    await waitFor(() => expect(isFavorited(PID)).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "הוסף למועדפים" }));

    // Optimistic cache write happens before/independent of the POST resolving.
    await waitFor(() => expect(isFavorited(PID)).toBe(true));
    expect(listener).toHaveBeenCalled(); // a subscribed CardHeart would re-read + fill
    expect(api.post).toHaveBeenCalledWith("/users/me/favorites/42");
    expect(api.delete).not.toHaveBeenCalled();
    unsub();
  });

  it("toggling off writes through to favorites-cache (removes the id)", async () => {
    const api = (await import("@/lib/api")).default;
    api.get.mockResolvedValueOnce({ data: [{ producer_id: PID }] });
    mockUser.current = { id: 1, name: "Test" };

    render(<FavoriteButton producerId={PID} />);
    // hydrated as already-favorited from the cache
    await waitFor(() => expect(isFavorited(PID)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "הסר ממועדפים" }));

    await waitFor(() => expect(isFavorited(PID)).toBe(false));
    expect(api.delete).toHaveBeenCalledWith("/users/me/favorites/42");
  });

  it("reverts the cache write when the POST fails", async () => {
    const api = (await import("@/lib/api")).default;
    api.post.mockRejectedValueOnce(new Error("network"));
    mockUser.current = { id: 1, name: "Test" };

    render(<FavoriteButton producerId={PID} />);
    await waitFor(() => expect(isFavorited(PID)).toBe(false));

    fireEvent.click(screen.getByRole("button", { name: "הוסף למועדפים" }));

    // optimistic add, then revert on failure → back to not-favorited
    await waitFor(() => expect(isFavorited(PID)).toBe(false));
  });

  it("DELETE-404 is idempotent — heart stays un-filled, no revert (MEH-730)", async () => {
    const api = (await import("@/lib/api")).default;
    api.get.mockResolvedValueOnce({ data: [{ producer_id: PID }] });
    api.delete.mockRejectedValueOnce({ response: { status: 404 } });
    mockUser.current = { id: 1, name: "Test" };

    render(<FavoriteButton producerId={PID} />);
    await waitFor(() => expect(isFavorited(PID)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "הסר ממועדפים" }));

    // 404 = already gone server-side → stays removed, not reverted back to filled
    await waitFor(() => expect(isFavorited(PID)).toBe(false));
  });

  it("saved ink is primary green (never red) in all 3 variants", async () => {
    mockUser.current = { id: 1, name: "Test" };
    // hydrate favorited so the saved treatment renders on mount
    const api = (await import("@/lib/api")).default;
    api.get.mockResolvedValue({ data: [{ producer_id: PID }] });

    for (const variant of ["default", "gallery", "inline"]) {
      resetFavoritesCache();
      const { unmount } = render(
        <FavoriteButton producerId={PID} variant={variant} />,
      );
      // Cache hydrates async → wait for the saved state to render.
      await waitFor(() =>
        expect(screen.getByRole("button")).toHaveAttribute(
          "aria-pressed",
          "true",
        ),
      );
      const btn = screen.getByRole("button");
      // The saved className lives on the button (inline) or the heart icon.
      const heart = screen.getByTestId("heart-icon");
      const savedMarkup = `${btn.className} ${heart.getAttribute("class") ?? ""}`;
      expect(savedMarkup).toContain("text-primary"); // green ink
      expect(savedMarkup).not.toContain("red");
      unmount();
    }
  });
});
