import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LanguageToggle from "@/components/LanguageToggle";

// LanguageToggle reads next-intl (useLocale/useTranslations) + the next-intl
// -aware router/pathname from "@/i18n/navigation". Mock both — this suite
// exercises the RENDER contract (MEH-1279 variant="bare"), not the locale
// flip (onToggle is unchanged and covered by e2e/flows/14-language-toggle).
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

// Render the Globe as an inspectable stub so we can assert the size prop
// (19 bare vs 20 default) without reaching into Phosphor's SVG internals.
vi.mock("@phosphor-icons/react", () => ({
  Globe: ({ size }) => <span data-testid="globe" data-size={size} />,
}));

describe("LanguageToggle", () => {
  it("default variant: 36px circle chip, Globe size 20, no children", () => {
    render(<LanguageToggle />);
    const btn = screen.getByTestId("language-toggle");
    expect(btn.className).toContain("w-9");
    expect(btn.className).toContain("h-9");
    expect(btn.className).toContain("rounded-full");
    expect(screen.getByTestId("globe")).toHaveAttribute("data-size", "20");
    expect(btn).toHaveAttribute("aria-label");
  });

  it('MEH-1279 variant="bare": no circle chip, Globe size 19', () => {
    render(<LanguageToggle variant="bare" />);
    const btn = screen.getByTestId("language-toggle");
    expect(btn.className).not.toContain("w-9");
    expect(btn.className).not.toContain("h-9");
    expect(btn.className).not.toContain("rounded-full");
    expect(screen.getByTestId("globe")).toHaveAttribute("data-size", "19");
  });

  it('variant="bare": caller className is applied and children render after the Globe', () => {
    render(
      <LanguageToggle variant="bare" className="row-layout-cls">
        <span data-testid="label">עב / EN</span>
      </LanguageToggle>,
    );
    const btn = screen.getByTestId("language-toggle");
    expect(btn.className).toContain("row-layout-cls");
    const globe = screen.getByTestId("globe");
    const label = screen.getByTestId("label");
    expect(btn).toContainElement(label);
    // Globe leads, the affordance label follows.
    expect(globe.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
