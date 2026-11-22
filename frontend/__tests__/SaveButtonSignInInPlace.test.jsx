/**
 * MEH-3661 — a guest taps the heart, signs in with Google INSIDE the modal,
 * and the save finishes by itself on the same page.
 *
 * Real SaveButton + real LoginPromptModal; only Google's widget is stubbed
 * (its success sets the user, as finishSignIn does, then calls onSuccess).
 * Discriminates: if SaveButton's onSignedIn cleared the pending action (or the
 * modal routed success through onClose), no POST is sent — red here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createContext, useContext, useEffect, useState } from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => key;
    t.rich = (key) => key;
    return t;
  },
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" } }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

// The auth store, settable from the stubbed Google button. The user travels
// through a context; the setter is handed out in an effect, not during render
// (react-hooks/globals — same as PasskeySignIn.test.jsx).
let setUserExternal = () => {};
const AuthCtx = createContext(null);
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: useContext(AuthCtx) }) }));
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ onSuccess }) => (
    <button
      type="button"
      onClick={() => {
        setUserExternal({ id: "u1" });
        onSuccess();
      }}
    >
      google-ok
    </button>
  ),
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
  HeartStraight: () => <span />,
  X: () => <span />,
}));

import SaveButton from "@/components/SaveButton";
import api from "@/lib/api";
import { resetSavedCache } from "@/lib/saved-cache";

const RID = "11111111-1111-4111-8111-111111111111";

function Harness() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    setUserExternal = setUser;
  }, []);
  return (
    <AuthCtx.Provider value={user}>
      <SaveButton itemType="recipe" itemId={RID} />
    </AuthCtx.Provider>
  );
}

beforeEach(() => {
  resetSavedCache();
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({});
  window.scrollTo = vi.fn();
});

describe("SaveButton + Google in the modal (MEH-3661)", () => {
  it("signs in in place, closes the modal and saves without a second tap", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "add_aria" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText("google-ok")));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/users/me/saved/recipe/${RID}`));
    expect(sessionStorage.getItem("pending_action")).toBeNull();
  });

  it("dismissing still drops the intent — a later sign-in saves nothing", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "add_aria" }));
    fireEvent.click(screen.getByText("dismiss_cta"));
    expect(sessionStorage.getItem("pending_action")).toBeNull();

    await act(async () => setUserExternal({ id: "u1" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(api.post).not.toHaveBeenCalled();
  });
});
