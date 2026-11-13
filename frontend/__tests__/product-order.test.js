// MEH-3055 — the one ordering rule, shared by the public page and the dashboard.
import { describe, it, expect } from "vitest";
import { chipGroups, hasUngrouped, orderProducts } from "@/lib/product-order";

const p = (id, extra = {}) => ({ id, image_url: null, position: null, group_id: null, ...extra });
const ids = (list) => list.map((x) => x.id);

describe("orderProducts", () => {
  it("empty in, empty out", () => {
    expect(orderProducts([])).toEqual([]);
    expect(orderProducts(undefined)).toEqual([]);
  });

  it("no owner order: photos first, API order inside each half", () => {
    const list = [p("a"), p("b", { image_url: "x" }), p("c"), p("d", { image_url: "y" })];
    expect(ids(orderProducts(list))).toEqual(["b", "d", "a", "c"]);
  });

  it("owner order wins over photos; never-placed products go last in API order", () => {
    const list = [
      p("a", { image_url: "x" }),
      p("b", { position: 1 }),
      p("c"),
      p("d", { position: 0 }),
    ];
    expect(ids(orderProducts(list))).toEqual(["d", "b", "a", "c"]);
  });

  it("groups: laid out in the groups' order, ungrouped and stale-group products last", () => {
    const groups = [{ id: "g2", name: "עוגות" }, { id: "g1", name: "לחמים" }];
    const list = [
      p("a", { position: 0, group_id: "g1" }),
      p("b", { position: 1 }),
      p("c", { position: 2, group_id: "g2" }),
      p("d", { position: 3, group_id: "gone" }),
      p("e", { position: 4, group_id: "g1" }),
    ];
    expect(ids(orderProducts(list, groups))).toEqual(["c", "a", "e", "b", "d"]);
  });
});

describe("chipGroups / hasUngrouped", () => {
  const groups = [{ id: "g1", name: "לחמים" }, { id: "g2", name: "עוגות" }, { id: "g3", name: "ריקה" }];

  it("only groups that hold a product", () => {
    const list = [p("a", { group_id: "g2" }), p("b", { group_id: "g1" })];
    expect(chipGroups(list, groups).map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(hasUngrouped(list, groups)).toBe(false);
  });

  it("a product in no group, or in a deleted one, counts as ungrouped", () => {
    expect(hasUngrouped([p("a")], groups)).toBe(true);
    expect(hasUngrouped([p("a", { group_id: "gone" })], groups)).toBe(true);
  });
});
