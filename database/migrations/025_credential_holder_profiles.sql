BEGIN;

-- Holder identities are independent of organization-scoped application users.
CREATE TABLE public.credential_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  country TEXT,
  profile_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credential_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credential_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.credential_profiles TO authenticated;
GRANT INSERT (user_id, full_name, email, phone, country, profile_photo_url)
  ON public.credential_profiles TO authenticated;
GRANT UPDATE (full_name, email, phone, country, profile_photo_url)
  ON public.credential_profiles TO authenticated;
GRANT ALL ON public.credential_profiles TO service_role;

CREATE POLICY credential_profiles_select_own ON public.credential_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY credential_profiles_insert_own ON public.credential_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY credential_profiles_update_own ON public.credential_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.wallet_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  credential_id UUID REFERENCES public.credentials(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('profile.updated', 'credential.viewed', 'credential.downloaded', 'credential.shared', 'credential.qr_generated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_audit_events_user_created_idx ON public.wallet_audit_events (auth_user_id, created_at DESC);
ALTER TABLE public.wallet_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_audit_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wallet_audit_events TO service_role;

CREATE FUNCTION public.credential_profiles_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.credential_profiles_touch_updated_at() FROM PUBLIC;
CREATE TRIGGER credential_profiles_updated_at BEFORE UPDATE ON public.credential_profiles
  FOR EACH ROW EXECUTE FUNCTION public.credential_profiles_touch_updated_at();

CREATE FUNCTION public.credential_profiles_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() = NEW.user_id THEN
    INSERT INTO public.wallet_audit_events (auth_user_id, action)
    VALUES (NEW.user_id, 'profile.updated');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.credential_profiles_audit() FROM PUBLIC;
CREATE TRIGGER credential_profiles_audit_event AFTER INSERT OR UPDATE ON public.credential_profiles
  FOR EACH ROW EXECUTE FUNCTION public.credential_profiles_audit();

COMMIT;
