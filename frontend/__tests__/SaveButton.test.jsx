/**
 * MEH-2558 — SaveButton, the heart for a recipe / event / experience.
 * Cells: guest tap (login prompt, no API, intent stored) · signed-in save
 * (POST to the right type, cache + aria) · signed-in unsave (DELETE) · a
 * failed save rolls back · already-saved item renders filled from the cache ·
 * the guest's save finishes by itself after sign-in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) =>
    ({
      default_message: "כדי לשמור עסקים אוהבים — היכנסו",
      close_aria: "סגרו חלונית",
      title: "רוצה לשמור? 🌿",
      login_cta: "היכנסו",
      dismiss_cta: "אולי אחר כך",
      saved_toast_first_time: "נשמר! כל המועדפים שלך מחכים בעמוד המועדפים שבתפריט",
      saved_toast: "נשמר למועדפים",
      removed_toast: "הוסר מהמועדפים",
      add_aria: "הוסיפו למועדפים",
      remove_aria: "הסר ממועדפים",
      login_prompt_message_saved_item: "כדי לשמור למועדפים — היכנסו",
      generic: "משהו השתבש",
    })[key] ?? key,
}));

const mockUser = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/toast", () => {
  const showToast = vi.fn();
  showToast.success = vi.fn();
  showToast.error = vi.fn();
  showToast.info = vi.fn();
  return { showToast };
});

vi.mock("@phosphor-icons/react", () => ({
  HeartStraight: (props) => <span data-testid="heart-icon" data-weight={props.weight} />,
  X: () => <span />,
}));

import SaveButton from "@/components/SaveButton";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { isSaved, resetSavedCache, setSavedLocal } from "@/lib/saved-cache";

const RID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockUser.current = null;
  resetSavedCache();
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({});
  api.delete.mockResolvedValue({});
});

describe("SaveButton — guest", () => {
  it("opens the login prompt with the saved-item message and calls no API", () => {
    render(<SaveButton itemType="recipe" itemId={RID} />);
    fireEvent.click(screen.getByRole("button", { name: "הוסיפו למועדפים" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("כדי לשמור למועדפים — היכנסו")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("pending_action"))).toMatchObject({
      type: "save:recipe",
      producerId: RID,
    });
  });
});

describe("SaveButton — signed in", () => {
  beforeEach(() => {
    mockUser.current = { id: 1 };
  });

  it("saves to the type's endpoint and fills the heart", async () => {
    render(<SaveButton itemType="event" itemId={RID} />);
    fireEvent.click(screen.getByRole("button", { name: "הוסיפו למועדפים" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/users/me/saved/event/${RID}`));
    expect(isSaved("event", RID)).toBe(true);
    expect(isSaved("recipe", RID)).toBe(false);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(showToast.success).toHaveBeenCalled();
  });

  it("renders filled when the cache already holds the item, and unsaves", async () => {
    api.get.mockResolvedValue({ data: [{ item_type: "recipe", item_id: RID }] });
    render(<SaveButton itemType="recipe" itemId={RID} />);
    const btn = await screen.findByRole("button", { name: "הסר ממועדפים" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/users/me/saved/recipe/${RID}`));
    expect(isSaved("recipe", RID)).toBe(false);
  });

  it("rolls back when the save fails", async () => {
    api.post.mockRejectedValue({ response: { status: 500 } });
    render(<SaveButton itemType="recipe" itemId={RID} />);
    fireEvent.click(screen.getByRole("button", { name: "הוסיפו למועדפים" }));
    await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(isSaved("recipe", RID)).toBe(false);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("a heart elsewhere on the page follows the shared cache", async () => {
    render(<SaveButton itemType="recipe" itemId={RID} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    setSavedLocal("recipe", RID, true);
    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("finishes a guest's save after sign-in", async () => {
    sessionStorage.setItem(
      "pending_action",
      JSON.stringify({ type: "save:recipe", producerId: RID, scrollY: 0 }),
    );
    window.scrollTo = vi.fn();
    render(<SaveButton itemType="recipe" itemId={RID} />);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/users/me/saved/recipe/${RID}`));
    expect(sessionStorage.getItem("pending_action")).toBeNull();
  });
});

// MEH-2559 review (F7): the "row" look is a 32px face inside a 44px target,
// and an unknown variant falls back to the hero circle, never to no styling.
describe("SaveButton — variants", () => {
  it('"row": a 44px tap target holding a 32px white face', () => {
    render(<SaveButton itemType="event" itemId={RID} variant="row" />);
    const btn = screen.getByTestId("save-event");
    expect(btn.className).toContain("w-11 h-11");
    const face = btn.querySelector(".w-8");
    expect(face).toBeTruthy();
    expect(face.className).toContain("w-8 h-8");
    expect(face.className).toContain("bg-white/95");
  });

  it('"overlay" (default): the 44px white circle itself, no inner face', () => {
    render(<SaveButton itemType="recipe" itemId={RID} />);
    const btn = screen.getByTestId("save-recipe");
    expect(btn.className).toContain("w-11 h-11");
    expect(btn.className).toContain("bg-white/95");
    expect(btn.querySelector(".w-8")).toBeNull();
  });

  it("an unknown variant falls back to the overlay look", () => {
    render(<SaveButton itemType="recipe" itemId={RID} variant="nope" />);
    expect(screen.getByTestId("save-recipe").className).toContain("bg-white/95");
  });
});
