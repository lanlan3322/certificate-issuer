-- Makes server-side registration and rate limiting available through Supabase's
-- API, eliminating the need for a direct PostgreSQL connection from Vercel.

CREATE OR REPLACE FUNCTION create_issuer_account(
  p_issuer_name TEXT,
  p_slug TEXT,
  p_organization_name TEXT,
  p_email CITEXT,
  p_display_name TEXT,
  p_auth_user_id UUID
)
RETURNS TABLE (user_id UUID, issuer_id UUID, organization_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id UUID;
BEGIN
  INSERT INTO organizations (name, slug)
  VALUES (p_organization_name, p_slug)
  RETURNING id INTO v_organization_id;

  INSERT INTO issuers (organization_id, name, slug, contact_email)
  VALUES (v_organization_id, p_issuer_name, p_slug, p_email)
  RETURNING id INTO issuer_id;

  INSERT INTO users (organization_id, email, display_name, auth_user_id, roles)
  VALUES (
    v_organization_id,
    p_email,
    p_display_name,
    p_auth_user_id,
    ARRAY['issuer-admin', 'issuer-operator']
  )
  RETURNING id INTO user_id;

  INSERT INTO subscriptions (organization_id, plan_code, status)
  VALUES (v_organization_id, 'starter', 'trialing');

  organization_id := v_organization_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_auth_rate_limit(
  p_bucket TEXT,
  p_identifier TEXT,
  p_limit INTEGER,
  p_window_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_identifier, 0));

  IF (
    SELECT count(*)
    FROM auth_rate_limits
    WHERE bucket = p_bucket
      AND identifier = p_identifier
      AND attempted_at > now() - make_interval(mins => p_window_minutes)
  ) >= p_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO auth_rate_limits (bucket, identifier) VALUES (p_bucket, p_identifier);
  RETURN TRUE;
END;
$$;
