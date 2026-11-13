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
    expect(line.firstElementChild).toBe(icons[0]);
    expect(icons[0].getAttribute("width")).toBe(String(FACT_ICON_SIZE));
    expect(icons[0].getAttribute("aria-hidden")).toBe("true");
    expect(icons[0].getAttribute("class")).toContain("text-fg-muted");
    expect(line.className).toContain("font-bold");
  });

  it("can render as another element", () => {
    render(<FactLine icon={MapPin} as="li" data-testid="li">x</FactLine>);
    expect(screen.getByTestId("li").tagName).toBe("LI");
  });
});
