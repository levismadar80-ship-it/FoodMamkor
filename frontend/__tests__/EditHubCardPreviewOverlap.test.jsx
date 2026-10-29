import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2605 — at 375px the «העסק» hub tile drew the thumbnails' "+N" chip on top
// of the first category chip: every preview slot was min-w-0, so the
// fixed-size thumbnail row shrank below its content and overflowed into its
// neighbour. jsdom has no layout, so this pins the slot classes that decide it.
vi.mock("@phosphor-icons/react", () => ({ CaretRight: () => <span /> }));

import EditHubCard from "@/components/EditHubCard";

function slots() {
  render(
    <EditHubCard
      testId="hub-card-profile"
      title="העסק"
      statusLine="4 מתוך 4 הושלמו"
      previews={[<span key="a">thumbs</span>, <span key="b">chips</span>]}
      onClick={() => {}}
    />,
  );
  return [...screen.getByText("thumbs").parentElement.parentElement.children];
}

describe("EditHubCard preview slots (MEH-2605)", () => {
  it("never lets the first preview shrink under its content", () => {
    const [first] = slots();
    expect(first.className).toContain("shrink-0");
    expect(first.className).not.toContain("min-w-0");
  });

  it("lets later previews shrink and clip instead of being painted over", () => {
    const [, second] = slots();
    expect(second.className).toContain("min-w-0");
    expect(second.className).toContain("overflow-hidden");
  });
});
