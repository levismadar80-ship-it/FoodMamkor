import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = { trigger_aria: "מידע נוסף" };
    return flat[key] ?? key;
  },
}));

import InfoTooltip from "@/components/InfoTooltip";

describe("InfoTooltip", () => {
  it("renders trigger button with default aria-label", () => {
    render(<InfoTooltip content="hello" />);
    expect(screen.getByRole("button", { name: "מידע נוסף" })).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("accepts a custom aria-label", () => {
    render(<InfoTooltip content="hello" label="הסבר על המצב" />);
    expect(screen.getByRole("button", { name: "הסבר על המצב" })).toBeInTheDocument();
  });

  it("click toggles open and sets aria-describedby", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");

    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).not.toHaveAttribute("aria-describedby");

    fireEvent.click(btn);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("עזרה");
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(btn.getAttribute("aria-describedby")).toBe(tip.getAttribute("id"));

    fireEvent.click(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("Escape key closes the tooltip", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("pointerdown outside the wrapper closes the tooltip", () => {
    render(
      <div>
        <InfoTooltip content="עזרה" />
        <button type="button" data-testid="outside">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "מידע נוסף" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders ReactNode content (multi-line)", () => {
    render(
      <InfoTooltip
        content={
          <>
            line A<br />line B
          </>
        }
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("line A");
    expect(tip).toHaveTextContent("line B");
    expect(tip.querySelector("br")).not.toBeNull();
  });

  it("focus opens the tooltip (keyboard a11y)", () => {
    render(<InfoTooltip content="עזרה" />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
