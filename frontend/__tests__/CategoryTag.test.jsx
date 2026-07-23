import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryTag from "@/components/CategoryTag";

// CategoryTag is a pure pill — renders the category name only.
// MEH-1020 retired the category emoji from the UI (the code glyph system
// superseded it); the pill no longer reads category.emoji.
describe("CategoryTag", () => {
  it("renders the category name", () => {
    render(<CategoryTag category={{ name: "מאפים" }} />);
    expect(screen.getByText("מאפים")).toBeInTheDocument();
  });

  it("ignores the emoji even when present (MEH-1020 — category emoji retired)", () => {
    render(<CategoryTag category={{ name: "מאפים", emoji: "🥐" }} />);
    expect(screen.queryByText("🥐")).not.toBeInTheDocument();
    expect(screen.getByText("מאפים")).toBeInTheDocument();
  });

  it("renders only the name span inside the pill", () => {
    const { container } = render(<CategoryTag category={{ name: "מאפים", emoji: "🥐" }} />);
    // Only the name span should render — no emoji span, even when passed.
    const spans = container.querySelectorAll("span > span");
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveTextContent("מאפים");
  });

  it("renders as a rounded pill", () => {
    const { container } = render(
      <CategoryTag category={{ name: "מאפים" }} />,
    );
    expect(container.firstChild.className).toContain("rounded-full");
  });
});
