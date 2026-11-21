/**
 * MEH-3672 — the screen index behind /admin/copy is built from the code.
 *
 * 1. The committed lib/copy-screens.json equals a fresh build, so a
 *    page that starts reading a new group cannot leave the admin screen wrong.
 * 2. The detector itself, on inputs with a known answer (namespace call,
 *    options-object namespace, root `useTranslations()` + t("group.key"), a
 *    group that is not in he.json), and on the real tree: /map reads `map`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  build,
  groupsInSource,
  routeOf,
} from "../scripts/build-copy-screens.mjs";

const OUT = path.join(__dirname, "..", "lib", "copy-screens.json");
const GROUPS = new Set(["map", "admin", "seo", "common"]);

describe("copy-screens.json", () => {
  it("is up to date with the code (run `node scripts/build-copy-screens.mjs`)", () => {
    const committed = JSON.parse(fs.readFileSync(OUT, "utf8"));
    expect(committed).toEqual(build());
  });

  it("names /map as a screen that reads the map group (real tree)", () => {
    const idx = build();
    expect(idx.screens).toContain("/map");
    expect(idx.groups.map).toContain("/map");
    expect(idx.groups.admin).toContain("/admin/copy");
  });

  it("follows a dynamic import(): the chat group reaches /about only through ChatWidgetLazy", () => {
    // components/ChatWidgetLazy.jsx loads ChatWidget with
    // dynamic(() => import("@/components/ChatWidget")); no page imports it
    // statically, so without the import() form chat had no screen.
    const idx = build();
    expect(idx.groups.chat).toContain("/about");
  });
});

describe("groupsInSource", () => {
  it('reads useTranslations("ns.sub") as its top group', () => {
    expect([
      ...groupsInSource('const t = useTranslations("admin.copy");', GROUPS),
    ]).toEqual(["admin"]);
  });
  it("reads getTranslations({ locale, namespace })", () => {
    expect([
      ...groupsInSource(
        'await getTranslations({ locale, namespace: "seo.site" })',
        GROUPS,
      ),
    ]).toEqual(["seo"]);
  });
  it('reads t("group.key") only when the file calls useTranslations() with no namespace', () => {
    expect([
      ...groupsInSource('useTranslations(); t("common.save")', GROUPS),
    ]).toEqual(["common"]);
    expect([
      ...groupsInSource('useTranslations("map"); t("common.save")', GROUPS),
    ]).toEqual(["map"]);
  });
  it("ignores a namespace that is not a group of he.json", () => {
    expect([...groupsInSource('useTranslations("nope.x")', GROUPS)]).toEqual(
      [],
    );
  });
});

describe("routeOf", () => {
  it("drops route groups and keeps dynamic segments", () => {
    const app = path.join(__dirname, "..", "app", "[locale]");
    expect(routeOf(path.join(app, "(whats-on)", "events", "page.js"))).toBe(
      "/events",
    );
    expect(routeOf(path.join(app, "producer", "[id]", "page.js"))).toBe(
      "/producer/[id]",
    );
    expect(routeOf(path.join(app, "page.js"))).toBe("/");
  });
});
