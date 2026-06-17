import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "@/components/ui/Button";

// ui/Button is a pure presentational atom (MEH-602). No next-intl / router
// dependency — only the @phosphor-icons CircleNotch spinner, which renders
// as an inline SVG under jsdom.
describe("ui/Button", () => {
  it("renders children inside a real <button> with type=button by default", () => {
    render(<Button>שמירה</Button>);
    const btn = screen.getByRole("button", { name: "שמירה" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("type", "button");
  });

  it("forwards an explicit type (e.g. submit)", () => {
    render(<Button type="submit">שלח</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("applies the primary variant classes by default", () => {
    render(<Button>פעולה</Button>);
    expect(screen.getByRole("button").className).toContain("bg-action-primary");
  });

  it("applies the requested variant classes", () => {
    render(<Button variant="outlined">פעולה</Button>);
    expect(screen.getByRole("button").className).toContain("border-action-primary");
  });

  it("falls back to the primary variant for an unknown variant", () => {
    render(<Button variant="nope">פעולה</Button>);
    expect(screen.getByRole("button").className).toContain("bg-action-primary");
  });

  it("applies the requested size and keeps a ≥44px touch target", () => {
    render(<Button size="lg">גדול</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("min-h-[48px]");
  });

  it("falls back to the md size for an unknown size", () => {
    render(<Button size="huge">x</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>לחצי</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled (and unclickable) when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        לחצי
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  describe("loading state", () => {
    it("sets aria-busy, the gerund aria-label, and disables the button", () => {
      render(<Button loading>שמירה</Button>);
      const btn = screen.getByRole("button");
      expect(btn).toHaveAttribute("aria-busy", "true");
      expect(btn).toHaveAttribute("aria-label", "בטעינה…");
      expect(btn).toBeDisabled();
    });

    it("still renders its children alongside the spinner", () => {
      render(<Button loading>שמירה</Button>);
      expect(screen.getByText("שמירה")).toBeInTheDocument();
    });

    it("hides the trailing icon while loading", () => {
      render(
        <Button loading trailingIcon={<span data-testid="trail">→</span>}>
          המשך
        </Button>,
      );
      expect(screen.queryByTestId("trail")).not.toBeInTheDocument();
    });
  });

  it("renders leading and trailing icon slots when not loading", () => {
    render(
      <Button
        leadingIcon={<span data-testid="lead">L</span>}
        trailingIcon={<span data-testid="trail">R</span>}
      >
        חיפוש
      </Button>,
    );
    expect(screen.getByTestId("lead")).toBeInTheDocument();
    expect(screen.getByTestId("trail")).toBeInTheDocument();
  });

  it("merges a custom className", () => {
    render(<Button className="my-custom">x</Button>);
    expect(screen.getByRole("button").className).toContain("my-custom");
  });
});
