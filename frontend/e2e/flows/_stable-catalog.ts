/**
 * Module:   _stable-catalog
 * Purpose:  Drop the businesses that another test run created and will delete,
 *           so a spec that picks "some business from the catalog" opens one
 *           that will still exist a second later.
 * Does NOT: fetch anything; each spec keeps its own GET /api/producers.
 * Related:  flows/19-publish-approve-visible.spec.ts:46 (E2E-MEH216-<ts>),
 *           flows/22-register-personas.spec.ts:101 (E2E-MEH1274-<ts>),
 *           flows/40-rejected-resubmit-loop.spec.ts:29 (E2E-MEH2210-<ts>),
 *           flows/46-owner-invite.spec.ts:100 (e2e-<base36 ts>-<rand>, approved
 *           through POST /admin/producers).
 * History:  MEH-3845. The WebKit core job always runs against the one Railway
 *           staging backend, even on a PR (e2e.yml «WebKit core»), next to
 *           other runs whose register-and-approve specs create a public
 *           business and delete it in `finally`. producer-detail took such a
 *           business from the catalog, and by the time the page asked for it
 *           the API answered 404 («לא מצאנו את בית העסק הזה — עדיין»), so the
 *           root count stayed 0 for 20 s (run 45903855450, job 140196376930).
 */

/** The tags the self-cleaning specs write into the business name. */
export const RUN_FIXTURE_NAME = /\bE2E-MEH\d+-\d+\b|\be2e-[0-9a-z]{6,}-[0-9a-z]{3,}\b/;

/** The catalog without other runs' temporary businesses. */
export function stableCatalog<T extends object>(list: T[]): T[] {
  return list.filter((p) => !RUN_FIXTURE_NAME.test(String((p as { name?: unknown }).name ?? "")));
}
