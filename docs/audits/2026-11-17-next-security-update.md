# Next.js security update — pending (17/11/2026)

**Status: waiting for Sapir.** This file holds the draft PR for the fix; the
fix itself could not be made from the session.

## What

`npm audit --omit=dev` (frontend, 17/11) reports a **critical** advisory in
`next` 16.0.0–16.4.4: remote code execution in `next/og` `ImageResponse`.
Staging is on `^16.3.3`. The fix is `next` and `eslint-config-next` at
**16.4.6**.

## Why it is not done here

- Dependabot #4657 carries it, but inside a group of 19 updates, and its E2E
  run 44093985130 failed (`unexpected=4, flaky=1`). It is a draft with a
  comment.
- A next-only change was attempted twice in the session (an `npm install`, then
  a version-range edit of `frontend/package.json`); the session's safety layer
  refused both. Not retried a third way.

## How to apply

```
cd frontend
npm install next@16.4.6 eslint-config-next@16.4.6
npm run build && npx vitest run
```

Commit `package.json` and `package-lock.json` on a `feature/` branch, add the
`run-e2e` label, merge when both gates and E2E are green. Then re-run
`npm audit --omit=dev` and delete this file in the same PR.
