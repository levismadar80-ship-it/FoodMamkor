import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SkeletonList, SkeletonTable, SkeletonForm, SkeletonTiles } from "@/components/Skeleton";

/**
 * MEH-2601 — the four shape skeletons share one contract: a role="status"
 * wrapper, the screen's existing loading copy kept sr-only (so specs that
 * wait for it to leave the DOM still gate correctly), and decorative boxes
 * that carry no text.
 *
 * Shown failing (29/10): SkeletonList rendered with 3 rows while the
 * assertion expected `count` → red; the sr-only span dropped → red;
 * restored → green.
 */
const LABEL = "בטעינה...";

function noVisibleText(status) {
  const sr = status.querySelector(".sr-only");
  // The styled-jsx <style> block is text in jsdom, never on screen.
  return Array.from(status.childNodes)
    .filter((n) => n !== sr && n.nodeName !== "STYLE")
    .map((n) => n.textContent)
    .join("");
}

describe("shape skeletons", () => {
  it("SkeletonList draws `count` rows, label sr-only, nothing visible", () => {
    render(<SkeletonList count={4} label={LABEL} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status.querySelector(".sr-only")).toHaveTextContent(LABEL);
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect(noVisibleText(status)).toBe("");
  });

  it("SkeletonTable: wide rows carry `cols` cells and the phone stack is capped at 4 cards", () => {
    const { container } = render(<SkeletonTable rows={6} cols={5} label={LABEL} />);
    const wide = container.querySelector(".hidden.md\\:block");
    // header + 6 rows, each a grid of 5 cells
    expect(wide.children).toHaveLength(7);
    expect(wide.children[1].children).toHaveLength(5);
    const narrow = container.querySelector(".md\\:hidden");
    expect(narrow.children).toHaveLength(4);
    expect(noVisibleText(screen.getByRole("status"))).toBe("");
  });

  it("SkeletonForm draws `fields` label+field pairs", () => {
    render(<SkeletonForm fields={3} label={LABEL} />);
    expect(screen.getByRole("status").querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it("SkeletonTiles draws `count` tiles and passes a test id through", () => {
    render(<SkeletonTiles count={4} label={LABEL} testId="admin-home-skeleton" />);
    expect(screen.getByTestId("admin-home-skeleton").querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });
});
