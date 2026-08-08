CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), google_sub TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, picture TEXT, role TEXT NOT NULL CHECK (role IN ('citizen','admin')) DEFAULT 'citizen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY, reporter_id UUID REFERENCES users(id) ON DELETE SET NULL, title TEXT NOT NULL,
  description TEXT NOT NULL, image_url TEXT, status TEXT NOT NULL,
  category TEXT NOT NULL, address TEXT NOT NULL, location GEOGRAPHY(POINT,4326) NOT NULL, analysis JSONB,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb, additional_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_status_check;
ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status IN ('reported','under_review','verified','assigned','in_progress','resolved','rejected','duplicate','unable_to_verify'));
CREATE INDEX IF NOT EXISTS issues_location_gix ON issues USING GIST(location);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE TABLE IF NOT EXISTS votes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,issue_id)
);
CREATE TABLE IF NOT EXISTS verifications (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('confirm','dispute')), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,issue_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, author TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY, actor_id UUID REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  issue_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE, title TEXT NOT NULL, message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id,created_at DESC);
