# Runbooks

Standing operational procedures: what to run, in what order, and what you expect to see. They are not tests and not session state.

| Runbook | When |
|---|---|
| [UPTIME.md](./UPTIME.md) | GitHub opened an `uptime:` issue |
| [MEDIA-RESTORE.md](./MEDIA-RESTORE.md) | Restoring media from a Cloudinary export |
| [dr-drill.md](./dr-drill.md) | Proving a backup restores (MEH-408) |
| [admin-role-recovery.md](./admin-role-recovery.md) | An admin lost their role through the producer-upgrade path (MEH-669) |
| [cloudinary-orphan-cleanup.md](./cloudinary-orphan-cleanup.md) | Cleaning up unreferenced Cloudinary assets (MEH-375) |
| [load-testing.md](./load-testing.md) | k6 baseline: before launch, and after the triggers listed inside (MEH-559) |

The release checklist lives at [../RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md).
