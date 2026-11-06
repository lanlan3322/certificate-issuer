BEGIN;

CREATE TABLE public.organization_dids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
  did TEXT NOT NULL UNIQUE,
  path_slug TEXT NOT NULL UNIQUE CHECK (path_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  method TEXT NOT NULL DEFAULT 'did:web' CHECK (method = 'did:web'),
  hosting_mode TEXT NOT NULL DEFAULT 'managed' CHECK (hosting_mode = 'managed'),
  did_document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (did = 'did:web:verifiable.sg:organizations:' || path_slug)
);
CREATE TABLE public.organization_verification_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_did_id UUID NOT NULL REFERENCES public.organization_dids(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  issuer_id UUID NOT NULL REFERENCES public.issuers(id) ON DELETE RESTRICT,
  key_id UUID NOT NULL UNIQUE REFERENCES public.issuer_keys(id) ON DELETE RESTRICT,
  verification_method TEXT NOT NULL UNIQUE,
  public_key_multibase TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organization_methods_owner ON public.organization_verification_methods(organization_id,issuer_id);
ALTER TABLE public.organization_dids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_verification_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_dids,public.organization_verification_methods FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.organization_dids,public.organization_verification_methods TO authenticated;
GRANT SELECT ON public.organization_dids,public.organization_verification_methods TO service_role;
CREATE POLICY organization_dids_read ON public.organization_dids FOR SELECT TO authenticated
USING (phase1_platform_admin() OR phase1_owns_organization(organization_id));
CREATE POLICY organization_methods_read ON public.organization_verification_methods FOR SELECT TO authenticated
USING (phase1_platform_admin() OR phase2_issuer_access(issuer_id));

CREATE FUNCTION public.phase4_rebuild_document(p_org UUID,p_actor UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE identity organization_dids; document JSONB; new_status TEXT;
BEGIN
  SELECT * INTO identity FROM organization_dids WHERE organization_id=p_org FOR UPDATE;
  IF identity.id IS NULL THEN RAISE EXCEPTION 'Managed organization DID is missing'; END IF;
  SELECT CASE WHEN status='active' AND soft_deleted_at IS NULL THEN 'active' ELSE 'inactive' END
    INTO new_status FROM organizations WHERE id=p_org;
  SELECT jsonb_build_object(
    '@context',jsonb_build_array('https://www.w3.org/ns/did/v1','https://w3id.org/security/multikey/v1'),
    'id',identity.did,
    'verificationMethod',coalesce(jsonb_agg(jsonb_build_object(
      'id',m.verification_method,'type','Multikey','controller',identity.did,
      'publicKeyMultibase',m.public_key_multibase) ORDER BY m.verification_method),'[]'::jsonb),
    'authentication',coalesce(jsonb_agg(to_jsonb(m.verification_method) ORDER BY m.verification_method)
      FILTER (WHERE m.status='active' AND new_status='active'),'[]'::jsonb),
    'assertionMethod',coalesce(jsonb_agg(to_jsonb(m.verification_method) ORDER BY m.verification_method),'[]'::jsonb)
  ) INTO document FROM organization_verification_methods m WHERE m.organization_id=p_org;
  IF octet_length(document::text)>900000 THEN
    RAISE EXCEPTION 'Managed DID document exceeds the safe resolver response budget';
  END IF;
  IF identity.did_document IS DISTINCT FROM document OR identity.status<>new_status THEN
    UPDATE organization_dids SET did_document=document,status=new_status,updated_at=now() WHERE id=identity.id;
    INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
    VALUES(p_org,p_actor,'organization.did.updated','organization_did',identity.id,'{}');
  END IF;
END;
$$;

CREATE FUNCTION public.phase4_sync_methods(p_org UUID,p_actor UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE identity organization_dids; candidate RECORD; next_status TEXT; old_status TEXT; method_id UUID;
BEGIN
  SELECT * INTO identity FROM organization_dids WHERE organization_id=p_org FOR UPDATE;
  IF identity.id IS NULL THEN RAISE EXCEPTION 'Managed organization DID is missing'; END IF;
  FOR candidate IN SELECT k.id,k.issuer_id,k.public_key_multibase,k.fingerprint,k.key_version,k.status,
    i.active,i.status AS issuer_status,o.status AS org_status,o.soft_deleted_at
    FROM issuer_keys k JOIN issuers i ON i.id=k.issuer_id JOIN organizations o ON o.id=i.organization_id
    WHERE i.organization_id=p_org AND k.status IN ('active','retired') ORDER BY k.id
  LOOP
    next_status := CASE WHEN candidate.status='active' AND candidate.active AND candidate.issuer_status='active'
      AND candidate.org_status='active' AND candidate.soft_deleted_at IS NULL THEN 'active' ELSE 'inactive' END;
    SELECT id,status INTO method_id,old_status FROM organization_verification_methods WHERE key_id=candidate.id;
    IF method_id IS NULL THEN
      INSERT INTO organization_verification_methods(organization_did_id,organization_id,issuer_id,key_id,
        verification_method,public_key_multibase,key_fingerprint,key_version,status)
      VALUES(identity.id,p_org,candidate.issuer_id,candidate.id,
        identity.did || '#issuer-' || candidate.issuer_id::text || '-key-' || candidate.key_version::text,
        candidate.public_key_multibase,candidate.fingerprint,candidate.key_version,next_status)
      RETURNING id INTO method_id;
      INSERT INTO audit_logs(organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata)
      VALUES(p_org,candidate.issuer_id,p_actor,'issuer.method.added','organization_verification_method',method_id,
        jsonb_build_object('keyVersion',candidate.key_version));
    ELSIF old_status<>next_status THEN
      UPDATE organization_verification_methods SET status=next_status,updated_at=now() WHERE id=method_id;
      INSERT INTO audit_logs(organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata)
      VALUES(p_org,candidate.issuer_id,p_actor,
        CASE WHEN next_status='active' THEN 'issuer.method.added' ELSE 'issuer.method.removed' END,
        'organization_verification_method',method_id,jsonb_build_object('historicalPublicKeyRetained',true));
    END IF;
  END LOOP;
  PERFORM phase4_rebuild_document(p_org,p_actor);
END;
$$;

CREATE FUNCTION public.phase4_create_did()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE identity_id UUID; controller TEXT := 'did:web:verifiable.sg:organizations:' || NEW.slug;
BEGIN
  IF NEW.slug !~ '^[a-z0-9][a-z0-9-]{0,62}$' THEN RAISE EXCEPTION 'Organization slug cannot form a managed DID path'; END IF;
  INSERT INTO organization_dids(organization_id,did,path_slug,status,did_document)
  VALUES(NEW.id,controller,NEW.slug,CASE WHEN NEW.status='active' THEN 'active' ELSE 'inactive' END,
    jsonb_build_object('@context',jsonb_build_array('https://www.w3.org/ns/did/v1','https://w3id.org/security/multikey/v1'),
      'id',controller,'verificationMethod','[]'::jsonb,'authentication','[]'::jsonb,'assertionMethod','[]'::jsonb))
  RETURNING id INTO identity_id;
  INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(NEW.id,NEW.created_by,'organization.did.created','organization_did',identity_id,'{}');
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase4_create_did AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.phase4_create_did();

INSERT INTO public.organization_dids(organization_id,did,path_slug,status,did_document,created_at)
SELECT id,'did:web:verifiable.sg:organizations:' || slug,slug,
  CASE WHEN status='active' AND soft_deleted_at IS NULL THEN 'active' ELSE 'inactive' END,
  '{}'::jsonb,created_at FROM organizations;
INSERT INTO audit_logs(organization_id,action,entity_type,entity_id,metadata)
SELECT organization_id,'organization.did.created','organization_did',id,'{"source":"migration-018"}'::jsonb
FROM organization_dids;

CREATE FUNCTION public.phase4_initial_key_binding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE controller TEXT;
BEGIN
  IF NEW.status='pending' AND NEW.key_version=1 AND NEW.controller IS NULL THEN
    SELECT d.did INTO controller FROM organization_dids d JOIN issuers i ON i.organization_id=d.organization_id
      WHERE i.id=NEW.issuer_id;
    IF controller IS NULL THEN RAISE EXCEPTION 'Managed DID required before key provisioning'; END IF;
    NEW.controller := controller;
    NEW.verification_method := controller || '#issuer-' || NEW.issuer_id::text || '-key-1';
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase4_initial_key_binding BEFORE INSERT ON public.issuer_keys
FOR EACH ROW EXECUTE FUNCTION public.phase4_initial_key_binding();

CREATE FUNCTION public.phase4_key_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org UUID; actor UUID;
BEGIN
  IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  SELECT organization_id INTO org FROM issuers WHERE id=NEW.issuer_id;
  actor := coalesce((SELECT id FROM users WHERE auth_user_id=auth.uid()),
    nullif(current_setting('app.phase4_actor',true),'')::uuid,NEW.created_by);
  PERFORM phase4_sync_methods(org,actor);
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase4_key_changed AFTER INSERT OR UPDATE ON public.issuer_keys
FOR EACH ROW EXECUTE FUNCTION public.phase4_key_changed();

CREATE FUNCTION public.phase4_owner_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org UUID; actor UUID := (SELECT id FROM users WHERE auth_user_id=auth.uid());
BEGIN
  IF TG_TABLE_NAME='organizations' THEN org := NEW.id; ELSE org := NEW.organization_id; END IF;
  IF TG_OP='UPDATE' THEN PERFORM phase4_sync_methods(org,actor); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase4_issuer_changed AFTER UPDATE OF status,active ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase4_owner_changed();
CREATE TRIGGER phase4_organization_changed AFTER UPDATE OF status,soft_deleted_at ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.phase4_owner_changed();

-- Existing identities stay immutable; initial, genuinely unbound keys can now
-- bind to managed publication. Rotations remain pending until explicit activation.
UPDATE issuer_keys k SET status='active',controller=d.did,
  verification_method=d.did || '#issuer-' || k.issuer_id::text || '-key-1'
FROM issuers i JOIN organization_dids d ON d.organization_id=i.organization_id
WHERE k.issuer_id=i.id AND k.key_version=1 AND k.status='pending' AND k.controller IS NULL;
DO $$ DECLARE org RECORD; BEGIN
  FOR org IN SELECT id FROM organizations LOOP PERFORM phase4_sync_methods(org.id,NULL); END LOOP;
END $$;

CREATE FUNCTION public.phase4_activate_key(p_issuer UUID,p_key UUID,p_actor UUID,p_ip TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate issuer_keys; identity organization_dids; owner issuers;
BEGIN
  SELECT * INTO owner FROM issuers WHERE id=p_issuer FOR UPDATE;
  IF owner.id IS NULL OR NOT owner.active OR owner.status<>'active'
    OR NOT phase3_actor_can_manage(p_actor,p_issuer) THEN RAISE EXCEPTION 'Managed key activation denied'; END IF;
  SELECT * INTO identity FROM organization_dids WHERE organization_id=owner.organization_id AND status='active' FOR UPDATE;
  IF identity.id IS NULL THEN RAISE EXCEPTION 'Active managed organization DID required'; END IF;
  SELECT * INTO candidate FROM issuer_keys WHERE issuer_id=p_issuer AND id=p_key AND status='pending' FOR UPDATE;
  IF candidate.id IS NULL THEN RAISE EXCEPTION 'Pending issuer key required'; END IF;
  PERFORM set_config('app.phase4_actor',p_actor::text,true);
  UPDATE issuer_keys SET status='retired',rotated_at=now() WHERE issuer_id=p_issuer AND status='active';
  UPDATE issuer_keys SET status='active',controller=identity.did,
    verification_method=identity.did || '#issuer-' || p_issuer::text || '-key-' || key_version::text WHERE id=p_key;
  UPDATE issuers SET key_fingerprint=candidate.fingerprint WHERE id=p_issuer;
  PERFORM phase3_key_audit(p_actor,p_issuer,p_key,'key.rotated',p_ip);
END;
$$;

CREATE OR REPLACE FUNCTION public.phase3_credential_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE signer issuer_keys; binding_id UUID;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id THEN RAISE EXCEPTION 'Credential signing key is immutable'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.signing_key_id IS NOT NULL THEN
    SELECT * INTO signer FROM issuer_keys WHERE id=NEW.signing_key_id AND issuer_id=NEW.issuer_id AND status='active';
    IF signer.id IS NULL THEN RAISE EXCEPTION 'Credential signing key ownership mismatch'; END IF;
    SELECT m.id INTO binding_id FROM organization_verification_methods m
      JOIN organization_dids d ON d.id=m.organization_did_id
      WHERE m.key_id=signer.id AND m.issuer_id=NEW.issuer_id AND m.status='active' AND d.status='active'
        AND m.verification_method=NEW.verification_method AND d.did=NEW.issuer_did;
    IF binding_id IS NULL THEN
      RAISE EXCEPTION 'Credential signing key identity mismatch';
    END IF;
    NEW.issuer_snapshot := NEW.issuer_snapshot || jsonb_build_object('keyId',signer.id,
      'keyVersion',signer.key_version,'keyFingerprint',signer.fingerprint,
      'didUsed',NEW.issuer_did,'verificationMethod',NEW.verification_method);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.phase4_read_status(p_org UUID,p_page INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*)=0 THEN NULL ELSE jsonb_agg(jsonb_build_object(
    'index',a.allocation % 131072,'status',coalesce(c.status::text,'revoked'))) END
  FROM bitstring_status_allocations a JOIN issuers i ON i.id=a.issuer_id
  LEFT JOIN credentials c ON c.external_id=a.external_id AND c.issuer_id=a.issuer_id
  WHERE i.organization_id=p_org AND p_page>=0
    AND a.allocation>=p_page::bigint*131072 AND a.allocation<(p_page::bigint+1)*131072;
$$;

CREATE FUNCTION public.phase4_reserve_status(p_org UUID,p_issuer UUID,p_external TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM issuers i JOIN organization_dids d ON d.organization_id=i.organization_id
    WHERE i.id=p_issuer AND i.organization_id=p_org AND i.status='active' AND i.active AND d.status='active') THEN
    RAISE EXCEPTION 'Active managed issuer ownership required';
  END IF;
  RETURN reserve_bitstring_status(p_issuer,p_external);
END;
$$;

CREATE FUNCTION public.phase4_audit_download(p_org UUID,p_actor UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE identity UUID;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=p_actor AND (u.roles && ARRAY['platform_admin','platform-admin']
    OR EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=u.id AND m.organization_id=p_org))) THEN
    RAISE EXCEPTION 'Organization DID download denied';
  END IF;
  SELECT id INTO identity FROM organization_dids WHERE organization_id=p_org;
  IF identity IS NULL THEN RAISE EXCEPTION 'Organization DID missing'; END IF;
  INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(p_org,p_actor,'organization.did.downloaded','organization_did',identity,'{}');
END;
$$;

DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname LIKE 'phase4_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
-- Managed activation is atomic publication, not the old single-controller path.
REVOKE EXECUTE ON FUNCTION public.phase3_activate_key(UUID,UUID,UUID,TEXT,TEXT,TEXT) FROM service_role;
COMMIT;
