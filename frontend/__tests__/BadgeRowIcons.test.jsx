import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// MEH-2584: attribute badges carry the filter chip's glyph next to the word;
// "new" / "recommended" stay text-only.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import BadgeRow from "@/components/BadgeRow";
import { badgeIcon } from "@/lib/chip-icons";

const pill = (container, key) =>
  container.querySelector(`[data-badge="${key}"]`);

describe("BadgeRow attribute icons (MEH-2584)", () => {
  it("grass_fed and gluten_free pills render an aria-hidden svg before the label", () => {
    const { container } = render(
      <BadgeRow producer={{ grass_fed: true, has_gluten_free_products: true }} />,
    );
    for (const key of ["grass_fed", "gluten_free"]) {
      const svg = pill(container, key).querySelector("svg");
      expect(svg, key).not.toBeNull();
      expect(svg.closest("[aria-hidden='true']"), key).not.toBeNull();
    }
    expect(pill(container, "grass_fed").textContent).toBe("גראס פד");
  });

  it("new and recommended pills stay text-only", () => {
    const { container } = render(
      <BadgeRow producer={{ days_since_created: 3, is_recommended: true }} />,
    );
    expect(pill(container, "new").querySelector("svg")).toBeNull();
    expect(pill(container, "recommended").querySelector("svg")).toBeNull();
  });

  it("delivery maps to the has_delivery chip glyph", () => {
    expect(badgeIcon("delivery")).not.toBeNull();
    expect(badgeIcon("new")).toBeNull();
    expect(badgeIcon("not_a_badge")).toBeNull();
  });
});
