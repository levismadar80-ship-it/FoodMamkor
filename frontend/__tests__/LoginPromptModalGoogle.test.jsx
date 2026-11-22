/**
 * MEH-3661 — Google sign-in inside «רוצה לשמור?», and the funnel events.
 *
 * Discriminates: the old modal renders no `login-prompt-google`, has no
 * `onSignedIn`, and sends no event — every case below fails against it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const envRef = { current: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" } };
vi.mock("@/lib/env", () => ({
  get env() {
    return envRef.current;
  },
}));
const trackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...a) => trackEvent(...a) }));
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => key;
    t.rich = (key) => key;
    return t;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({ X: () => null }));
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ onSuccess, onError, termsAccepted }) => (
    <div data-terms={String(termsAccepted)} data-testid="gsi">
      <button type="button" onClick={onSuccess}>google-ok</button>
      <button type="button" onClick={() => onError("שגיאת Google")}>google-fail</button>
    </div>
  ),
}));

import LoginPromptModal from "@/components/LoginPromptModal";

beforeEach(() => {
  trackEvent.mockReset();
  envRef.current = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "cid" };
});

describe("LoginPromptModal — Google in place (MEH-3661)", () => {
  it("shows Google, carrying consent, with the locked consent line, above «היכנסו»", () => {
    render(<LoginPromptModal open onClose={() => {}} nextPath="/x" />);
    const google = screen.getByTestId("login-prompt-google");
    expect(screen.getByTestId("gsi")).toHaveAttribute("data-terms", "true");
    expect(screen.getByTestId("login-prompt-oauth-terms")).toHaveTextContent("auth.login.oauth_terms_google");
    const login = screen.getByRole("link", { name: "login_cta" });
    expect(google.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(login).toHaveAttribute("href", "/login?redirect=%2Fx");
  });

  it("no Google client id: no Google block, «היכנסו» still there", () => {
    envRef.current = {};
    render(<LoginPromptModal open onClose={() => {}} />);
    expect(screen.queryByTestId("login-prompt-google")).toBeNull();
    expect(screen.getByRole("link", { name: "login_cta" })).toBeInTheDocument();
  });

  it("success calls onSignedIn and NOT onClose (the pending action survives)", () => {
    const onClose = vi.fn();
    const onSignedIn = vi.fn();
    render(<LoginPromptModal open onClose={onClose} onSignedIn={onSignedIn} reason="favorite" />);
    fireEvent.click(screen.getByText("google-ok"));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("login_prompt_action", { reason: "favorite", action: "google" });
  });

  it("success without onSignedIn falls back to onClose", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open onClose={onClose} />);
    fireEvent.click(screen.getByText("google-ok"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("failure shows the message and keeps the modal open", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open onClose={onClose} />);
    fireEvent.click(screen.getByText("google-fail"));
    expect(screen.getByTestId("login-prompt-oauth-error")).toHaveTextContent("שגיאת Google");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("LoginPromptModal — events (MEH-3661)", () => {
  it("open sends login_prompt_shown with the reason; closed sends nothing", () => {
    const { rerender } = render(<LoginPromptModal open={false} onClose={() => {}} reason="updates" />);
    expect(trackEvent).not.toHaveBeenCalled();
    rerender(<LoginPromptModal open onClose={() => {}} reason="updates" />);
    expect(trackEvent).toHaveBeenCalledWith("login_prompt_shown", { reason: "updates" });
  });

  it("«אולי אחר כך» and Esc are one dismiss each", () => {
    const onClose = vi.fn();
    render(<LoginPromptModal open onClose={onClose} reason="save" />);
    fireEvent.click(screen.getByText("dismiss_cta"));
    fireEvent.keyDown(window, { key: "Escape" });
    const dismisses = trackEvent.mock.calls.filter(
      ([name, props]) => name === "login_prompt_action" && props.action === "dismiss",
    );
    expect(dismisses).toHaveLength(2);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("«היכנסו» sends action login", () => {
    render(<LoginPromptModal open onClose={() => {}} reason="review" />);
    const login = screen.getByRole("link", { name: "login_cta" });
    login.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(login);
    expect(trackEvent).toHaveBeenCalledWith("login_prompt_action", { reason: "review", action: "login" });
  });
});
