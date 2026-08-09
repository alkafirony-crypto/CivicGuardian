-- CivicGuardian user and comment administration upgrade.
-- Statements are idempotent and preserve existing reports and users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS removed_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_removed_by_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_removed_by_fkey
      FOREIGN KEY (removed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_active_created_idx
  ON users(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS comments_visible_created_idx
  ON comments(created_at DESC)
  WHERE is_hidden = false;
