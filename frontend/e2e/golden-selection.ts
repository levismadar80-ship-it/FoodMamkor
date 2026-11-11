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
 * `--project`. They are identified by that entry script — the two files
 * Playwright forks (runner/index.js: `WorkerHost` → worker/workerProcessEntry.js,
 * `OutOfProcessLoaderHost` → loader/loaderProcessEntry.js, as of 1.62.1) — AND
 * by the IPC channel every such fork has. IPC alone is not enough: any parent
 * that forks the CLI itself with an IPC channel (an IDE, a script using
 * child_process.fork) would otherwise get the golden project in a bare run
 * (measured: `--list` 1,687 with 17 golden). Defining the project in a worker
 * is harmless: a worker only runs the tests the main process handed it.
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

/** The scripts Playwright forks its workers and its out-of-process loader from. */
const PLAYWRIGHT_CHILD_ENTRY =
  /[\\/]playwright[\\/]lib[\\/](worker[\\/]workerProcessEntry|loader[\\/]loaderProcessEntry)\.js$/;

/**
 * Is this process one of Playwright's own children? `argv` is process.argv
 * (argv[1] is the script node runs); `hasIpc` is `typeof process.send ===
 * "function"`. Both must hold — see the header for why IPC alone is wrong.
 */
export function isPlaywrightChild(
  argv: readonly string[],
  hasIpc: boolean,
): boolean {
  return hasIpc && PLAYWRIGHT_CHILD_ENTRY.test(argv[1] ?? "");
}

/**
 * Whether the config should define the golden project in this process.
 * The config passes process.argv and `typeof process.send === "function"`.
 */
export function defineGoldenProject(
  argv: readonly string[],
  hasIpc: boolean,
): boolean {
  return isPlaywrightChild(argv, hasIpc) || goldenRequested(argv);
}
