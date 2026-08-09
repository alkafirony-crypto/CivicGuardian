-- CivicGuardian trusted-resolution and notification upgrade.
-- Every statement is safe to run repeatedly during application startup.

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS resolution_proof JSONB;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS issue_follows (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, issue_id)
);

CREATE INDEX IF NOT EXISTS issue_follows_issue_idx
  ON issue_follows(issue_id);

CREATE TABLE IF NOT EXISTS resolution_feedback (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('confirmed','unresolved','review')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, issue_id)
);

CREATE INDEX IF NOT EXISTS resolution_feedback_issue_idx
  ON resolution_feedback(issue_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status_updates BOOLEAN NOT NULL DEFAULT true,
  admin_updates BOOLEAN NOT NULL DEFAULT true,
  resolution_requests BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issues_created_idx ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS issues_category_status_idx ON issues(category, status);
CREATE INDEX IF NOT EXISTS issues_search_idx ON issues USING GIN (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(address,''))
);
CREATE INDEX IF NOT EXISTS comments_issue_visible_idx ON comments(issue_id, created_at)
  WHERE is_hidden = false;
