/**
 * MEH-2693 — the business-page line for «עסק של מילואימניקים».
 * Cells: not earned → nothing; earned alone → one pill; earned beside other
 * badges → still exactly one pill (no other badge leaks back onto the page,
 * which MEH-1334 removed from the header).
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import ReservistBadgeLine from "@/app/[locale]/producer/[id]/components/ReservistBadgeLine";

const pills = (c) => [...c.querySelectorAll("[data-badge]")].map((el) => el.getAttribute("data-badge"));

describe("ReservistBadgeLine (MEH-2693)", () => {
  it("renders nothing when the business did not declare it", () => {
    const { container } = render(<ReservistBadgeLine producer={{ grass_fed: true }} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the one pill, with its icon and the approved label", () => {
    const { container } = render(<ReservistBadgeLine producer={{ reservist_owned: true }} />);
    expect(pills(container)).toEqual(["reservist_owned"]);
    const pill = container.querySelector('[data-badge="reservist_owned"]');
    expect(pill.textContent).toBe("עסק של מילואימניקים");
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("shows only its own pill when other badges are earned too", () => {
    const { container } = render(
      <ReservistBadgeLine
        producer={{ reservist_owned: true, grass_fed: true, has_gluten_free_products: true, verification_tier: "verified" }}
      />,
    );
    expect(pills(container)).toEqual(["reservist_owned"]);
  });
});
