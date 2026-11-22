// @ts-check
/**
 * MEH-3676 — the logo (SeedMark) beside two strings that name מהמקור:
 * the /login + /register hero line (dark set, on the photo scrim) and the
 * dashboard «מה חדש במהמקור» row (light set, before the unread dot).
 * Decorative only: aria-hidden, so the text a screen reader reads is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";
import RegisterClient from "@/app/[locale]/register/RegisterClient";
import WhatsNewRow from "@/components/producer/WhatsNewRow";
import { WHATS_NEW_SEEN_KEY, visibleReleases } from "@/lib/whats-new";

const replaceMock = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

// Mutable auth state — flipped per test. Provides login + register so both
// components' destructures resolve.
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    login: vi.fn(),
    register: vi.fn().mockResolvedValue({}),
  }),
}));

// OAuth off — keeps the forms focused; not under test here.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }) => children }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }) => children,
}));
vi.mock("@phosphor-icons/react", () => ({
  CaretDown: () => <span />,
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
  Leaf: () => null,
}));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span data-testid="spinner" /> }));
vi.mock("@/components/PasswordInput", () => ({ default: () => <input data-testid="pw" /> }));
vi.mock("@/components/ui/Input", () => ({
  default: ({ label, ...props }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (x) => x, IMAGE_RATIOS: {} }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/lib/passwordMessages", () => ({ firstFailureMessage: () => "" }));
vi.mock("@/lib/validators", () => ({
  validateEmail: (v) => typeof v === "string" && v.includes("@") && v.includes("."),
  PASSWORD_MIN_LENGTH: 12,
}));


beforeEach(() => {
  window.localStorage.clear();
  authState.user = null;
  authState.loading = false;
  paramsRef.current = new URLSearchParams("");
});

/** @param {HTMLElement} el */
const markIn = (el) => el.querySelector("svg[data-seed-mark]");

describe.each([
  ["login", LoginClient, "hero_overlay"],
  ["register", RegisterClient, "auth.login.hero_overlay"],
])("%s hero line", (_name, Page, key) => {
  it("carries the on-dark logo, hidden from screen readers, after the words", () => {
    render(<Page />);
    const line = screen.getByText(key).closest("p");
    const mark = markIn(line);
    expect(mark).not.toBeNull();
    expect(mark.getAttribute("data-seed-mark")).toBe("dark");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(line.textContent.trim()).toBe(key);
    // The words come first in the DOM, the mark last (it sits at the end of the line).
    expect(line.lastElementChild).toBe(mark);
  });
});

describe("WhatsNewRow title", () => {
  it("unseen: the light logo at 16px, before the unread dot", () => {
    render(<WhatsNewRow />);
    const title = document.getElementById("whats-new-row-title");
    const mark = markIn(title);
    expect(mark).not.toBeNull();
    expect(mark.getAttribute("data-seed-mark")).toBe("light");
    expect(mark.getAttribute("width")).toBe("16");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    const dot = screen.getByTestId("whats-new-dot");
    expect(mark.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("seen: the logo stays when the dot is gone", () => {
    window.localStorage.setItem(WHATS_NEW_SEEN_KEY, visibleReleases()[0].version);
    render(<WhatsNewRow />);
    expect(screen.queryByTestId("whats-new-dot")).toBeNull();
    expect(markIn(document.getElementById("whats-new-row-title"))).not.toBeNull();
  });
});
