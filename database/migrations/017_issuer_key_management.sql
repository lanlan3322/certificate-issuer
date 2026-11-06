BEGIN;

CREATE TABLE public.issuer_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id UUID NOT NULL REFERENCES public.issuers(id) ON DELETE RESTRICT,
  public_key TEXT NOT NULL CHECK (public_key LIKE '-----BEGIN PUBLIC KEY-----%'),
  public_key_multibase TEXT NOT NULL CHECK (public_key_multibase LIKE 'z%'),
  encrypted_private_key TEXT NOT NULL CHECK (coalesce(
    encrypted_private_key::jsonb->>'v' = '1'
    AND length(encrypted_private_key::jsonb->>'iv') = 16
    AND length(encrypted_private_key::jsonb->>'tag') = 24
    AND length(encrypted_private_key::jsonb->>'data') > 0,false)),
  encryption_key_id TEXT NOT NULL CHECK (encryption_key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  fingerprint TEXT NOT NULL CHECK (fingerprint LIKE 'SHA256:%'),
  algorithm TEXT NOT NULL DEFAULT 'P-256' CHECK (algorithm = 'P-256'),
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','retired')),
  controller TEXT,
  verification_method TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  export_expires_at TIMESTAMPTZ,
  export_claimed_at TIMESTAMPTZ,
  UNIQUE (issuer_id,key_version),
  CHECK (status <> 'active' OR (controller IS NOT NULL AND verification_method IS NOT NULL
    AND controller LIKE 'did:web:%' AND verification_method LIKE controller || '#%'
    AND length(verification_method) > length(controller)+1)),
  CHECK (export_expires_at IS NULL OR (key_version = 1 AND created_by IS NOT NULL
    AND export_expires_at <= created_at + interval '10 minutes'))
);
CREATE UNIQUE INDEX issuer_keys_one_active ON public.issuer_keys(issuer_id) WHERE status = 'active';
CREATE UNIQUE INDEX issuer_keys_one_pending ON public.issuer_keys(issuer_id) WHERE status = 'pending';
ALTER TABLE public.issuer_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issuer_keys FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.issuer_keys TO service_role;
ALTER TABLE public.credentials ADD COLUMN signing_key_id UUID REFERENCES public.issuer_keys(id) ON DELETE RESTRICT;

CREATE FUNCTION public.phase3_credential_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE signer issuer_keys;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id THEN RAISE EXCEPTION 'Credential signing key is immutable'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.signing_key_id IS NOT NULL THEN
    SELECT * INTO signer FROM issuer_keys WHERE id=NEW.signing_key_id AND issuer_id=NEW.issuer_id
      AND status IN ('active','retired') AND controller=NEW.issuer_did AND verification_method=NEW.verification_method;
    IF signer.id IS NULL THEN RAISE EXCEPTION 'Credential signing key ownership or identity mismatch'; END IF;
    NEW.issuer_snapshot := NEW.issuer_snapshot || jsonb_build_object(
      'keyId',signer.id,'keyVersion',signer.key_version,'keyFingerprint',signer.fingerprint,
      'verificationMethod',signer.verification_method);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase3_credential_key BEFORE INSERT OR UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.phase3_credential_key();

CREATE FUNCTION public.phase3_actor_can_manage(p_actor UUID,p_issuer UUID DEFAULT NULL,p_org UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_actor AND (
    u.roles && ARRAY['platform_admin','platform-admin'] OR EXISTS (
      SELECT 1 FROM organization_members m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = u.id AND m.role = 'organization_admin' AND u.organization_id = o.id
        AND o.status = 'active' AND o.soft_deleted_at IS NULL
        AND o.id = coalesce(p_org,(SELECT organization_id FROM issuers WHERE id = p_issuer))
    )));
$$;

CREATE FUNCTION public.phase3_key_audit(p_actor UUID,p_issuer UUID,p_key UUID,p_action TEXT,p_ip TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata)
  SELECT organization_id,id,p_actor,p_action,'issuer_key',p_key,jsonb_strip_nulls(jsonb_build_object(
    'ip',p_ip,'keyVersion',(SELECT key_version FROM issuer_keys WHERE id=p_key)))
  FROM issuers WHERE id = p_issuer;
$$;

CREATE FUNCTION public.phase3_save_key(p_issuer UUID,p_key JSONB,p_actor UUID,p_ip TEXT,
  p_import BOOLEAN DEFAULT false,p_export BOOLEAN DEFAULT true)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_version INTEGER; key_id UUID; owner issuers;
BEGIN
  SELECT * INTO owner FROM issuers WHERE id = p_issuer FOR UPDATE;
  IF owner.id IS NULL OR NOT phase3_actor_can_manage(p_actor,p_issuer) THEN RAISE EXCEPTION 'Issuer key management denied'; END IF;
  SELECT coalesce(max(key_version),0)+1 INTO next_version FROM issuer_keys WHERE issuer_id = p_issuer;
  IF p_import AND (next_version <> 1 OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_actor AND roles && ARRAY['platform_admin','platform-admin'])) THEN
    RAISE EXCEPTION 'Legacy import requires platform administration and no existing keys';
  END IF;
  IF (p_key->>'keyVersion')::integer IS DISTINCT FROM next_version THEN RAISE EXCEPTION 'Issuer key version conflict'; END IF;
  IF p_import AND (p_key->>'controller' IS NULL OR p_key->>'verificationMethod' IS NULL) THEN
    RAISE EXCEPTION 'Imported signer requires an existing binding';
  END IF;
  IF NOT p_import AND next_version > 1 AND (NOT owner.active OR owner.status <> 'active') THEN RAISE EXCEPTION 'Active issuer required'; END IF;
  INSERT INTO issuer_keys (issuer_id,public_key,public_key_multibase,encrypted_private_key,
    encryption_key_id,fingerprint,key_version,status,controller,verification_method,created_by,export_expires_at)
  VALUES (p_issuer,p_key->>'publicKey',p_key->>'publicKeyMultibase',p_key->>'encryptedPrivateKey',
    p_key->>'encryptionKeyId',p_key->>'fingerprint',next_version,
    CASE WHEN p_import THEN 'active' ELSE 'pending' END,
    CASE WHEN p_import THEN p_key->>'controller' END,
    CASE WHEN p_import THEN p_key->>'verificationMethod' END,p_actor,
    CASE WHEN next_version = 1 AND NOT p_import AND p_export THEN now()+interval '10 minutes' END)
  RETURNING id INTO key_id;
  PERFORM phase3_key_audit(p_actor,p_issuer,key_id,
    CASE WHEN p_import THEN 'key.imported' ELSE 'key.generated' END,p_ip);
  IF next_version = 1 AND owner.status <> 'deleted' THEN
    UPDATE issuers SET key_fingerprint=p_key->>'fingerprint' WHERE id=p_issuer;
  END IF;
  RETURN key_id;
END;
$$;

CREATE FUNCTION public.phase3_create_issuer(p_input JSONB,p_key JSONB,p_actor UUID,p_ip TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner issuers; org UUID := (p_input->>'organizationId')::uuid;
BEGIN
  IF NOT phase3_actor_can_manage(p_actor,NULL,org) THEN RAISE EXCEPTION 'Issuer creation denied'; END IF;
  IF p_input->>'status' = 'deleted' AND NOT EXISTS (
    SELECT 1 FROM users WHERE id=p_actor AND roles && ARRAY['platform_admin','platform-admin']) THEN
    RAISE EXCEPTION 'Only platform administrators may delete issuers';
  END IF;
  PERFORM set_config('app.phase3_creator',p_actor::text,true);
  INSERT INTO issuers (id,organization_id,name,display_name,slug,contact_email,description,website,logo_url,status,did_uri,verification_method)
  VALUES ((p_input->>'id')::uuid,org,p_input->>'name',coalesce(nullif(p_input->>'displayName',''),p_input->>'name'),
    p_input->>'slug',p_input->>'contactEmail',coalesce(p_input->>'description',''),
    nullif(p_input->>'website',''),nullif(p_input->>'logoUrl',''),coalesce(p_input->>'status','active'),
    nullif(p_input->>'didUri',''),nullif(p_input->>'verificationMethod',''))
  RETURNING * INTO owner;
  PERFORM phase3_save_key(owner.id,p_key,p_actor,p_ip);
  PERFORM phase3_key_audit(p_actor,owner.id,owner.id,'issuer.created',p_ip);
  SELECT * INTO owner FROM issuers WHERE id=owner.id;
  RETURN to_jsonb(owner);
END;
$$;

CREATE FUNCTION public.phase3_issuer_creator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor UUID := nullif(current_setting('app.phase3_creator',true),'')::uuid;
BEGIN
  IF actor IS NOT NULL AND phase3_actor_can_manage(actor,NULL,NEW.organization_id) THEN NEW.created_by := actor; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase3_issuer_creator BEFORE INSERT ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase3_issuer_creator();

CREATE FUNCTION public.phase3_prepare_invitation(p_input JSONB,p_key JSONB,p_role TEXT,p_actor UUID,p_ip TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner issuers; invited users; org UUID := (p_input->>'organizationId')::uuid;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('issuer-admin','issuer-operator','organization_admin','issuer','viewer') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;
  IF NOT phase3_actor_can_manage(p_actor,NULL,org) THEN
    RAISE EXCEPTION 'Issuer invitation denied';
  END IF;
  SELECT * INTO owner FROM issuers WHERE organization_id = org
    AND slug = p_input->>'slug' FOR UPDATE;
  SELECT * INTO invited FROM users WHERE email = (p_input->>'contactEmail')::citext FOR UPDATE;
  IF owner.id IS NOT NULL OR invited.id IS NOT NULL THEN
    IF owner.id IS NULL OR invited.id IS NULL OR invited.auth_user_id IS NOT NULL
      OR invited.issuer_id IS DISTINCT FROM owner.id OR owner.name IS DISTINCT FROM p_input->>'name'
      OR owner.contact_email IS DISTINCT FROM (p_input->>'contactEmail')::citext
      OR owner.did_uri IS DISTINCT FROM nullif(p_input->>'didUri','')
      OR NOT EXISTS (SELECT 1 FROM issuer_keys WHERE issuer_id=owner.id)
      OR NOT EXISTS (SELECT 1 FROM organization_members WHERE user_id=invited.id AND organization_id=org
        AND role=CASE p_role WHEN 'issuer-admin' THEN 'organization_admin' WHEN 'issuer-operator' THEN 'issuer' ELSE p_role END) THEN
      RAISE EXCEPTION 'Invitation reservation conflicts with an existing issuer or account';
    END IF;
  ELSE
    PERFORM phase3_create_issuer(p_input,p_key,p_actor,p_ip);
    SELECT * INTO owner FROM issuers WHERE id=(p_input->>'id')::uuid;
    INSERT INTO users (organization_id,issuer_id,email,display_name,roles)
    VALUES (org,owner.id,p_input->>'contactEmail',p_input->>'name',ARRAY[p_role]) RETURNING * INTO invited;
    INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id,metadata)
    SELECT org,p_actor,'organization.member.added','organization_member',id,
      jsonb_build_object('userId',invited.id,'role',role)
    FROM organization_members WHERE organization_id=org AND user_id=invited.id;
  END IF;
  RETURN jsonb_build_object('issuer',to_jsonb(owner),'user_id',invited.id);
END;
$$;

CREATE FUNCTION public.phase3_claim_export(p_issuer UUID,p_actor UUID,p_ip TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE key_id UUID;
BEGIN
  IF NOT phase3_actor_can_manage(p_actor,p_issuer) THEN RAISE EXCEPTION 'Issuer key management denied'; END IF;
  UPDATE issuer_keys SET export_claimed_at = now()
  WHERE issuer_id = p_issuer AND key_version = 1 AND created_by = p_actor
    AND export_claimed_at IS NULL AND export_expires_at > now() AND status <> 'retired'
  RETURNING id INTO key_id;
  IF key_id IS NULL THEN RAISE EXCEPTION 'Initial key download is unavailable'; END IF;
  PERFORM phase3_key_audit(p_actor,p_issuer,key_id,'key.download.claimed',p_ip);
  RETURN key_id;
END;
$$;

CREATE FUNCTION public.phase3_activate_key(p_issuer UUID,p_key UUID,p_actor UUID,p_did TEXT,p_method TEXT,p_ip TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate issuer_keys;
BEGIN
  PERFORM 1 FROM issuers WHERE id=p_issuer AND status='active' AND active FOR UPDATE;
  IF NOT FOUND OR NOT phase3_actor_can_manage(p_actor,p_issuer) THEN RAISE EXCEPTION 'Issuer key management denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_did));
  SELECT * INTO candidate FROM issuer_keys WHERE id=p_key AND issuer_id=p_issuer AND status='pending' FOR UPDATE;
  IF candidate.id IS NULL OR p_did IS NULL OR p_method IS NULL OR p_did NOT LIKE 'did:web:%'
    OR p_method NOT LIKE p_did || '#%' OR length(p_method)<=length(p_did)+1 THEN
    RAISE EXCEPTION 'Pending key and existing verification method required';
  END IF;
  IF EXISTS (SELECT 1 FROM issuer_keys WHERE issuer_id=p_issuer AND verification_method=p_method) THEN
    RAISE EXCEPTION 'Historical verification methods cannot be reused with new keys';
  END IF;
  IF EXISTS (SELECT 1 FROM issuer_keys WHERE issuer_id=p_issuer AND status='active' AND controller<>p_did) THEN
    RAISE EXCEPTION 'Rotation must preserve the historical status-list controller';
  END IF;
  IF EXISTS (SELECT 1 FROM issuer_keys own JOIN issuer_keys sibling ON sibling.controller=own.controller
    AND sibling.issuer_id<>own.issuer_id AND sibling.status='active'
    WHERE own.issuer_id=p_issuer AND own.status='active') THEN
    RAISE EXCEPTION 'Shared legacy signing identities require coordinated migration before activation';
  END IF;
  IF EXISTS (SELECT 1 FROM issuer_keys WHERE issuer_id<>p_issuer AND controller=p_did AND status='active') THEN
    RAISE EXCEPTION 'A newly activated signing identity cannot share another issuer controller';
  END IF;
  UPDATE issuer_keys SET status='retired',rotated_at=now() WHERE issuer_id=p_issuer AND status='active';
  UPDATE issuer_keys SET status='active',controller=p_did,verification_method=p_method WHERE id=p_key;
  UPDATE issuers SET key_fingerprint=candidate.fingerprint WHERE id=p_issuer;
  PERFORM phase3_key_audit(p_actor,p_issuer,p_key,
    CASE WHEN candidate.key_version=1 THEN 'key.activated' ELSE 'key.rotated' END,p_ip);
END;
$$;

CREATE FUNCTION public.phase3_import_keys(p_entries JSONB,p_actor UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE entry JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_actor AND roles && ARRAY['platform_admin','platform-admin']) THEN
    RAISE EXCEPTION 'Platform administrator required for migration';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    PERFORM phase3_save_key((entry->>'issuerId')::uuid,entry->'key',p_actor,NULL,
      coalesce((entry->>'legacy')::boolean,true),false);
  END LOOP;
END;
$$;

CREATE FUNCTION public.phase3_require_issuer_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM issuer_keys WHERE issuer_id = NEW.id) THEN
    RAISE EXCEPTION 'Issuer creation requires encrypted key provisioning';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.phase3_rewrap_keys(p_entries JSONB,p_actor UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE entry JSONB; target UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_actor AND roles && ARRAY['platform_admin','platform-admin']) THEN
    RAISE EXCEPTION 'Platform administrator required for encryption rewrap';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    UPDATE issuer_keys SET encrypted_private_key=entry->>'envelope',encryption_key_id=entry->>'encryptionKeyId'
    WHERE id=(entry->>'id')::uuid AND encrypted_private_key=entry->>'previousEnvelope'
      AND encryption_key_id=entry->>'previousKeyId' RETURNING issuer_id INTO target;
    IF target IS NULL THEN RAISE EXCEPTION 'Encryption rewrap version conflict'; END IF;
    PERFORM phase3_key_audit(p_actor,target,(entry->>'id')::uuid,'key.rewrapped',NULL);
  END LOOP;
END;
$$;
CREATE CONSTRAINT TRIGGER phase3_require_issuer_key AFTER INSERT ON public.issuers
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.phase3_require_issuer_key();
REVOKE INSERT ON public.issuers FROM authenticated;

CREATE FUNCTION public.phase3_protect_key()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.issuer_id <> OLD.issuer_id OR NEW.key_version <> OLD.key_version OR NEW.public_key <> OLD.public_key
    OR NEW.fingerprint <> OLD.fingerprint OR NEW.algorithm <> OLD.algorithm
    OR NEW.public_key_multibase <> OLD.public_key_multibase OR NEW.created_at <> OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.export_expires_at IS DISTINCT FROM OLD.export_expires_at
    OR OLD.export_claimed_at IS NOT NULL AND NEW.export_claimed_at IS DISTINCT FROM OLD.export_claimed_at
    OR OLD.status = 'retired' AND NEW.status <> 'retired'
    OR OLD.controller IS NOT NULL AND NEW.controller IS DISTINCT FROM OLD.controller
    OR OLD.verification_method IS NOT NULL AND NEW.verification_method IS DISTINCT FROM OLD.verification_method THEN
    RAISE EXCEPTION 'Issuer key identity and export history are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase3_protect_key BEFORE UPDATE ON public.issuer_keys
FOR EACH ROW EXECUTE FUNCTION public.phase3_protect_key();

-- An administrator cannot select any deployment secret name through a profile.
CREATE FUNCTION public.phase3_lock_profile_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.key_reference IS DISTINCT FROM OLD.key_reference THEN
    RAISE EXCEPTION 'Signing key references are server-controlled; use issuer key provisioning';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase3_lock_profile_reference BEFORE INSERT OR UPDATE ON public.issuer_profiles
FOR EACH ROW EXECUTE FUNCTION public.phase3_lock_profile_reference();

CREATE FUNCTION public.phase3_protect_fingerprint()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.key_fingerprint IS DISTINCT FROM OLD.key_fingerprint THEN
    RAISE EXCEPTION 'Issuer fingerprint is server-controlled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase3_protect_fingerprint BEFORE UPDATE ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase3_protect_fingerprint();

DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname LIKE 'phase3_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
-- Old invitation reservations cannot provision unencrypted or missing keys.
REVOKE EXECUTE ON FUNCTION public.prepare_issuer_invitation(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM service_role;

COMMIT;
