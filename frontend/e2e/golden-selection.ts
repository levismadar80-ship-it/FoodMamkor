/**
 * Module:   golden-selection
 * Purpose:  Decide whether the Playwright `golden` project exists in this
 *           process. It exists ONLY when the command line names it
 *           (`--project=golden`), so the default suite — CI runs a bare
 *           `npx playwright test` — never lists or runs it.
 * Does NOT: read any env var. The card for this project (MEH-2897) allows no
 *           new one, and the decision is about what was asked on the command
 *           line, which argv already says.
 * Related:  playwright.config.ts (the only caller besides global-setup.ts) ·
 *           e2e/golden/ (the specs) · __tests__/GoldenProjectSelection.test.js
 * History:  MEH-2897 (creation).
 *
 * ─── Why not just `testIgnore` on the other projects ───────────────────────
 *
 * The other projects do ignore e2e/golden/ (config). That keeps golden specs
 * out of `desktop` / `mobile`, but a project that EXISTS still runs when no
 * `--project` is given: Playwright runs every project by default. So the
 * golden project is added to the config only when it was asked for.
 *
 * ─── Why Playwright's child processes always get it ────────────────────────
 *
 * Workers (and the out-of-process loader) re-load this config and look their
 * project up by name ("Project … not found in the worker process" otherwise).
 * Their argv is the worker entry script, not the CLI's, so they cannot see
 * `--project`. They are forked with an IPC channel, which the CLI process
 * started from a shell or CI never has, so `typeof process.send === "function"`
 * identifies them. Defining the project in a worker is harmless: a worker only
 * runs the tests the main process handed it.
 */

export const GOLDEN_PROJECT = "golden";

/** Matches a file under e2e/golden/, on either path separator. */
export const GOLDEN_DIR = /[\\/]e2e[\\/]golden[\\/]/;

/**
 * The project names `--project` selects in a Playwright CLI argv. Both
 * spellings, and the variadic form (`--project a b`) the CLI accepts: values
 * run until the next flag.
 */
export function selectedProjects(argv: readonly string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--project=")) {
      names.push(arg.slice("--project=".length));
    } else if (arg === "--project") {
      for (let j = i + 1; j < argv.length && !argv[j].startsWith("-"); j += 1) {
        names.push(argv[j]);
      }
    }
  }
  return names;
}

/** Playwright's project filter: case-insensitive, `*` as a wildcard. */
function filterMatches(filter: string, name: string): boolean {
  const pattern = filter
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`, "i").test(name);
}

/** Did this command line ask for the golden project? */
export function goldenRequested(argv: readonly string[]): boolean {
  return selectedProjects(argv).some((filter) =>
    filterMatches(filter, GOLDEN_PROJECT),
  );
}

/**
 * Did it ask for the golden project ONLY? global-setup then skips the demo-role
 * logins: none of the golden specs reads them, and each one spends a permit of
 * the 5/minute per-IP login limit the personas need (anchor plan §E2).
 *
 * Exact names only: a wildcard such as `--project='*'` may select other
 * projects too, so it does NOT count as golden-only and the demo roles are
 * provisioned as before (the safe direction).
 */
export function goldenOnly(argv: readonly string[]): boolean {
  const filters = selectedProjects(argv);
  return (
    filters.length > 0 &&
    filters.every((filter) => filter.toLowerCase() === GOLDEN_PROJECT)
  );
}

/**
 * Whether the config should define the golden project in this process.
 * `isPlaywrightChild` is `typeof process.send === "function"` at the call site.
 */
export function defineGoldenProject(
  argv: readonly string[],
  isPlaywrightChild: boolean,
): boolean {
  return isPlaywrightChild || goldenRequested(argv);
}
