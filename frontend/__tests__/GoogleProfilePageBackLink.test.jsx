/**
 * MEH-3723: «הפרופיל בגוגל» is opened from the edit hub, so its back link
 * returns to /producer/dashboard/edit (it pointed at «כלים» before).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl/server", () => ({ getTranslations: async (ns) => (key) => `${ns}.${key}` }));
vi.mock("@/components/dashboard/google-profile/GoogleProfileTool", () => ({ default: () => null }));
vi.mock("@/components/ui/BackLink", () => ({
  default: ({ href, label }) => <a data-testid="back" href={href}>{label}</a>,
}));

import GoogleProfilePage from "@/app/[locale]/producer/dashboard/google-profile/page";

describe("google-profile page back link (MEH-3723)", () => {
  it("returns to the edit hub with the hub's own back label", async () => {
    render(await GoogleProfilePage());
    const back = screen.getByTestId("back");
    expect(back.getAttribute("href")).toBe("/producer/dashboard/edit");
    expect(back).toHaveTextContent("dashboard.producer.edit_accordion.hub_back");
  });
});
