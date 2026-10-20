CREATE FUNCTION prevent_used_issuer_profile_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.did IS DISTINCT FROM OLD.did
      OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
      OR NEW.key_reference IS DISTINCT FROM OLD.key_reference)
      AND (
        EXISTS (
          SELECT 1 FROM credentials
          WHERE issuer_profile_id = OLD.id
        )
        OR EXISTS (
          SELECT 1 FROM bitstring_status_allocations
          WHERE issuer_profile_id = OLD.id
        )
      ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Issuer profile identity is immutable after first use.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issuer_profiles_identity_lock
  BEFORE UPDATE ON issuer_profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_used_issuer_profile_identity_change();
