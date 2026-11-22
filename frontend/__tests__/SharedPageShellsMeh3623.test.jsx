// MEH-3623: the shared shells that replaced copies in the legal pages and the
// business guides. Behaviour only: render / call, then read what came out.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LegalPage from "@/components/legal/LegalPage";
import { buildGuideBlocks } from "@/lib/guide-blocks";

describe("buildGuideBlocks", () => {
  const t = (k) => `T(${k})`;

  it("passes a rule through, translates text, and expands a counted list", () => {
    const out = buildGuideBlocks(
      [
        { type: "p", key: "intro" },
        { type: "hr" },
        { type: "ul", key: "tips", count: 2 },
      ],
      t,
    );
    expect(out).toEqual([
      { type: "p", text: "T(body.intro)" },
      { type: "hr" },
      { type: "ul", items: ["T(body.tips.i0)", "T(body.tips.i1)"] },
    ]);
  });

  it("returns an empty list for an empty outline", () => {
    expect(buildGuideBlocks([], t)).toEqual([]);
  });
});

describe("LegalPage", () => {
  const sections = [
    { id: "a", title: "כותרת א", body: "גוף א" },
    { id: "b", title: "כותרת ב", body: "גוף ב" },
  ];

  it("renders the heading, every date line and one h2 per section", () => {
    render(
      <LegalPage testId="legal-x" heading="מדיניות" dateLines={["שורה 1", "שורה 2"]} sections={sections} />,
    );
    expect(screen.getByTestId("legal-x")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("מדיניות");
    expect(screen.getByText("שורה 1")).toBeTruthy();
    expect(screen.getByText("שורה 2")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "כותרת א",
      "כותרת ב",
    ]);
    expect(screen.getByText("גוף ב")).toBeTruthy();
  });

  it("renders no section card when there are no sections", () => {
    render(<LegalPage testId="legal-y" heading="ריק" dateLines={["d"]} sections={[]} />);
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});
