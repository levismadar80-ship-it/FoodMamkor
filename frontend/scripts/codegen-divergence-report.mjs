#!/usr/bin/env node
/**
 * Module:   codegen-divergence-report.mjs
 * Purpose:  MEH-1748 Phase 2 — "generate + diff report only, zero cutover".
 *           Compares the orval-generated response schemas
 *           (lib/generated/api.zod.js) against the hand-written ones
 *           (lib/schemas.js) for the producer list + detail contracts, and
 *           classifies every structural difference as DECLARED (present in
 *           schemas.js's DECLARED_DIVERGENCES registry, with a reason) or
 *           UNDECLARED (a difference nobody wrote down).
 * Touches:  reads lib/generated/api.zod.js + lib/schemas.js. Writes ONLY the
 *           report at docs/audits/meh-1748-phase2-diff-report.md, and only
 *           when run with --write; otherwise prints to stdout.
 * Does NOT: swap any call site, generate a client, or touch the drift guard
 *           (scripts/checks/openapi-codegen-drift-guard.sh) — that guard keeps
 *           the generated file honest against openapi.json; this script
 *           compares the generated file against the DIFFERENT, hand-written
 *           one. Two different questions, not two owners of the same fact.
 * Related:  docs/audits/codegen-phase1-comparison.md (the narrative Phase 1
 *           comparison this mechanizes and re-runs), frontend/orval.config.js,
 *           frontend/__tests__/backend-contract-parity.test.js (the
 *           `nestedObjectShape` unwrap logic, reused below verbatim rather
 *           than re-invented — same zod v4 internals, `.def.type` /
 *           `.def.innerType` / `.def.element`).
 * History:  MEH-1748 Phase 2 (Sapir's 14/08 ruling; scope confirmed in the
 *           03/09 orchestrator ruling — generate + diff report, zero cutover
 *           before launch).
 *
 * ── WHY THIS IS A SCRIPT, NOT A VITEST GUARD ────────────────────────────────
 * The ruling authorizes a report, not a gate. Nothing consumes
 * lib/generated/api.zod.js yet (Phase 1 is additive), so there is no call
 * site whose behaviour a red test would be protecting. Making this a CI-blocking
 * test would fail on every future intentional divergence until someone remembers
 * to update DECLARED_DIVERGENCES first — exactly backwards from how the
 * registry is meant to work (write the reason, THEN the field diverges cleanly).
 *
 * ── WHAT "STRUCTURAL DIFFERENCE" MEANS HERE ─────────────────────────────────
 * Presence (a field only one side declares) is one axis; TYPE SHAPE for a
 * field both sides declare is the other, and it is the one Phase 1 found by
 * hand (id: string|number vs uuid; order_window: structured vs looseObject).
 * Comparing full Zod validation semantics is out of scope — this compares
 * `.def.type` (and, for unions, its option types) one level deep, which is
 * exactly the depth the two known Phase 1 findings live at.
 */

import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const WRITE = process.argv.includes("--write");
const REPORT_PATH = path.join(
  ROOT,
  "..",
  "docs",
  "audits",
  "meh-1748-phase2-diff-report.md",
);

const generated = await import(
  pathToFileURL(path.join(ROOT, "lib/generated/api.zod.js")).href
);
const { DECLARED_DIVERGENCES, ProducerListSchema, ProducerDetailSchema } =
  await import(pathToFileURL(path.join(ROOT, "lib/schemas.js")).href);

const PAIRS = [
  {
    label: "ProducerList",
    generated: generated.ListProducersProducersGetResponseItem,
    hand: ProducerListSchema,
  },
  {
    label: "ProducerDetail",
    generated: generated.GetProducerBySlugProducersBySlugSlugGetResponse,
    hand: ProducerDetailSchema,
  },
];

/** Coarse type descriptor, unwrapping wrappers that carry no comparable
 * information of their own:
 *   - optional/nullable/default: unwrap to the inner type. Both sides
 *     independently mark a field nullable this way OR by emitting
 *     `union([X, null])` (orval's codegen does the latter for every
 *     Optional[...] field) — those two encodings are RUNTIME-EQUIVALENT, and
 *     comparing them literally would flag "nullable" itself as a divergence
 *     on nearly every field, burying the two real findings under noise. So a
 *     2-option union with exactly one `null` option collapses the same way.
 * A union that is NOT a nullability wrapper (e.g. `string | number`) is kept
 * as a real union — that is exactly the `id` field's declared divergence. */
function typeDescriptor(schema) {
  const def = schema?.def;
  if (!def) return "unknown";
  if (def.type === "optional" || def.type === "nullable" || def.type === "default") {
    return typeDescriptor(def.innerType);
  }
  if (def.type === "union") {
    const options = def.options ?? [];
    const nonNull = options.filter((o) => o.def?.type !== "null");
    if (options.length === 2 && nonNull.length === 1) {
      return typeDescriptor(nonNull[0]);
    }
    return `union(${options.map(typeDescriptor).join("|")})`;
  }
  if (def.type === "string" && def.format) return `string<${def.format}>`;
  if (def.type === "object") return `object(${Object.keys(schema.shape ?? {}).length} keys)`;
  if (def.type === "array") return `array<${typeDescriptor(def.element)}>`;
  if (def.type === "record") return `record<${typeDescriptor(def.valueType)}>`;
  return def.type ?? "unknown";
}

function diffPair({ label, generated: g, hand: h }) {
  const gKeys = new Set(Object.keys(g.shape ?? {}));
  const hKeys = new Set(Object.keys(h.shape ?? {}));
  const onlyGenerated = [...gKeys].filter((k) => !hKeys.has(k)).sort();
  const onlyHand = [...hKeys].filter((k) => !gKeys.has(k)).sort();
  const shared = [...gKeys].filter((k) => hKeys.has(k)).sort();

  const structural = [];
  for (const key of shared) {
    const gType = typeDescriptor(g.shape[key]);
    const hType = typeDescriptor(h.shape[key]);
    if (gType !== hType) {
      structural.push({ key, generated: gType, hand: hType });
    }
  }

  const classify = (key) =>
    DECLARED_DIVERGENCES[key]
      ? { status: "declared", ...DECLARED_DIVERGENCES[key] }
      : { status: "undeclared" };

  return {
    label,
    generatedFieldCount: gKeys.size,
    handFieldCount: hKeys.size,
    onlyGenerated: onlyGenerated.map((key) => ({ key, ...classify(key) })),
    onlyHand: onlyHand.map((key) => ({ key, ...classify(key) })),
    structural: structural.map((row) => ({ ...row, ...classify(row.key) })),
  };
}

const results = PAIRS.map(diffPair);

function renderTable(rows, cols) {
  if (rows.length === 0) return "_none_\n";
  const header = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "--").join(" | ")} |`;
  const body = rows
    .map(
      (r) =>
        `| ${cols.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`,
    )
    .join("\n");
  return [header, sep, body].join("\n") + "\n";
}

const undeclaredTotal = results.reduce(
  (sum, r) =>
    sum +
    r.onlyGenerated.filter((x) => x.status === "undeclared").length +
    r.onlyHand.filter((x) => x.status === "undeclared").length +
    r.structural.filter((x) => x.status === "undeclared").length,
  0,
);

const lines = [];
lines.push("# MEH-1748 Phase 2 — codegen vs hand-written schema diff report");
lines.push("");
lines.push(
  "**Generated by `frontend/scripts/codegen-divergence-report.mjs --write`. " +
    "Do not hand-edit — re-run the script instead, so this stays a measurement " +
    "and not a narrative that goes stale the way the Phase 1 doc's own numbers " +
    "already have (69/85 measured there vs the counts below, re-measured now).**",
);
lines.push("");
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push(
  `**Undeclared structural differences: ${undeclaredTotal}.** Zero is not the ` +
    "target by construction — it means either every real divergence has a " +
    "reason on record in `DECLARED_DIVERGENCES` (lib/schemas.js), or there are " +
    "none. A non-zero count is not a failure either; it is this report's whole " +
    "job, which is to make an undocumented drift visible instead of silent.",
);
lines.push("");

for (const r of results) {
  lines.push(`## ${r.label}`);
  lines.push("");
  lines.push(
    `Generated: **${r.generatedFieldCount} fields**. Hand-written: **${r.handFieldCount} fields**.`,
  );
  lines.push("");
  lines.push("### Fields only in the generated schema (backend serves, hand schema silently strips)");
  lines.push("");
  lines.push(renderTable(r.onlyGenerated.map((x) => ({ ...x, note: x.reason ?? "—" })), ["key", "status", "note"]));
  lines.push("### Fields only in the hand-written schema (declared, backend does not serve — or removed)");
  lines.push("");
  lines.push(renderTable(r.onlyHand.map((x) => ({ ...x, note: x.reason ?? "—" })), ["key", "status", "note"]));
  lines.push("### Structural divergence on a field both sides declare");
  lines.push("");
  lines.push(
    renderTable(
      r.structural.map((x) => ({ ...x, note: x.reason ?? "—" })),
      ["key", "generated", "hand", "status", "note"],
    ),
  );
}

lines.push("---");
lines.push("");
lines.push(
  "Field-presence divergence (`onlyGenerated` / `onlyHand`) is a DIFFERENT " +
    "question from MEH-1891's `backend-contract-parity.test.js`, which compares " +
    "the hand schema against the live Pydantic snapshot directly and is the live " +
    "CI gate for that fact. This report exists because the generated schema and " +
    "the Pydantic snapshot are two different derivations of the same backend " +
    "contract — agreement between THIS report's `onlyGenerated` list and that " +
    "gate's `KNOWN_UNDECLARED` baseline is expected, not coincidental, and a " +
    "divergence between the two would mean the generator and the snapshot " +
    "disagree about what the backend serves, which is worth its own investigation.",
);

const report = lines.join("\n") + "\n";

if (WRITE) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Undeclared structural differences: ${undeclaredTotal}`);
} else {
  process.stdout.write(report);
}
