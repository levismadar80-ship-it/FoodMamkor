/**
 * MEH-2728 — «סלי הפתעה» is opened from «כלים», and every other screen opened
 * from there links back to it. This one had no way back.
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

describe("MEH-2728 rescue dashboard back link", () => {
  it("links back to the tools tab with its own key", async () => {
    render(await RescueDashboardPage());
    const back = screen.getByRole("link", { name: "rescue.dashboard.back" });
    expect(back.getAttribute("href")).toBe("/producer/dashboard/tools");
  });
});
