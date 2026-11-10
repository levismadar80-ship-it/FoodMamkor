import { describe, it, expect } from "vitest";
import {
  selectedProjects,
  goldenRequested,
  goldenOnly,
  defineGoldenProject,
  isPlaywrightChild,
  GOLDEN_DIR,
} from "../e2e/golden-selection";

// MEH-2897 — the Playwright `golden` project exists only when the command line
// asks for it. CI runs a bare `npx playwright test`, and Playwright runs EVERY
// defined project by default, so a golden project that always existed would run
// against CI's localhost stack and log in personas that are not seeded there.
//
// The argv shapes below are the ones the Playwright CLI is invoked with (the
// first two entries are node and the CLI script, as in process.argv).

const CLI = [
  "/usr/bin/node",
  "/repo/frontend/node_modules/playwright/cli.js",
  "test",
];
const argv = (...rest) => [...CLI, ...rest];

describe("selectedProjects", () => {
  it("reads both --project spellings and the variadic form", () => {
    expect(selectedProjects(argv("--project=golden"))).toEqual(["golden"]);
    expect(selectedProjects(argv("--project", "golden"))).toEqual(["golden"]);
    expect(
      selectedProjects(argv("--project", "desktop", "mobile", "--list")),
    ).toEqual(["desktop", "mobile"]);
    expect(
      selectedProjects(argv("--project=desktop", "--project=golden", "--list")),
    ).toEqual(["desktop", "golden"]);
  });

  it("is empty for the default suite", () => {
    expect(selectedProjects(argv())).toEqual([]);
    expect(selectedProjects(argv("--fail-on-flaky-tests"))).toEqual([]);
    expect(selectedProjects(argv("e2e/visual", "--update-snapshots"))).toEqual(
      [],
    );
  });
});

describe("defineGoldenProject — the default suite never gets the golden project", () => {
  // The exact command lines the workflows run (e2e.yml, vrt-update.yml).
  it.each([
    [argv("--fail-on-flaky-tests")],
    [argv("--list")],
    [argv("--project=webkit-iphone13")],
    [argv("--project=desktop")],
    [argv("e2e/visual", "--update-snapshots")],
  ])("CLI %j → no golden project", (cmd) => {
    expect(defineGoldenProject(cmd, false)).toBe(false);
  });

  it.each([
    [argv("--project=golden")],
    [argv("--project", "golden", "--list")],
    [argv("--project=GOLDEN")], // Playwright's project filter ignores case
    [argv("--project=gold*")], // and accepts a wildcard
    [argv("--project=desktop", "--project=golden")],
  ])("CLI %j → golden project defined", (cmd) => {
    expect(defineGoldenProject(cmd, false)).toBe(true);
    expect(goldenRequested(cmd)).toBe(true);
  });

  it("a Playwright child process always defines it (workers look projects up by name)", () => {
    const workerArgv = [
      "/usr/bin/node",
      "/repo/node_modules/playwright/lib/worker/workerProcessEntry.js",
    ];
    expect(defineGoldenProject(workerArgv, true)).toBe(true);
    expect(defineGoldenProject(workerArgv, false)).toBe(false);
  });
});

// The predicate the config calls with process.argv and `typeof process.send`.
// IPC alone is not a Playwright child: a parent that forks the CLI with an IPC
// channel (an IDE, a wrapper script) must still get the default suite —
// measured before this predicate existed: `--list` 1,687, 17 of them golden.
describe("isPlaywrightChild — what the config's call decides", () => {
  const WORKER =
    "/repo/frontend/node_modules/playwright/lib/worker/workerProcessEntry.js";
  const LOADER =
    "/repo/frontend/node_modules/playwright/lib/loader/loaderProcessEntry.js";

  it.each([
    ["the CLI started from a shell", argv(), false],
    ["the CLI forked WITH an IPC channel", argv(), true],
    ["the CLI forked with IPC and --list", argv("--list"), true],
  ])("%s → not a Playwright child", (_label, cmd, hasIpc) => {
    expect(isPlaywrightChild(cmd, hasIpc)).toBe(false);
    expect(defineGoldenProject(cmd, hasIpc)).toBe(false);
  });

  it.each([
    ["worker", WORKER],
    ["out-of-process loader", LOADER],
    [
      "worker (Windows path)",
      String.raw`C:\repo\node_modules\playwright\lib\worker\workerProcessEntry.js`,
    ],
  ])("Playwright's %s entry script with IPC → a child", (_label, entry) => {
    expect(isPlaywrightChild(["/usr/bin/node", entry], true)).toBe(true);
  });

  it("an entry script without the IPC channel is not a child", () => {
    expect(isPlaywrightChild(["/usr/bin/node", WORKER], false)).toBe(false);
  });
});

describe("goldenOnly — when global-setup may skip the demo-role logins", () => {
  it("only for an exact, golden-only selection", () => {
    expect(goldenOnly(argv("--project=golden"))).toBe(true);
    expect(goldenOnly(argv("--project", "golden", "--list"))).toBe(true);
  });

  it("never for the default suite, a mixed selection or a wildcard", () => {
    expect(goldenOnly(argv())).toBe(false);
    expect(goldenOnly(argv("--project=desktop", "--project=golden"))).toBe(
      false,
    );
    expect(goldenOnly(argv("--project=*"))).toBe(false);
    expect(goldenOnly(argv("--project=gold*"))).toBe(false);
  });
});

describe("GOLDEN_DIR — what the other projects ignore", () => {
  it("matches the golden specs on either separator, and nothing else", () => {
    expect(
      GOLDEN_DIR.test("/repo/frontend/e2e/golden/01-g1-products.spec.ts"),
    ).toBe(true);
    expect(
      GOLDEN_DIR.test(
        String.raw`C:\repo\frontend\e2e\golden\07-a1-admin.spec.ts`,
      ),
    ).toBe(true);
    expect(
      GOLDEN_DIR.test("/repo/frontend/e2e/flows/25-role-reachability.spec.ts"),
    ).toBe(false);
    expect(GOLDEN_DIR.test("/repo/frontend/e2e/visual/parity.spec.ts")).toBe(
      false,
    );
  });
});
