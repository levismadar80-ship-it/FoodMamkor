/**
 * Module:   contract-row
 * Purpose:  Build a test payload that satisfies a GENERATED response schema
 *           (lib/generated/api.zod.js), so a fixture states only the fields
 *           its test is about and still passes the parse the app runs.
 * Does NOT: guess values a test cares about — every required field gets a
 *           neutral filler ("x", 0, false, the first enum value, an
 *           empty list); optional and defaulted fields are left out so the
 *           schema's own default applies. Overrides are merged last.
 * Related:  lib/api-responses.js (the schemas the app parses with)
 * History:  MEH-1748 (fixtures moved to the generated contract)
 */

const FILLED_AT = "2026-01-01T00:00:00Z";

/**
 * A stable UUID from a short test name ("p1" → the same UUID every run), so a
 * test can keep thinking in short names while the payload carries real ids.
 * @param {string} name
 */
export function uuidFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${hex.padStart(12, "0")}`;
}

/** @param {any} schema */
function filler(schema) {
  const def = schema._zod.def;
  switch (def.type) {
    case "string":
      if (def.format === "uuid") return uuidFor("filler");
      if (def.format === "datetime") return FILLED_AT;
      if (def.format === "date") return FILLED_AT.slice(0, 10);
      if (def.format === "email") return "filler@example.com";
      if (def.format === "url") return "https://example.com/";
      return "x";
    case "number":
    case "int":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return Object.values(def.entries)[0];
    case "literal":
      return def.values[0];
    case "array":
      return [];
    case "object":
      return contractRow(schema);
    case "union": {
      const nullable = def.options.find((o) => o._zod.def.type === "null");
      return nullable ? null : filler(def.options[0]);
    }
    case "record":
      return {};
    default:
      return null;
  }
}

/**
 * @param {any} objectSchema a generated `zod.object(...)`
 * @param {Record<string, unknown>} [overrides]
 */
export function contractRow(objectSchema, overrides = {}) {
  const out = {};
  for (const [key, field] of Object.entries(objectSchema._zod.def.shape)) {
    const type = field._zod.def.type;
    if (type === "optional" || type === "default") continue;
    out[key] = filler(field);
  }
  return { ...out, ...overrides };
}

/**
 * One GET /users/me/favorites row: a contract-valid FavoriteOut whose nested
 * producer is a contract-valid ProducerListOut. `name` is the short test name
 * the producer id is derived from.
 * @param {string} name
 * @param {Record<string, unknown>} [producer] overrides on the nested producer
 * @param {any} favoriteSchema GetFavoritesUsersMeFavoritesGetResponseItem
 */
export function favoriteRow(favoriteSchema, name, producer = {}) {
  const id = uuidFor(name);
  const nested = favoriteSchema._zod.def.shape.producer;
  return contractRow(favoriteSchema, {
    producer_id: id,
    producer: contractRow(nested, { id, name, ...producer }),
  });
}

/**
 * The object schema of a field, through any optional / default / nullable
 * wrapper — for building a nested row (an experience's `host`).
 * @param {any} objectSchema
 * @param {string} key
 * @returns {any}
 */
export function fieldObject(objectSchema, key) {
  let s = objectSchema._zod.def.shape[key];
  for (;;) {
    const def = s._zod.def;
    if (def.type === "object") return s;
    if (def.type === "optional" || def.type === "default" || def.type === "nullable") s = def.innerType;
    else if (def.type === "union") s = def.options.find((o) => o._zod.def.type !== "null");
    else throw new Error(`fieldObject: ${key} is a ${def.type}, not an object`);
  }
}
