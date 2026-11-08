# Runbook — ניקוי קבצים יתומים ב-Cloudinary (MEH-375)

> **Audience:** whoever runs the operator script (Railway container or local terminal).
> **Moved here from `docs/MANUAL_TESTING.md` on 2026-11-07 (MEH-2796).** Content unchanged.

Operator script: `backend/scripts/cleanup_cloudinary_orphans.py`

### Dry-run (read-only, safe)

From inside a Railway-deployed container (where `DATABASE_URL` resolves to the internal Postgres host):

    cd backend
    python -m scripts.cleanup_cloudinary_orphans

From a local machine (where the internal host is unreachable), override `DATABASE_URL` with the public proxy:

    DATABASE_URL="<DATABASE_PUBLIC_URL value>" python -m scripts.cleanup_cloudinary_orphans

Default behavior: lists Cloudinary assets under prefixes `mehamakor/` and `mehamakor/avatars/`, queries 8 DB image sources (`User.avatar_url`, `Producer.story_card_url`, `Product.image_url`, `HomeProduct.photo`, `Event.image_url`, `Experience.image_url`, `Producer.images[]`, `HomeProduct.images[]`), computes orphans via `secure_url` string equality, and prints a summary block to stdout.

Expected stdout output:

    ============================================================
    Cloudinary candidates (after filters): <M>
    DB-referenced URLs:                    <N>
    Orphans:                               <K>
    Orphan total bytes:                    <bytes> (<human-readable>)

    First 5 orphan public_ids:
      - mehamakor/...
      - ...
    Re-run with --apply to delete.
    ============================================================

Operational logs go to stderr (INFO/ERROR level). Capture separately with:

    python -m scripts.cleanup_cloudinary_orphans > out.log 2> err.log

### Abort conditions (do NOT proceed to --apply if any of these are true)

- Stacktrace in stderr or exit code != 0
- K (orphans) > 50% of M (Cloudinary candidates) — suggests `secure_url` format mismatch between DB-stored URLs and Cloudinary listing; investigate before deleting
- K = 0 with M > 0 and you expected orphans — filter logic may be too aggressive
- Sample public_ids do not start with `mehamakor/` — wrong prefix filter
- WARNING or ERROR lines in stderr beyond the standard INFO flow

### Apply mode (destructive)

Only after a clean dry-run with no abort conditions:

    python -m scripts.cleanup_cloudinary_orphans --apply --yes

`--apply` enables destructive mode. `--yes` skips the interactive confirmation prompt (required for cron/CI; omit for manual runs to get a "type yes to confirm" gate).

Expected stdout output:

    ============================================================
    Apply complete: deleted=<D> not_found=<NF> errors=<E>
    Status: CLEAN — exit code 0
    ============================================================

Where:
- `deleted` = number of assets successfully removed
- `not_found` = assets already gone (idempotent, not an error)
- `errors` = assets that failed to delete (Cloudinary API error)

Status values: `CLEAN` (errors=0), `PARTIAL` (errors>0 — some assets not deleted, re-run to retry).

### Verification (post-apply)

Re-run in dry-run mode immediately after `--apply`:

    python -m scripts.cleanup_cloudinary_orphans

Expected: `Orphans: 0`. If orphans remain, they were either uploaded after the `--apply` run or are in a prefix not covered by the default list.

### Options

- `--prefix PREFIX` — override default prefixes (can specify multiple times)
- `--min-age-hours N` — skip assets younger than N hours (default: 24). Prevents race with in-flight uploads.
- `--batch-size N` — Cloudinary delete batch size, max 100 (default: 100)

### Exit codes

- 0 — success (dry-run: computed cleanly; apply: CLEAN or PARTIAL with not_found only)
- 1 — error (DB connection failed, Cloudinary listing failed, or delete errors > 0)

### Known limitation

Story-card assets under `mehamakor/producers/*` are excluded from cleanup by the reserved-prefix reject list (`RESERVED_PUBLIC_ID_PREFIXES` in `cloudinary_utils.py`). When a producer is deleted, their story-card asset remains in Cloudinary as an untouchable orphan (~few KB each). Tracked for follow-up (R1: story-card orphan accumulation post-producer-delete).

