import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2605 — at 375px the «העסק» hub tile drew the thumbnails' "+N" chip on top
// of the first category chip: every preview slot was min-w-0, so the
// fixed-size thumbnail row shrank below its content and overflowed into its
// neighbour. jsdom has no layout, so this pins the slot classes that decide it.
vi.mock("@phosphor-icons/react", () => ({ CaretRight: () => <span /> }));

import EditHubCard from "@/components/EditHubCard";

function slots(labels = ["thumbs", "chips"]) {
  render(
    <EditHubCard
      testId="hub-card-profile"
      title="העסק"
      statusLine="4 מתוך 4 הושלמו"
      previews={labels.map((l) => <span key={l}>{l}</span>)}
      onClick={() => {}}
    />,
  );
  if (labels.length === 0) return [];
  return [...screen.getByText(labels[0]).parentElement.parentElement.children];
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

  it("keeps a single preview at its own width", () => {
    const all = slots(["thumbs"]);
    expect(all).toHaveLength(1);
    expect(all[0].className).toContain("shrink-0");
  });

  it("clips every slot after the first when there are three", () => {
    const [first, ...rest] = slots(["thumbs", "chips", "license"]);
    expect(first.className).toContain("shrink-0");
    expect(rest).toHaveLength(2);
    for (const slot of rest) {
      expect(slot.className).toContain("min-w-0");
      expect(slot.className).toContain("overflow-hidden");
    }
  });

  it("draws no preview row without previews", () => {
    render(
      <EditHubCard testId="hub-card-empty" title="העסק" previews={[]} onClick={() => {}} />,
    );
    expect(screen.getByTestId("hub-card-empty").querySelector(".mt-2.overflow-hidden")).toBeNull();
  });
});
