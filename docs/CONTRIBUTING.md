# Contributing to Mehamakor

תיעוד workflow conventions לעבודה על מהמקור.

## PR Description Convention

Every PR must include `Closes MEH-XX` in the description body.
This triggers Linear's auto-close on merge.

Example PR body:

  ## Summary
  Brief description of what changed.

  ## Verification
  - [ ] build green
  - [ ] preview URL: https://...

  Closes MEH-XX

Without this line, the Linear issue must be closed manually.

### Why this matters

Linear-GitHub integration auto-closes the issue when:
1. Branch name contains `meh-XX` (e.g., `feature/meh-455-...`), AND
2. PR description contains `Closes MEH-XX`

Both rails reduce drift. The PR description is the more reliable trigger.

## Branch Naming

See CLAUDE.md "Branch strategy" section.
Convention: `feature/meh-XX-slug` off staging.
