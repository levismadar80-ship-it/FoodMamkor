// MEH-3776 — the one «this is a preview» strip (ui/PreviewBanner).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PreviewBanner from "@/components/ui/PreviewBanner";

describe("PreviewBanner", () => {
  it("announces its text as a status, with the eye hidden from screen readers", () => {
    render(<PreviewBanner>כך הלקוחות רואים את העמוד</PreviewBanner>);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe("כך הלקוחות רואים את העמוד");
    const icon = banner.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("passes the caller's test id through and adds its spacing to the look", () => {
    render(
      <PreviewBanner data-testid="order-preview-banner" className="mx-4 mt-3">
        x
      </PreviewBanner>,
    );
    const banner = screen.getByTestId("order-preview-banner");
    // the look the three screens had before MEH-3776, unchanged
    expect(banner.className).toBe(
      "flex items-start gap-2 bg-green-50 border border-primary/30 rounded-md px-4 py-3 text-sm text-text text-start mx-4 mt-3",
    );
  });

  it("stays a status even when a caller passes another role", () => {
    render(<PreviewBanner role="alert">x</PreviewBanner>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });
});
