import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutProcessClient from "@/app/[locale]/about/process/AboutProcessClient";

// MEH-2069: this VerifiedTag renders inside the bg-background-alt section
// (#ede4d2, NOT the cream #f5f0e8 page default) — bg-accent/10 there computed
// 3.68:1, AA fail for the 12.5px chip text (worse than the 4.07:1 cream case
// MEH-2032/#2909 fixed in BadgeRow.jsx). Same usage-level fix: solid
// bg-surface-card gets text-accent to 5.19:1, independent of the page
// background since the chip is now fully opaque. Asserts the FIXED class is
// present and the FAILING one is gone — a presence-only check on
// bg-surface-card alone couldn't distinguish "fixed" from "never had the
// bug" (mirrors BadgeRow.test.jsx's MEH-2032 case).

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (k) => (ns ? `${ns}.${k}` : k);
    t.rich = (k) => (ns ? `${ns}.${k}` : k);
    return t;
  },
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "Path", "PaperPlaneTilt", "ChatsCircle", "MapPin", "Storefront",
      "SealCheck", "User", "BookOpen", "ChatCircleText", "Certificate",
      "Leaf", "Note", "HandHeart", "Cursor", "ArrowLeft",
    ].map((name) => [name, Stub]),
  );
});
vi.mock("@/components/BusinessCtaLink", () => ({
  default: ({ children }) => <a href="/register/producer">{children}</a>,
}));

describe("AboutProcessClient VerifiedTag contrast (MEH-2069)", () => {
  it("uses the AA-passing bg-surface-card, not bg-accent/10", () => {
    render(<AboutProcessClient />);
    // "process.tier.verified" also renders inside an unrelated illustrative
    // badge preview earlier on the page (bg-background, never had the bug) —
    // filter to the VerifiedTag chip specifically via its distinguishing
    // classes (text-[12.5px] + text-accent), not just the label text.
    const chips = screen
      .getAllByText("process.tier.verified")
      .map((label) => label.closest("span.rounded-full"))
      .filter((el) => el?.className.includes("text-[12.5px]") && el?.className.includes("text-accent"));
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.className).toContain("bg-surface-card");
      expect(chip.className).not.toContain("bg-accent/10");
    }
  });
});
