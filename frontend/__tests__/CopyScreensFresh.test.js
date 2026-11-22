/**
 * MEH-3672 — the screen index behind /admin/copy is built from the code.
 *
 * 1. MEH-3693: lib/copy-screens.json is not committed. It is written by the
 *    builder on `npm install` / `npm run dev` / `npm run build`
 *    (package.json postinstall / predev / prebuild), so no branch can carry a
 *    stale copy. The test checks the hooks are wired and that the builder
 *    writes the file the page imports.
 * 2. The detector itself, on inputs with a known answer (namespace call,
 *    options-object namespace, root `useTranslations()` + t("group.key"), a
 *    group that is not in he.json), and on the real tree: /map reads `map`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  build,
  OUT as BUILDER_OUT,
  groupsInSource,
  routeOf,
} from "../scripts/build-copy-screens.mjs";

const OUT = path.join(__dirname, "..", "lib", "copy-screens.json");
const GROUPS = new Set(["map", "admin", "seo", "common"]);

describe("copy-screens.json", () => {
  it("is generated, not committed: the builder writes lib/copy-screens.json on install, dev and build", () => {
    // Source-text by nature for the two config reads below (package.json and
    // .gitignore are not run by anything a test can call) — testing.md MEH-3531.
    expect(path.resolve(BUILDER_OUT)).toBe(path.resolve(OUT));
    const { scripts } = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    for (const hook of ["postinstall", "predev", "prebuild"]) {
      expect(scripts[hook], hook).toContain("scripts/build-copy-screens.mjs");
    }
    const ignore = fs.readFileSync(
      path.join(__dirname, "..", "..", ".gitignore"),
      "utf8",
    );
    expect(ignore.split("\n")).toContain("frontend/lib/copy-screens.json");
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
