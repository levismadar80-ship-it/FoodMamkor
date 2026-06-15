import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryTag from "@/components/CategoryTag";

// CategoryTag is a pure pill — renders an optional emoji + the category name.
describe("CategoryTag", () => {
  it("renders the category name", () => {
    render(<CategoryTag category={{ name: "מאפים" }} />);
    expect(screen.getByText("מאפים")).toBeInTheDocument();
  });

  it("renders the emoji when present", () => {
    render(<CategoryTag category={{ name: "מאפים", emoji: "🥐" }} />);
    expect(screen.getByText("🥐")).toBeInTheDocument();
    expect(screen.getByText("מאפים")).toBeInTheDocument();
  });

  it("omits the emoji span when no emoji is given", () => {
    const { container } = render(<CategoryTag category={{ name: "מאפים" }} />);
    // Only the name span should render inside the pill.
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
