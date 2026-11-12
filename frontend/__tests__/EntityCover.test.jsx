// MEH-2992: the shared entity masthead. Cells: photo / no photo × actions /
// no actions × date tile / none, plus the tone classes (literal, so Tailwind
// keeps them).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EntityCover from "@/components/EntityCover";

const Icon = () => <svg data-testid="cat-icon" />;
const tile = { month: "נוב", day: 14, weekday: "שישי" };

describe("EntityCover", () => {
  it("photo: renders the cover with the title as its name, no band", () => {
    render(<EntityCover imageUrl="https://res.cloudinary.com/x/image/upload/a.jpg" alt="שוק" Icon={Icon} testIdPrefix="event" />);
    const cover = screen.getByTestId("event-cover");
    expect(cover.getAttribute("aria-label")).toBe("שוק");
    expect(cover.style.backgroundImage).toContain("a.jpg");
    expect(screen.queryByTestId("event-cover-band")).toBeNull();
  });

  it("no photo: the band carries the category icon in the tone colour", () => {
    render(<EntityCover alt="סדנה" tone="accent" Icon={Icon} testIdPrefix="experience" />);
    const band = screen.getByTestId("experience-cover-band");
    expect(band.className).toMatch(/\bbg-accent\b/);
    expect(screen.getByTestId("cat-icon")).toBeTruthy();
    expect(screen.queryByTestId("experience-cover")).toBeNull();
  });

  it("actions sit in the inline-END corner; absent → no empty corner", () => {
    const { rerender } = render(
      <EntityCover alt="x" Icon={Icon} actions={<button>save</button>} testIdPrefix="event" />,
    );
    expect(screen.getByTestId("event-cover-actions").className).toMatch(/\bend-3\b/);
    rerender(<EntityCover alt="x" Icon={Icon} testIdPrefix="event" />);
    expect(screen.queryByTestId("event-cover-actions")).toBeNull();
  });

  it("date tile renders its three parts; absent → no tile", () => {
    const { rerender } = render(<EntityCover alt="x" Icon={Icon} dateTile={tile} testIdPrefix="event" />);
    const t = screen.getByTestId("event-date-tile");
    expect(t.textContent).toBe("נוב14שישי");
    expect(t.firstChild.className).toMatch(/\bbg-primary\b/);
    rerender(<EntityCover alt="x" Icon={Icon} testIdPrefix="event" />);
    expect(screen.queryByTestId("event-date-tile")).toBeNull();
  });
});
