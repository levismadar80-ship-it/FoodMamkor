/**
 * MEH-2733 — the printable counter card was reachable from nowhere, and its
 * fixed 148mm width overflowed a 375px phone.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (scope) => (key) => `${scope}.${key}`,
}));
vi.mock("@/lib/rescue", () => ({ rescueBagsEnabled: () => true }));
vi.mock("@/components/dashboard/RescueTab", () => ({ default: () => <div data-testid="rescue-tab" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

import RescueDashboardPage from "@/app/[locale]/producer/dashboard/rescue/page";
import CounterCardPage from "@/app/[locale]/producer/dashboard/rescue/counter-card/page";

describe("MEH-2733 counter card link + width", () => {
  it("the rescue screen links to the counter card", async () => {
    render(await RescueDashboardPage());
    const link = screen.getByRole("link", { name: /rescue\.dashboard\.counter_card_link/ });
    expect(link.getAttribute("href")).toBe("/producer/dashboard/rescue/counter-card");
  });

  it("the counter card links back, hidden on paper", async () => {
    render(await CounterCardPage());
    const back = screen.getByRole("link", { name: /rescue\.counter_card\.back/ });
    expect(back.getAttribute("href")).toBe("/producer/dashboard/rescue");
    expect(back.closest(".print\\:hidden")).not.toBeNull();
  });

  it("the card is capped at 148mm on screen, not fixed to it", async () => {
    render(await CounterCardPage());
    const card = screen.getByTestId("rescue-counter-card").querySelector("article");
    expect(card.style.width).not.toBe("148mm");
    expect(card.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["w-full", "max-w-[148mm]", "print:w-[148mm]"]),
    );
  });
});
