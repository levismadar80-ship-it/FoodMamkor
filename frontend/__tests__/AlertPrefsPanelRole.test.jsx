/**
 * MEH-2199 chunk 6 (bonus) — AlertPrefsPanel declared role="dialog" on an
 * inline, always-visible preferences panel. It has no modal semantics: no focus
 * trap, no Escape, no way out, and it needs none. Calling it a dialog told a
 * screen reader to expect all three.
 *
 * This is the INVERSE of the rest of the ticket. The other five surfaces gained
 * the behaviour their role promised; this one sheds a role it never meant.
 * role="group" is what an inline labelled grouping is.
 *
 * Asserted on the RENDERED accessibility tree, not by grepping the source. A
 * source match only proves the prescribed edit was applied; this proves what a
 * screen reader actually walks (workflow.md ADR-032 §3.6 — assert behaviour,
 * never that the change was made).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AlertPrefsPanel from "@/components/AlertPrefsPanel";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
  useLocale: () => "he",
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: {} })), put: vi.fn(() => Promise.resolve({})) },
}));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, phone: "0500000000" }, updateProfile: vi.fn() }),
}));
vi.mock("@/lib/validators", () => ({ validateIsraeliPhone: () => true }));
vi.mock("@phosphor-icons/react", () => {
  const Stub = (props) => <span {...props} />;
  return Object.fromEntries(
    ["Bell", "BellSlash", "Check", "Confetti", "CookingPot", "Handbag", "Truck", "ChatCircle"]
      .map((n) => [n, Stub]),
  );
});

afterEach(cleanup);

describe("AlertPrefsPanel — role correction (MEH-2199)", () => {
  it("exposes a labelled GROUP and no dialog", async () => {
    render(<AlertPrefsPanel producerId="p1" producerName="עסק" onClose={() => {}} />);

    const group = await screen.findByRole("group");
    expect(group).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    // The accessible name must survive the role change — aria-labelledby is
    // valid on a group, and losing it would trade one defect for another.
    expect(group).toHaveAccessibleName();
  });
});
