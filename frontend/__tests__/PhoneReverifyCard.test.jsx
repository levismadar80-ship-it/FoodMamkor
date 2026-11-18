import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";

/**
 * Grill B8 — the `reverify` variant of PhoneVerifyCard, shown to a LIVE
 * business whose WhatsApp number changed (Sapir 14/11: under the field on
 * the edit page AND on the dashboard home). It must not say "before review"
 * (that business is past review) and its success toast is the server's own
 * sentence, not the submit-flow one that tells her to send for review.
 */

const apiMock = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));
vi.mock("@/lib/errors", () => ({ detailToMessage: () => null }));
vi.mock("@phosphor-icons/react", () => ({ ChatCircleText: () => null }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => `${scope}.${key}`,
}));

const T = (k) => `phone_verify.${k}`;

beforeEach(() => {
  apiMock.post.mockReset();
  toastMock.success.mockReset();
  globalThis.sessionStorage?.clear();
});

describe("PhoneVerifyCard variant=reverify", () => {
  it("shows the new-number title and no 'before review' line", () => {
    render(<PhoneVerifyCard variant="reverify" />);
    expect(screen.getByText(T("reverify_title"))).toBeTruthy();
    expect(screen.queryByText(T("title"))).toBeNull();
    expect(screen.queryByText(T("description"))).toBeNull();
  });

  it("the submit variant keeps its title and description", () => {
    render(<PhoneVerifyCard />);
    expect(screen.getByText(T("title"))).toBeTruthy();
    expect(screen.getByText(T("description"))).toBeTruthy();
  });

  it("toasts the server's sentence on success, not the submit-flow one", async () => {
    apiMock.post.mockResolvedValueOnce({ data: {} });
    apiMock.post.mockResolvedValueOnce({ data: { detail: "הטלפון אומת בהצלחה" } });
    const onVerified = vi.fn();
    render(<PhoneVerifyCard variant="reverify" onVerified={onVerified} />);
    await act(async () => {
      fireEvent.click(screen.getByText(T("send_cta")));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(T("code_label")), {
        target: { value: "123456" },
      });
    });
    expect(toastMock.success).toHaveBeenCalledWith("הטלפון אומת בהצלחה");
    expect(onVerified).toHaveBeenCalledTimes(1);
  });
});
