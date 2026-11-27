-- Module:   anonymize_restored_db
-- Purpose:  After a production dump is restored anywhere that is NOT
--           production (staging, a DR drill, a laptop), replace every
--           column that holds a person's details with a fake, deterministic
--           value, and delete what has no safe fake (codes, push endpoints,
--           raw WhatsApp traffic, admin credentials).
-- Touches:  UPDATE/DELETE on the restored database only. Run by
--           scripts/restore_from_backup.py right after pg_restore, inside
--           ONE transaction (psql --single-transaction, ON_ERROR_STOP).
-- Does NOT: decide which database is safe to touch — the production refusal
--           lives in restore_from_backup.py:is_production_target. Does not
--           contain BEGIN/COMMIT, so the caller owns the transaction.
-- Related:  tests/test_restore_anonymize.py (inventory guard: every PII-shaped
--           column in the models is either written here or exempted there,
--           with a reason) · backend/app/services/email.py:_is_reserved_domain
--           (why @example.com never receives mail).
-- History:  MEH-3406 (creation).
--
-- FORMAT CONTRACT (the inventory test parses this file):
--   * one statement per table, `UPDATE <table> SET` / `DELETE FROM <table>`
--     at the start of a line;
--   * every assignment on its own line, `    <column> = <expr>,`.
--
-- Every row is rewritten, including any already on @example.com: pg_restore
-- --clean replaces the whole users table with production's, where the demo
-- seed never ran, so nothing worth keeping is there. Re-seed the demo
-- accounts after a restore (docs/DEPLOYMENT.md «Staging QA auth fixtures»).
--
-- Schema lag: restore_from_backup.py drops any assignment or statement whose
-- column or table the restored schema does not have yet (a dump older than a
-- migration) and logs each one. The PII in a column that does not exist is
-- not in the dump either.
--
-- Fake phone: '+97250000' + 4 digits from md5(id). 13 characters, fits every
-- phone column (String(20)/String(30)), passes the phone validator
-- (backend/app/schemas/schemas.py:_phone_validator, <= 13 digits), and the
-- staging send guard (MEH-3402) blocks it anyway. Not unique on purpose: no
-- phone column carries a UNIQUE constraint.

-- ── People ────────────────────────────────────────────────────────────────
UPDATE users SET
    email = 'user-' || id::text || '@example.com',
    name = 'משתמש ' || left(id::text, 8),
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END,
    password_hash = NULL,
    google_id = NULL,
    apple_id = NULL,
    avatar_url = NULL,
    reset_token = NULL,
    email_verify_token = NULL;

UPDATE producers SET
    contact_name = CASE WHEN contact_name IS NULL THEN NULL ELSE 'איש קשר ' || left(id::text, 8) END,
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END,
    secondary_phone = NULL,
    secondary_phone_label = NULL,
    contact_email = CASE WHEN contact_email IS NULL THEN NULL ELSE 'producer-' || id::text || '@example.com' END,
    whatsapp_group = NULL,
    address = NULL,
    owner_invite_email = NULL,
    owner_invite_name = NULL,
    owner_invite_token_hash = NULL,
    owner_invite_code_hash = NULL,
    owner_invite_consent_note = NULL,
    consent_screenshot_url = NULL,
    admin_notes = NULL,
    payment_info = NULL,
    producer_license_number = NULL,
    rejection_reason = NULL,
    requested_changes = NULL,
    risk_reasoning = NULL,
    referral_source_other = NULL;

UPDATE producer_order_settings SET
    business_id_number = NULL;

UPDATE producer_locations SET
    address = NULL,
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END;

-- ── Things people sent us ──────────────────────────────────────────────────
UPDATE contact_messages SET
    name = 'פונה ' || left(id::text, 8),
    email = 'contact-' || id::text || '@example.com',
    message = '[הוסר בשחזור]';

UPDATE delivery_waitlist SET
    email = 'waitlist-' || id::text || '@example.com';

UPDATE newsletter_subscribers SET
    email = 'subscriber-' || id::text || '@example.com';

UPDATE registrations SET
    name = 'נרשם ' || left(id::text, 8),
    phone = '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0'),
    email = 'registration-' || id::text || '@example.com',
    cancel_token = 'anon-' || id::text;

UPDATE group_buy_commits SET
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END;

UPDATE home_products SET
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END,
    street = NULL,
    zip_code = NULL;

UPDATE home_product_whatsapp_clicks SET
    rating_token = NULL;

UPDATE outreach_leads SET
    phone = CASE WHEN phone IS NULL THEN NULL ELSE '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0') END,
    suggested_by_name = NULL,
    suggested_by_email = NULL,
    suggestion_reason = NULL,
    notes = NULL,
    prefill_token = NULL;

UPDATE product_orders SET
    customer_name = 'לקוח ' || left(id::text, 8),
    customer_phone = '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0'),
    delivery_address = NULL,
    note = NULL,
    status_token_hash = NULL;

-- MEH-3933: a weekly repeat carries the same buyer fields as its orders.
UPDATE product_order_repeats SET
    customer_name = 'לקוח ' || left(id::text, 8),
    customer_phone = '+97250000' || lpad((('x' || substr(md5(id::text), 1, 4))::bit(16)::int % 10000)::text, 4, '0'),
    delivery_address = NULL,
    note = NULL;

UPDATE experiences SET
    address = NULL;

UPDATE reports SET
    reason = NULL;

UPDATE producer_name_change_requests SET
    reason = NULL;

UPDATE rescue_reviews SET
    photo_url = NULL;

-- A hidden or flagged review was never public; a published one is.
UPDATE producer_reviews SET
    body = NULL
WHERE is_hidden IS TRUE OR ai_moderation_status = 'FLAGGED';

UPDATE product_order_events SET
    note = NULL;

UPDATE product_order_notifications SET
    last_error = NULL;

-- ── Traces: IPs, push endpoints, audit details ─────────────────────────────
UPDATE admin_audit_log SET
    ip = NULL,
    details = NULL;

UPDATE producer_contact_clicks SET
    ip_hash = NULL;

UPDATE producer_page_views SET
    viewer_ip_hash = NULL;

UPDATE favorite_alerts SET
    push_subscription = NULL;

-- ── No safe fake exists: delete ────────────────────────────────────────────
DELETE FROM inbound_messages;
DELETE FROM outbound_messages;
DELETE FROM phone_otp_tokens;
DELETE FROM user_phone_otp_tokens;
DELETE FROM product_order_phone_codes;
DELETE FROM admin_passkeys;
DELETE FROM admin_recovery_codes;
DELETE FROM rescue_no_show_tombstones;
-- MEH-3896: a restored copy must not honour a live preview/claim link.
DELETE FROM share_links;
-- MEH-3535: queued emails hold an address and the words; a restored copy
-- must also never send a production email.
DELETE FROM email_outbox;
-- MEH-3839: delivery events carry the account id and the recipient's domain.
DELETE FROM email_events;
-- MEH-3526: order staff hold an invited address and a live invite hash, and
-- an active row lets an account into another business's orders.
DELETE FROM producer_staff;
