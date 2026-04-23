-- MEH: Email verification columns
-- Run once against the Railway production DB after deploying the code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMP;
CREATE INDEX IF NOT EXISTS ix_users_email_verify_token ON users (email_verify_token);
-- Mark all pre-existing users as verified to avoid breaking existing accounts
UPDATE users SET email_verified = true WHERE email_verified = false;
