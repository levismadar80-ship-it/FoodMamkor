# Runbook — שחזור הרשאת admin שנדרסה (MEH-669)

> **Audience:** Sapir, at her own terminal (psql). Not runnable from a Claude Code session.
> **Moved here from `docs/MANUAL_TESTING.md` on 2026-11-07 (MEH-2796).** Content unchanged.

**Affected account at time of writing:** `<staging-admin-email>` (Sapir's staging admin).

Recovery is a data fix, not a schema change — does NOT require Alembic.

```sql
-- 1) READ-ONLY inspect first. Capture the producer_id → call it $PID.
SELECT id, email, role, producer_id, is_producer
FROM users
WHERE email = '<staging-admin-email>';

-- 2) Restore admin access (single UPDATE — no cascade).
--    This step alone is sufficient to unlock /admin.
UPDATE users
SET role = 'admin',
    producer_id = NULL,
    is_producer = false
WHERE email = '<staging-admin-email>';

-- 3) (Optional) Delete the orphan producer row.
--    CASCADE will clean ProducerCategory, DeliveryArea, ProducerReview,
--    ProducerPageView, ProducerWhatsAppClick, etc.
--    (all FK'd to producers.id with ondelete=CASCADE).
DELETE FROM producers WHERE id = '$PID';
```

**Run order matters:** `users.producer_id → producers.id` has no `ondelete=` (default NO ACTION). Running step 3 before step 2 raises a FK violation. Run step 2 first, always.

**Production deny-list note:** `.claude/hooks/check-bash-safety.sh` blocks any Bash command containing `$DATABASE_URL_PRODUCTION`. Run psql from your own Git Bash terminal, not from a Claude Code session (per `.claude/rules/security.md` § production safety).

### Audit query for other affected admins

By design pre-fix admins now have `role='producer'`, which makes them indistinguishable from real producers. The narrowest filter that catches the bug class:

```sql
-- Producers awaiting review whose linked user was created BEFORE the
-- producer row (= upgrade path, not new signup). The status here was
-- 'pending_whatsapp' until it was removed in MEH-2124; a row from that era
-- would now read 'draft' or 'pending'.
SELECT u.id, u.email, u.role, u.created_at AS user_created,
       p.id AS producer_id, p.created_at AS producer_created
FROM users u
JOIN producers p ON u.producer_id = p.id
WHERE p.status IN ('draft', 'pending')
  AND u.created_at < p.created_at;
```

Cross-check the returned emails against the original admin allowlist (whoever Smadar promoted manually). Any hit = an admin that lost their role via this bug and needs the recovery SQL above.
