import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Badge from "@/components/ui/Badge";

// ui/Badge is a pure category/quality pill (MEH-602). It composes ui/Tooltip
// only when a `tooltip` prop is passed — no other deps.
describe("ui/Badge", () => {
  it("renders its children", () => {
    render(<Badge>אורגני</Badge>);
    expect(screen.getByText("אורגני")).toBeInTheDocument();
  });

  it("applies the muted variant by default", () => {
    render(<Badge>נייטרל</Badge>);
    expect(screen.getByText("נייטרל").className).toContain("bg-surface-card");
  });

  it("applies the primary variant classes", () => {
    render(<Badge variant="primary">מאומת</Badge>);
    expect(screen.getByText("מאומת").className).toContain("bg-primary");
  });

  it("collapses secondary onto primary (known debt #1)", () => {
    render(<Badge variant="secondary">x</Badge>);
    expect(screen.getByText("x").className).toContain("bg-primary");
  });

  it("falls back to muted for an unknown variant", () => {
    render(<Badge variant="bogus">y</Badge>);
    expect(screen.getByText("y").className).toContain("bg-surface-card");
  });

  it("applies the sm size classes", () => {
    render(<Badge size="sm">z</Badge>);
    expect(screen.getByText("z").className).toContain("text-[10px]");
  });

  it("renders without a tooltip wrapper when no tooltip prop is given", () => {
    render(<Badge>פשוט</Badge>);
    // No tooltip element is present until the wrapper is hovered/clicked.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("wraps in a Tooltip and surfaces the content on click", () => {
    render(<Badge tooltip="בית העסק מחזיק בתעודת אורגני">אורגני</Badge>);
    // Tooltip starts hidden; clicking the trigger toggles it visible.
    fireEvent.click(screen.getByText("אורגני"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "בית העסק מחזיק בתעודת אורגני",
    );
  });

  it("merges a custom className onto the pill", () => {
    render(<Badge className="extra-pill">k</Badge>);
    expect(screen.getByText("k").className).toContain("extra-pill");
  });
});
