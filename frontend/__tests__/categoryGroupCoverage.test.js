// MEH-2783 — every canonical category has exactly one /map category group.
// Before: 4 groups covered 7 of the 18 canonical categories, so honey, oils,
// eggs, soaps… had no chip. Shown red against the 4-group CATEGORY_CHIPS.
//
// The canonical list is read from the REAL backend table
// (backend/app/services/category_slug.py NAME_TO_SLUG), never a copy.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_CHIPS, resolveCategoryIds, withResolvedIcons } from "@/lib/map-chips";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../backend/app/services/category_slug.py"),
  "utf8",
);
const block = SRC.slice(SRC.indexOf("NAME_TO_SLUG = {"), SRC.indexOf("}", SRC.indexOf("NAME_TO_SLUG = {")));
const CANON = [...block.matchAll(/"([^"]+)":\s*"([a-z_]+)"/g)].map((m) => ({ name: m[1], slug: m[2] }));
const DB = CANON.map((c, i) => ({ id: i + 1, ...c }));
const groups = CATEGORY_CHIPS.filter((c) => c.matches);

describe("MEH-2783 category groups cover the taxonomy", () => {
  it("control: the parser read the real table", () => {
    expect(CANON.length).toBeGreaterThanOrEqual(18);
    expect(CANON).toContainEqual({ name: "דבש", slug: "honey" });
  });

  it.each(CANON.map((c) => [c.name, c.slug]))("«%s» (%s) lands in exactly one group", (name) => {
    const id = DB.find((c) => c.name === name).id;
    const hits = groups.filter((g) => resolveCategoryIds(g, DB).includes(id)).map((g) => g.key);
    expect(hits).toHaveLength(1);
  });

  it("every group resolves to a real glyph once DB categories load", () => {
    for (const g of withResolvedIcons(groups, DB)) {
      expect(CATEGORY_ICONS[g.iconName], g.key).toBeTruthy();
    }
  });

  it("no DB row for an iconSlug → chip stays text-only", () => {
    const [pantry] = withResolvedIcons(groups.filter((g) => g.key === "pantry"), []);
    expect(pantry.iconName).toBeUndefined();
  });
});
