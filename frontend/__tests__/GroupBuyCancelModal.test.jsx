/**
 * MEH-1250: the destructive "cancel my commitment" action must go through a
 * dedicated confirm modal, NOT the native window.confirm() (error-idiom
 * unification, MEH-999 JUDGMENT). This test locks the three modal paths:
 *   - clicking the cancel CTA opens the dialog and does NOT delete yet
 *   - dismissing closes the dialog and never calls DELETE
 *   - confirming calls DELETE /group-buys/{id}/commit
 *
 * Component test (not E2E): the cancel flow is auth-gated + commit-gated;
 * mirrors GroupBuyCommit422 (MEH-975) isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import api from "@/lib/api";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/auth-context", () => {
  const user = { id: 1, name: "דנה", role: "user", phone: "0500000000" };
  return { useAuth: () => ({ user, loading: false }) };
});

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099" }));

// A committed, still-open group buy → the cancel CTA renders.
const COMMITTED_GB = {
  id: "gb-1",
  title: "קבוצת רכש לדוגמה",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 2,
  max_participants: 10,
  commits_count: 1,
  price_per_unit_regular: 100,
  price_per_unit_group: 80,
  user_committed: true,
  user_commit: { quantity: 1 },
};

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: COMMITTED_GB })),
    post: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

beforeEach(() => {
  api.delete.mockClear();
});

describe("GroupBuyDetailClient — destructive cancel confirm modal (MEH-1250)", () => {
  it("opens a dialog on cancel and does not DELETE until confirmed", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);
    // Trigger CTA (the only cancel_cta button before the modal opens).
    const trigger = await screen.findByRole("button", { name: "cancel_cta" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("cancel_confirm")).toBeTruthy();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("dismiss closes the dialog and never calls DELETE", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "cancel_cta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "cancel_dismiss" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("confirm calls DELETE /group-buys/{id}/commit", async () => {
    render(<GroupBuyDetailClient id="gb-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "cancel_cta" }));
    const dialog = await screen.findByRole("dialog");
    // Inside the dialog, the confirm button also reads cancel_cta.
    fireEvent.click(within(dialog).getByRole("button", { name: "cancel_cta" }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith("/group-buys/gb-1/commit")
    );
  });
});
