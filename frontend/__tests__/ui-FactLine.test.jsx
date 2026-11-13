/**
 * MEH-3028 — FactLine draws its kind's icon at one fixed size and colour,
 * whatever text styling the line carries.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapPin } from "@phosphor-icons/react";
import FactLine, { FACT_ICON_SIZE } from "@/components/ui/FactLine";

describe("FactLine", () => {
  it("renders one decorative icon, fixed size and muted colour, before the text", () => {
    render(
      <FactLine icon={MapPin} className="text-base font-bold mb-3" data-testid="line">
        קצרין
      </FactLine>,
    );
    const line = screen.getByTestId("line");
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe("קצרין");
    const icons = line.querySelectorAll("svg");
    expect(icons).toHaveLength(1);
    // Icon first, in a one-line-tall box, so a wrapped line keeps it beside
    // line one (items-start + h-[1lh], not items-center).
    expect(line.firstElementChild.contains(icons[0])).toBe(true);
    expect(line.firstElementChild.className).toContain("h-[1lh]");
    expect(line.className).toContain("items-start");
    expect(line.className).not.toContain("items-center");
    expect(icons[0].getAttribute("width")).toBe(String(FACT_ICON_SIZE));
    expect(icons[0].getAttribute("aria-hidden")).toBe("true");
    expect(icons[0].getAttribute("class")).toContain("text-fg-muted");
    expect(line.className).toContain("font-bold");
  });

  it("no icon → the same row with no icon, instead of throwing", () => {
    render(<FactLine icon={null} data-testid="bare">יוצאים בימי שישי</FactLine>);
    expect(screen.getByTestId("bare").querySelector("svg")).toBeNull();
    expect(screen.getByTestId("bare").textContent).toBe("יוצאים בימי שישי");
  });

  it("can render as another element", () => {
    render(<FactLine icon={MapPin} as="li" data-testid="li">x</FactLine>);
    expect(screen.getByTestId("li").tagName).toBe("LI");
  });
});
