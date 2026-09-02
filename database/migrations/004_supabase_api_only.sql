-- Makes server-side rate limiting available through the Supabase API,
-- eliminating the need for a direct PostgreSQL connection from Vercel.

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
