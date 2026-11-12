/**
 * MEH-2993: every public entity page is in lib/entity-registry.js, and the
 * registry tells the truth about which shared parts each page imports.
 *
 * Fails when:
 *   1. a dynamic public route under app/[locale] is neither an entity route
 *      nor in NON_ENTITY_ROUTES (a new entity page nobody registered);
 *   2. an entity lists a part twice, or leaves one out of uses ∪ missing ∪ na;
 *   3. a part in `uses` is not imported by any of the entity's files
 *      (the page re-implemented it or dropped it);
 *   4. a part in `missing` IS imported (stale gap — move it to `uses`), so the
 *      missing list can only shrink.
 *
 * Imports are read from the files' source text (`from "<module>"`), the same
 * static reading DashboardPlacementGuard does. A comment that quotes an
 * import line would count — accepted, the risk is a false green on a page
 * that writes `from "@/components/X"` in prose.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ENTITIES, PARTS, NON_ENTITY_ROUTES } from "@/lib/entity-registry";

const ROOT = path.resolve(__dirname, "..");
const LOCALE_DIR = path.join(ROOT, "app", "[locale]");
const SKIP_TOP = new Set(["admin", "dev"]);

function walk(abs, out = []) {
  const st = fs.statSync(abs);
  if (st.isFile()) {
    if (/\.(js|jsx)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const name of fs.readdirSync(abs)) walk(path.join(abs, name), out);
  return out;
}

/** Source text of every file an entity declares (dirs scanned recursively). */
function entitySources(entity) {
  return entity.files.flatMap((rel) => walk(path.join(ROOT, rel))).map((f) => fs.readFileSync(f, "utf8"));
}

/** Exported for the self-test: does this source import one of the modules? */
export function importsAny(source, modules) {
  return modules.some((m) => source.includes(`from "${m}"`));
}

/** Route dirs (relative to frontend/) whose own segment is dynamic and that hold a page. */
function dynamicPublicRoutes() {
  const found = [];
  const visit = (abs, rel, depth) => {
    for (const name of fs.readdirSync(abs)) {
      const childAbs = path.join(abs, name);
      if (!fs.statSync(childAbs).isDirectory()) continue;
      if (depth === 0 && SKIP_TOP.has(name)) continue;
      if (name === "dashboard") continue; // owner tools, guarded by DashboardPlacementGuard
      const childRel = `${rel}/${name}`;
      const hasPage = fs.readdirSync(childAbs).some((f) => /^page\.(js|jsx)$/.test(f));
      if (name.startsWith("[") && hasPage) found.push(childRel);
      visit(childAbs, childRel, depth + 1);
    }
  };
  visit(LOCALE_DIR, "app/[locale]", 0);
  return found;
}

describe("EntityRegistryGuard self-test (the instrument, before the claims)", () => {
  it("finds a real import in a real repo file (anchor: event page uses EntityCover)", () => {
    const src = fs.readFileSync(path.join(LOCALE_DIR, "events", "[id]", "EventDetailClient.jsx"), "utf8");
    expect(importsAny(src, ["@/components/EntityCover"])).toBe(true);
  });
  it("does not find an import that is absent, nor a prefix of another module", () => {
    expect(importsAny('import X from "@/components/ShareButtonX";', ["@/components/ShareButton"])).toBe(false);
    expect(importsAny("const a = 1;", ["@/components/ShareButton"])).toBe(false);
  });
  it("the route scan sees the known entity routes (control: a dead scan would list none)", () => {
    const routes = dynamicPublicRoutes();
    expect(routes).toContain("app/[locale]/events/[id]");
    expect(routes).toContain("app/[locale]/organizers/[slug]");
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });
});

describe("EntityRegistryGuard", () => {
  const registered = new Set([...ENTITIES.flatMap((e) => e.routes), ...Object.keys(NON_ENTITY_ROUTES)]);

  it("every dynamic public route is an entity route or a listed non-entity route", () => {
    const unregistered = dynamicPublicRoutes().filter((r) => !registered.has(r));
    expect(unregistered, "register it in lib/entity-registry.js (ENTITIES or NON_ENTITY_ROUTES)").toEqual([]);
  });

  it("every registered route and file exists", () => {
    const gone = [...registered, ...ENTITIES.flatMap((e) => e.files)].filter((r) => !fs.existsSync(path.join(ROOT, r)));
    expect(gone).toEqual([]);
  });

  for (const entity of ENTITIES) {
    describe(entity.key, () => {
      const listed = [...entity.uses, ...Object.keys(entity.missing), ...Object.keys(entity.na)];

      it("lists every part exactly once across uses / missing / na", () => {
        expect([...listed].sort()).toEqual(Object.keys(PARTS).sort());
      });

      it("every missing / na part carries a reason", () => {
        const blank = Object.entries({ ...entity.missing, ...entity.na }).filter(([, why]) => !String(why || "").trim());
        expect(blank).toEqual([]);
      });

      const sources = entitySources(entity);

      for (const part of entity.uses) {
        it(`uses ${part}: some file imports ${PARTS[part].join(" | ")}`, () => {
          expect(sources.some((s) => importsAny(s, PARTS[part]))).toBe(true);
        });
      }

      for (const part of Object.keys(entity.missing)) {
        it(`missing ${part} is still missing (else move it to uses)`, () => {
          expect(sources.some((s) => importsAny(s, PARTS[part]))).toBe(false);
        });
      }
    });
  }
});
