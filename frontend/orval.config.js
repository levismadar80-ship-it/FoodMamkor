/**
 * Module:   orval.config.js
 * Purpose:  Generate Zod RESPONSE schemas from the committed OpenAPI artifact
 *           (backend/openapi.json) into frontend/lib/generated/, so the seven
 *           MEH-826/901/902/766/1412/1704/1719 field-stripping recurrences stop
 *           being a thing a human has to remember.
 * Touches:  reads ../backend/openapi.json, writes lib/generated/ ONLY.
 * Does NOT: touch lib/schemas.js or lib/api-schemas.js, and does NOT generate a
 *           client, hooks, mocks, or REQUEST-side schemas — see below. Nothing
 *           in the app imports the output yet; MEH-1748 Phase 1 is additive.
 * Related:  backend/openapi.json (the reviewable contract this derives from),
 *           scripts/checks/openapi-codegen-drift-guard.sh (the CI drift gate),
 *           docs/audits/codegen-phase1-comparison.md (why orval, and what the
 *           generated schemas do and do not cover).
 * History:  MEH-1748 Phase 1 (Sapir's 14/08 ruling — adopt, in two phases).
 *
 * WHY RESPONSE-ONLY
 *   Sapir's ruling scopes codegen to the RESPONSE side of workflow rule 19 and
 *   leaves the request side (GeoSearchSchema, CoordSchema, LocationInputSchema)
 *   hand-written on purpose. Generating params/query/body anyway would emit
 *   hundreds of schemas nothing will ever be authorised to consume — noise in
 *   every future drift diff, for zero evidence value. `generate` below is the
 *   mechanical expression of that scope.
 *
 * WHY variant: 'mini'
 *   Zod Mini + pure annotations, so unimported schemas can leave the bundle
 *   entirely. MEH-1751 refuted the spike's esbuild-proxy bundle number; `mini`
 *   is the tool-level answer to the 6,066-line concern the spike raised. The
 *   measured delta is in the comparison report — it is 0 B today because
 *   nothing imports this, which is a property of Phase 1, not of `mini`.
 *
 * WHY version: 4 (pinned, not 'auto')
 *   'auto' infers the target from whichever `zod` resolves in package.json, so
 *   a dependency bump would silently rewrite every generated file and red the
 *   drift gate for a reason unrelated to the contract. Pinning makes the output
 *   a function of the spec alone. The repo is on zod ^4.4.3 (package.json), so
 *   this pin agrees with reality today and will fail loudly rather than drift
 *   if that ever stops being true.
 */
module.exports = {
  api: {
    input: {
      // The COMMITTED artifact, never a live URL: the spec is the reviewable
      // contract and generation must be reproducible offline, in CI, with no
      // backend running. Same reasoning as producer_contract_snapshot.json.
      target: "../backend/openapi.json",
    },
    output: {
      target: "./lib/generated/api.zod.js",
      client: "zod",
      // One file, not a directory split: the whole point is that a human never
      // opens it. A split buys navigability nobody needs and multiplies the
      // paths the drift gate has to hash.
      mode: "single",
      fileExtension: ".js",
      override: {
        zod: {
          version: 4,
          variant: "mini",
          generate: {
            response: true,
            param: false,
            query: false,
            header: false,
            body: false,
          },
        },
      },
    },
  },
};
