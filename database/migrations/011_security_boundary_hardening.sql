-- User role and tenant fields are authorization data, not self-service profile fields.
DROP POLICY IF EXISTS users_self_update ON public.users;
REVOKE UPDATE ON TABLE public.users FROM PUBLIC, anon, authenticated;

-- Rate limiting is invoked with the server-side service-role client only.
REVOKE ALL ON FUNCTION public.enforce_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_auth_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
