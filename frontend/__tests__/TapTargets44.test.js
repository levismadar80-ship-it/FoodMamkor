/**
 * MEH-3195 — touch targets of at least 44px (WCAG 2.5.5 / IS 5568 practice).
 *
 * jsdom has no layout, so this reads the class lists that set the size. Each
 * case names the file and the control; if the sizing class goes, it goes red.
 * DISCRIMINATION: on the staging code before MEH-3195 every case fails — the
 * chips had only `py-2.5` (42px), the heart only `w-[34px] h-[34px]`, and the
 * «טעות בפרטים» button only `underline`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");

const CHIP = /inline-flex items-center gap-1\.5 whitespace-nowrap px-4[^"`]*py-2\.5 rounded-md text-sm font-medium border/g;

describe("filter chips are at least 44px tall", () => {
  it.each([
    ["components/ChipScrollRow.jsx"],
    ["components/PromotedServiceChips.jsx"],
    ["components/ProducersClient.jsx"],
    ["app/[locale]/home/HomeProducersGrid.jsx"],
    ["app/[locale]/map/components/FilterChipsBar.jsx"],
  ])("%s", (file) => {
    const chips = read(file).match(CHIP) ?? [];
    expect(chips.length, "chip class list not found").toBeGreaterThan(0);
    for (const c of chips) expect(c).toContain("min-h-11");
  });

  it("the «יום משלוח» chip in a row is 42px + the wrapper's border", () => {
    expect(read("components/DeliveryDayRow.jsx")).toMatch(
      /const chipPadY = inRow \? "py-2\.5 min-h-\[42px\]"/,
    );
  });
});

describe("small controls get a 44px hit area", () => {
  it("the card heart keeps its 34px circle and adds a 5px invisible ring", () => {
    const src = read("components/ProducerCard.jsx");
    const heart = src.slice(src.indexOf('data-testid="card-heart"'));
    const cls = heart.match(/className="([^"]+)"/)[1];
    expect(cls).toContain("w-[34px] h-[34px]");
    expect(cls).toContain("before:absolute");
    expect(cls).toContain("before:-inset-[5px]");
  });

  it("«טעות בפרטים» is a 44px-tall button that does not move the line", () => {
    const src = read("app/[locale]/producer/[id]/components/ProducerSections.jsx");
    const at = src.indexOf("onClick={() => setReportOpen(true)}");
    const cls = src.slice(at, at + 400).match(/className="([^"]+)"/)[1];
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("-my-3.5");
  });
});
