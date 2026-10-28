import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-2506: the mobile distance origin lives in the NearMePill (Sapir 28/10),
// not in its own row above the map. Three states: no origin (bare circle, as
// before), an origin (label + ✕ beside the circle), a city being located
// (status, no ✕).
vi.mock("next-intl", async () => {
  const he = (await import("../messages/he.json")).default;
  const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), he);
  return { useTranslations: () => (key) => lookup(key) ?? key };
});

import NearMePill from "@/app/[locale]/map/components/NearMePill";

describe("NearMePill origin (MEH-2506)", () => {
  it("no origin: only the 44px circle, bordered on its own", () => {
    render(<NearMePill onClick={() => {}} />);
    const btn = screen.getByTestId("map-near-me-pill");
    expect(btn).toHaveAccessibleName("הצגת בתי עסק קרובים למיקום שלי");
    expect(btn.className).toContain("border-border");
    expect(screen.queryByTestId("sort-origin")).toBeNull();
    expect(screen.queryByTestId("clear-user-location")).toBeNull();
  });

  it("an origin: label + ✕ inside the pill; ✕ clears, the circle still locates", () => {
    const onClick = vi.fn();
    const onClear = vi.fn();
    render(<NearMePill onClick={onClick} originLabel="מרחק מהמיקום שלכם" onClearOrigin={onClear} />);
    const wrap = screen.getByTestId("map-near-me");
    expect(wrap).toContainElement(screen.getByTestId("sort-origin-label"));
    expect(screen.getByTestId("sort-origin-label")).toHaveTextContent("מרחק מהמיקום שלכם");
    const clear = screen.getByTestId("clear-user-location");
    expect(clear).toHaveAccessibleName("נקו את המיקום השמור");
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("map-near-me-pill"));
    expect(onClick).toHaveBeenCalledTimes(1);
    // one pill: the wrapper carries the border, the circle does not
    expect(wrap.className).toContain("border-border");
    expect(screen.getByTestId("map-near-me-pill").className).not.toContain("border-border");
  });

  it("a city being located: the status, and no ✕", () => {
    render(<NearMePill onClick={() => {}} originPending onClearOrigin={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("מאתרים את העיר...");
    expect(screen.queryByTestId("clear-user-location")).toBeNull();
  });
});
