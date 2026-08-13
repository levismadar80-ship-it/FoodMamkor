# MEH-1516 — CI QA screenshots: patch ready for Sapir to apply

> **The block below is for Sapir to paste in manually.** `.github/workflows/**`
> is CC-deny (`.claude/settings.json`, MEH-671). CC wrote the capture script
> (`frontend/scripts/qa-ci-screenshots.mjs`, already merged/mergeable — it's a
> plain script, not a workflow file) and this diff, but did not touch
> `.github/workflows/e2e.yml` itself.

## What this does

Adds a screenshot-capture step to `e2e.yml` that runs after the E2E suite
(reusing the `next start` server already up on `localhost:3000`), captures
the 6 core public routes at 375px and 1440px, compresses them to WebP, uploads
them as a `qa-screenshots` artifact, and extends the existing "Post QA report
comment" step to link that artifact and list what was captured — so a
reviewer looks at images in the PR comment instead of opening a phone or a
Vercel preview.

**Route selection is a fixed set, not diff-derived** — see the Phase 0 note
on the MEH-1516 card. A diff→route mapping doesn't exist anywhere in this
repo and risks silently under-capturing; the fixed set (home, `/producers`,
`/map`, the seeded demo producer detail, `/login`, `/register`) covers the
highest-traffic public surfaces every PR, cheaply.

**Never blocks the gate.** Every new step is `continue-on-error: true` and/or
gated on the prior step's outcome — this is review evidence, not a pass/fail
signal, matching the card's own acceptance criteria ("no change to pass/fail
semantics").

---

## §1 — `.github/workflows/e2e.yml`: insert after the `coverage-floor` step

Insert the three new steps below **between** the existing `E2E coverage
floor` step (ends at `pr-checks.yml:269`, the `id: coverage-floor` line) and
the existing `Post QA report comment` step (starts at `:279`) — i.e. right
after this line:

```yaml
        id: coverage-floor
```

New steps to insert:

```yaml
      # MEH-1516 — capture review screenshots so a reviewer looks at images in
      # the PR instead of opening a phone or a Vercel preview. Fixed core-route
      # set (Phase 0 decision, MEH-1516 comment thread) — never fails the job.
      - name: Capture QA screenshots (MEH-1516)
        if: >-
          always() && github.event_name == 'pull_request' &&
          steps.e2e-run.outcome != 'cancelled'
        id: qa-screenshots
        continue-on-error: true
        working-directory: frontend
        run: node scripts/qa-ci-screenshots.mjs

      - name: Compress QA screenshots (MEH-1156)
        if: always() && steps.qa-screenshots.outcome == 'success'
        continue-on-error: true
        working-directory: frontend
        run: node scripts/compress-qa-screenshots.mjs qa-artifacts/ci-screenshots/

      - name: Upload QA screenshots
        uses: actions/upload-artifact@v7
        if: always() && steps.qa-screenshots.outcome == 'success'
        with:
          name: qa-screenshots
          path: frontend/qa-artifacts/ci-screenshots/
          retention-days: 14
```

Why three separate steps rather than one: `continue-on-error` on the capture
step means a route failure (e.g. a route 500ing) doesn't cancel compression
of whatever DID get captured, and the upload step's own `if:` means a total
capture failure (script crash) skips the upload cleanly instead of uploading
an empty/partial directory silently.

---

## §2 — same file: extend the `Post QA report comment` script

Inside the existing `Post QA report comment` step's `script:` block
(`:285` onward), two changes:

**(a)** After this existing line:

```js
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
```

insert:

```js
            const screenshotsOutcome = "${{ steps.qa-screenshots.outcome }}";
            let screenshotsSection = "";
            if (screenshotsOutcome === "success") {
              const fs = require("fs");
              try {
                const manifest = JSON.parse(
                  fs.readFileSync("frontend/qa-artifacts/ci-screenshots/manifest.json", "utf8")
                );
                const okCount = manifest.filter((m) => m.ok).length;
                const routes = [...new Set(manifest.map((m) => m.file))];
                screenshotsSection = [
                  "",
                  `**QA screenshots:** ${okCount}/${manifest.length} captured (${routes.join(", ")}) — see the \`qa-screenshots\` artifact on [this run](${runUrl}).`,
                ].join("\n");
              } catch (e) {
                screenshotsSection = "\n_QA screenshots step ran but the manifest could not be read._";
              }
            } else if (screenshotsOutcome) {
              screenshotsSection = "\n_QA screenshots capture did not complete this run._";
            }
```

**(b)** In the existing `body` array construction, add `screenshotsSection`
as the last element before the closing `].join("\n");` — i.e. change:

```js
            const body = [
              marker,
              `## ${headline}`,
              "",
              `**${executed} tests executed**, ${skipped} skipped ([run](${runUrl})), commit ${context.payload.pull_request.head.sha.slice(0, 7)}.`,
              "",
              zeroCoverage
                ? "**Nothing ran.** global-setup aborted before any spec loaded — this PR has no E2E signal at all. Do not read the other checks as coverage."
                : passed
                  ? "All E2E specs green (flake gate --fail-on-flaky-tests included)."
                  : "At least one spec failed — the playwright-report artifact on the run has traces and screenshots.",
            ].join("\n");
```

to:

```js
            const body = [
              marker,
              `## ${headline}`,
              "",
              `**${executed} tests executed**, ${skipped} skipped ([run](${runUrl})), commit ${context.payload.pull_request.head.sha.slice(0, 7)}.`,
              "",
              zeroCoverage
                ? "**Nothing ran.** global-setup aborted before any spec loaded — this PR has no E2E signal at all. Do not read the other checks as coverage."
                : passed
                  ? "All E2E specs green (flake gate --fail-on-flaky-tests included)."
                  : "At least one spec failed — the playwright-report artifact on the run has traces and screenshots.",
              screenshotsSection,
            ].join("\n");
```

---

## Why `require("fs")` inside `actions/github-script`

`actions/github-script@v9` runs inside Node with `require` available in the
script sandbox (already implicitly relied on by other steps in this repo's
workflows that use the same action) — no new dependency, no new permission.

## Verification, once applied

1. Push any PR-triggering commit.
2. Confirm the three new steps appear in the run, in order, after `E2E
   coverage floor`.
3. Confirm the `qa-screenshots` artifact exists on the run with 12 files
   (6 routes × 2 viewports) plus `manifest.json`.
4. Confirm the `Post QA report comment` body includes the new
   "**QA screenshots:** N/12 captured (...)" line.
5. Paste the run URL and the comment body verbatim back onto MEH-1516.

Not verified here — this patch has not been applied or run in CI. Everything
above is prepared, not executed, per the CC-deny boundary.
