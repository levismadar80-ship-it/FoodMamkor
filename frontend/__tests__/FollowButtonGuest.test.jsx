import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// MEH-1334 chunk 1: FollowButton is now VISIBLE to guests (pre-1334 it
// returned null) — a guest tap opens the login prompt and stores a one-shot
// follow intent that auto-completes after sign-in (revision-2 #7). Mirrors
// the FavoriteButton guest suite's mock scaffolding.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      // modals.login_prompt
      default_message: "כדי לשמור עסקים אוהבים — היכנסו",
      close_aria: "סגרו חלונית",
      title: "רוצה לשמור?",
      login_cta: "היכנסו",
      dismiss_cta: "אולי אחר כך",
      // group_buys.follow
      following: "עוקבת",
      follow_aria: "עקבו אחרי עסק זה",
      quiet_label: "מעקב",
      login_prompt_message: "כדי לעקוב אחרי עסקים ולקבל עדכונים — היכנסו",
    };
    return flat[key] ?? key;
  },
}));

const mockUser = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

// vi.mock factories are hoisted — vi.hoisted keeps the shared handle legal.
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

vi.mock("@phosphor-icons/react", () => ({
  Bell: (props) => <span data-testid="bell-icon" {...props} />,
  BellSlash: (props) => <span data-testid="bell-slash-icon" {...props} />,
  X: (props) => <span data-testid="x-icon" {...props} />,
}));

import FollowButton from "@/components/FollowButton";

describe("FollowButton guest path (MEH-1334)", () => {
  beforeEach(() => {
    mockUser.current = null;
    sessionStorage.clear();
    apiMock.get.mockReset().mockResolvedValue({ data: { following: false } });
    apiMock.post.mockClear();
    // jsdom has no scrollTo — the post-login consume path calls it.
    window.scrollTo = vi.fn();
  });

  it("guest: renders the button instead of null (default + quiet variants)", () => {
    const { unmount } = render(<FollowButton producerId={1} />);
    expect(screen.getByRole("button", { name: /עקבו אחרי עסק זה/ })).toBeInTheDocument();
    unmount();
    render(<FollowButton producerId={1} variant="quiet" />);
    const quiet = screen.getByRole("button", { name: "עקבו אחרי עסק זה" });
    expect(quiet.textContent).toContain("מעקב");
  });

  it("guest: makes no follow-status API call", () => {
    render(<FollowButton producerId={1} />);
    expect(apiMock.get).not.toHaveBeenCalled();
  });

  it("guest: clicking opens the login modal and stores the follow intent", () => {
    render(<FollowButton producerId={7} variant="quiet" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "עקבו אחרי עסק זה" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(apiMock.post).not.toHaveBeenCalled();
    const intent = JSON.parse(sessionStorage.getItem("pending_action"));
    expect(intent).toMatchObject({ type: "follow", producerId: 7 });
  });

  it("guest: dismissing the modal clears the stored intent", () => {
    render(<FollowButton producerId={7} variant="quiet" />);
    fireEvent.click(screen.getByRole("button", { name: "עקבו אחרי עסק זה" }));
    fireEvent.click(screen.getByRole("button", { name: "אולי אחר כך" }));
    expect(sessionStorage.getItem("pending_action")).toBeNull();
  });

  it("signed-in with a stored intent: auto-follows once (one-shot consume)", async () => {
    mockUser.current = { id: 99 };
    sessionStorage.setItem(
      "pending_action",
      JSON.stringify({ type: "follow", producerId: 7, scrollY: 120 }),
    );
    render(<FollowButton producerId={7} variant="quiet" />);
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith("/producers/7/follow"));
    expect(sessionStorage.getItem("pending_action")).toBeNull();
  });

  it("signed-in with an intent for a DIFFERENT producer: no auto-follow", async () => {
    mockUser.current = { id: 99 };
    sessionStorage.setItem(
      "pending_action",
      JSON.stringify({ type: "follow", producerId: 8, scrollY: 0 }),
    );
    render(<FollowButton producerId={7} variant="quiet" />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("pending_action")).not.toBeNull();
  });
});
