import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WhatsThis from "@/components/WhatsThis";

// MEH-1115: tap-to-expand disclosure — collapsed by default, aria wiring,
// toggle open/close. next-intl is mocked flat (ReviewsSection.test.jsx pattern).

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => (key === "trigger" ? "מה זה?" : key),
}));

describe("WhatsThis (MEH-1115)", () => {
  it("renders collapsed by default with correct aria wiring", () => {
    render(<WhatsThis content="הסבר קצר" testId="whats-this-x" />);
    const btn = screen.getByTestId("whats-this-x");
    expect(btn).toHaveTextContent("מה זה?");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    const panelId = btn.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");
    expect(panel).toHaveTextContent("הסבר קצר");
  });

  it("tap opens the panel and flips aria-expanded; second tap closes", () => {
    render(<WhatsThis content="הסבר קצר" testId="whats-this-x" />);
    const btn = screen.getByTestId("whats-this-x");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    expect(panel).not.toHaveAttribute("hidden");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });
});
