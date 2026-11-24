// @ts-check
/**
 * Module:   zod-csp
 * Purpose:  Turn off Zod's eval probe in the browser, so the CSP stops reporting
 *           «Blocked unsafe eval()» on every page that parses an API response.
 * Does NOT: change the CSP header (frontend/next.config.js) or any schema.
 * Related:  node_modules/zod/v4/core/util.js:218 (allowsEval) · instrumentation-client.js (imports this first)
 * History:  MEH-3733 (creation); found in MEH-3706.
 *
 * Zod 4 calls `Function("")` once, inside try/catch, to learn whether it may
 * compile object parsers. The throw is swallowed, but a CSP without
 * 'unsafe-eval' still reports the attempt — Zod's own comment at util.js:219
 * says so, and `jitless` is the switch it documents for this. Without the
 * compiled fast path Zod parses the same way, a little slower; our payloads
 * are lists of tens of rows.
 *
 * It must run before the first parse. instrumentation-client.js runs before
 * any app code and before hydration (Next 16, instrumentation-client.md) and
 * imports this module first. `z.config` writes `globalThis.__zod_globalConfig`,
 * so the setting holds for every copy of Zod in the bundle.
 */
import { z } from "zod";

z.config({ jitless: true });
