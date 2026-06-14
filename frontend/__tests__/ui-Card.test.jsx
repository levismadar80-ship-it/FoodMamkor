import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ui/Card uses next/navigation's useRouter for href-driven navigation.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import Card from "@/components/ui/Card";

describe("ui/Card", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("renders body children", () => {
    render(<Card>תוכן</Card>);
    expect(screen.getByText("תוכן")).toBeInTheDocument();
  });

  it("renders as an <article>", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector("article")).toBeInTheDocument();
  });

  it("renders media, overlay and footer slots", () => {
    render(
      <Card
        media={<img data-testid="media" alt="" />}
        overlay={<span data-testid="overlay">♥</span>}
        footer={<span data-testid="footer">₪10</span>}
      >
        body
      </Card>,
    );
    expect(screen.getByTestId("media")).toBeInTheDocument();
    expect(screen.getByTestId("overlay")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("is non-interactive (no cursor-pointer) without href or onClick", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector("article").className).not.toContain(
      "cursor-pointer",
    );
  });

  it("navigates via router.push on a bare-surface click when href is set", () => {
    const { container } = render(<Card href="/producer/1">body</Card>);
    const article = container.querySelector("article");
    expect(article.className).toContain("cursor-pointer");
    fireEvent.click(article);
    expect(push).toHaveBeenCalledWith("/producer/1");
  });

  it("calls onClick instead of navigating when both onClick and href are set", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card href="/x" onClick={onClick}>
        body
      </Card>,
    );
    fireEvent.click(container.querySelector("article"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores clicks that land on an inner link/button (no hijack)", () => {
    render(
      <Card href="/producer/1">
        <button type="button">פעולה פנימית</button>
      </Card>,
    );
    fireEvent.click(screen.getByRole("button", { name: "פעולה פנימית" }));
    expect(push).not.toHaveBeenCalled();
  });

  it("applies the active ring classes when active", () => {
    const { container } = render(<Card active>x</Card>);
    expect(container.querySelector("article").className).toContain(
      "ring-2",
    );
  });

  it("uses a transparent resting border for the flat variant", () => {
    const { container } = render(<Card variant="flat">x</Card>);
    expect(container.querySelector("article").className).toContain(
      "border-transparent",
    );
  });
});
