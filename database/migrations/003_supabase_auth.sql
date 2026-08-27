-- 003_supabase_auth.sql
-- Migrates issuer authentication from the custom scrypt/session implementation
-- to Supabase Auth (GoTrue). Identity now lives in auth.users; this schema keeps
-- the tenancy model (organizations -> issuers -> users) and links to it.

-- 1. Link application users to Supabase Auth identities ----------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE
  REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users (auth_user_id);

-- Passwords and sessions are owned by GoTrue from here on. The columns are kept
-- nullable rather than dropped so an existing deployment can verify the cutover
-- before running 004_drop_legacy_auth.sql.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Resolve the caller's tenant from the JWT --------------------------------

-- SECURITY DEFINER so RLS policies can call it without recursing into users.
CREATE OR REPLACE FUNCTION current_app_user()
RETURNS TABLE (user_id UUID, organization_id UUID, issuer_id UUID, roles TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.organization_id, i.id, u.roles
  FROM users u
  LEFT JOIN issuers i ON i.organization_id = u.organization_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION has_role(target_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT target_role = ANY(roles) FROM users WHERE auth_user_id = auth.uid() LIMIT 1),
    FALSE
  );
$$;

-- 3. Row level security ------------------------------------------------------
-- The server uses the service-role key for writes that span tenants (issuer
-- registration), so these policies are defence in depth for any anon/authed
-- client that talks to PostgREST directly.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_own ON organizations;
CREATE POLICY organizations_own ON organizations
  FOR SELECT USING (id = current_organization_id());

DROP POLICY IF EXISTS users_own_org ON users;
CREATE POLICY users_own_org ON users
  FOR SELECT USING (organization_id = current_organization_id());

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS issuers_own_org ON issuers;
CREATE POLICY issuers_own_org ON issuers
  FOR SELECT USING (organization_id = current_organization_id());

DROP POLICY IF EXISTS issuers_admin_write ON issuers;
CREATE POLICY issuers_admin_write ON issuers
  FOR UPDATE USING (organization_id = current_organization_id() AND has_role('issuer-admin'));

DROP POLICY IF EXISTS templates_own_issuer ON templates;
CREATE POLICY templates_own_issuer ON templates
  FOR ALL USING (
    issuer_id IN (SELECT id FROM issuers WHERE organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS credentials_own_issuer ON credentials;
CREATE POLICY credentials_own_issuer ON credentials
  FOR ALL USING (
    issuer_id IN (SELECT id FROM issuers WHERE organization_id = current_organization_id())
  );

DROP POLICY IF EXISTS revocations_own_issuer ON revocations;
CREATE POLICY revocations_own_issuer ON revocations
  FOR ALL USING (
    issuer_id IN (SELECT id FROM issuers WHERE organization_id = current_organization_id())
  );

-- Verification is a public act; the log is readable only by the credential owner.
DROP POLICY IF EXISTS verification_logs_own_issuer ON verification_logs;
CREATE POLICY verification_logs_own_issuer ON verification_logs
  FOR SELECT USING (
    credential_id IN (
      SELECT c.id FROM credentials c
      JOIN issuers i ON i.id = c.issuer_id
      WHERE i.organization_id = current_organization_id()
    )
  );

DROP POLICY IF EXISTS agent_sessions_own ON agent_sessions;
CREATE POLICY agent_sessions_own ON agent_sessions
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS agent_messages_own ON agent_messages;
CREATE POLICY agent_messages_own ON agent_messages
  FOR ALL USING (
    session_id IN (
      SELECT s.id FROM agent_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS audit_logs_own_org ON audit_logs;
CREATE POLICY audit_logs_own_org ON audit_logs
  FOR SELECT USING (organization_id = current_organization_id());

DROP POLICY IF EXISTS subscriptions_own_org ON subscriptions;
CREATE POLICY subscriptions_own_org ON subscriptions
  FOR SELECT USING (organization_id = current_organization_id());

DROP POLICY IF EXISTS api_keys_own_issuer ON api_keys;
CREATE POLICY api_keys_own_issuer ON api_keys
  FOR ALL USING (
    issuer_id IN (SELECT id FROM issuers WHERE organization_id = current_organization_id())
  );

-- 4. Rate limiting for auth endpoints ----------------------------------------

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  identifier TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup
  ON auth_rate_limits (bucket, identifier, attempted_at DESC);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
