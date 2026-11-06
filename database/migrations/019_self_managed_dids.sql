BEGIN;

CREATE TABLE public.self_managed_dids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
  domain TEXT NOT NULL UNIQUE CHECK (length(domain)<=253 AND domain=lower(domain)
    AND domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$'
    AND domain<>'verifiable.sg' AND domain NOT LIKE '%.verifiable.sg'),
  did TEXT GENERATED ALWAYS AS ('did:web:' || domain) STORED,
  selected BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 1,
  expected_document JSONB NOT NULL,
  linkage_document JSONB,
  linkage_expires_at TIMESTAMPTZ,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid','stale')),
  validated_revision INTEGER,
  checked_at TIMESTAMPTZ,
  validation_message TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.self_managed_dids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.self_managed_dids FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.self_managed_dids TO authenticated,service_role;
CREATE POLICY self_managed_dids_read ON public.self_managed_dids FOR SELECT TO authenticated
USING (phase1_platform_admin() OR phase1_owns_organization(organization_id));

CREATE FUNCTION public.phase5_document(p_managed JSONB,p_did TEXT)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT jsonb_build_object(
    '@context',p_managed->'@context','id',p_did,
    'verificationMethod',coalesce((SELECT jsonb_agg(
      m || jsonb_build_object('id',p_did || substr(m->>'id',length(p_managed->>'id')+1),'controller',p_did)
      ORDER BY m->>'id') FROM jsonb_array_elements(p_managed->'verificationMethod') m),'[]'::jsonb),
    'authentication',coalesce((SELECT jsonb_agg(to_jsonb(p_did || substr(m,length(p_managed->>'id')+1)) ORDER BY m)
      FROM jsonb_array_elements_text(p_managed->'authentication') m),'[]'::jsonb),
    'assertionMethod',coalesce((SELECT jsonb_agg(to_jsonb(p_did || substr(m,length(p_managed->>'id')+1)) ORDER BY m)
      FROM jsonb_array_elements_text(p_managed->'assertionMethod') m),'[]'::jsonb));
$$;
CREATE FUNCTION public.phase5_sync_document()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expected JSONB; configuration self_managed_dids;
BEGIN
  SELECT * INTO configuration FROM self_managed_dids WHERE organization_id=NEW.organization_id FOR UPDATE;
  IF configuration.id IS NOT NULL THEN
    expected:=phase5_document(NEW.did_document,configuration.did);
    IF expected IS DISTINCT FROM configuration.expected_document THEN
      UPDATE self_managed_dids SET expected_document=expected,revision=revision+1,validation_status='stale',
        validation_message='Issuer methods changed. Download, deploy and validate the updated DID document.',
        updated_at=now() WHERE id=configuration.id;
      INSERT INTO audit_logs(organization_id,action,entity_type,entity_id,metadata)
      VALUES(NEW.organization_id,'organization.did.deployment_stale','self_managed_did',configuration.id,'{}');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase5_sync_document AFTER UPDATE OF did_document ON public.organization_dids
FOR EACH ROW EXECUTE FUNCTION public.phase5_sync_document();

CREATE FUNCTION public.phase5_did_action(p_org UUID,p_actor UUID,p_action TEXT,p_payload JSONB DEFAULT '{}',p_revision INTEGER DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE configuration self_managed_dids; managed organization_dids; identity_id UUID;
BEGIN
  -- Match existing lock order: managed organization identity before customer configuration.
  SELECT * INTO managed FROM organization_dids WHERE organization_id=p_org FOR UPDATE;
  IF managed.id IS NULL OR NOT EXISTS(
    SELECT 1 FROM users u WHERE u.id=p_actor AND (
      u.roles && ARRAY['platform_admin','platform-admin'] OR
      (u.organization_id=p_org AND EXISTS(SELECT 1 FROM organization_members m JOIN organizations o ON o.id=m.organization_id
        WHERE m.user_id=u.id AND m.organization_id=p_org AND m.role='organization_admin'
          AND o.status='active' AND o.soft_deleted_at IS NULL)))) THEN
    RAISE EXCEPTION 'Organization DID management denied';
  END IF;
  SELECT * INTO configuration FROM self_managed_dids WHERE organization_id=p_org FOR UPDATE;
  IF p_action='configure' THEN
    IF configuration.id IS NOT NULL THEN RAISE EXCEPTION 'Customer DID domain is immutable; retain it for historical verification'; END IF;
    IF EXISTS(SELECT 1 FROM issuer_profiles WHERE did='did:web:' || (p_payload->>'domain')) THEN
      RAISE EXCEPTION 'Domain is already used by a legacy issuer identity';
    END IF;
    INSERT INTO self_managed_dids(organization_id,domain,expected_document,created_by)
    VALUES(p_org,p_payload->>'domain',phase5_document(managed.did_document,'did:web:' || (p_payload->>'domain')),p_actor)
    RETURNING id INTO identity_id;
  ELSE
    IF configuration.id IS NULL THEN RAISE EXCEPTION 'Configure a customer domain first'; END IF;
    identity_id:=configuration.id;
    IF p_revision IS DISTINCT FROM configuration.revision THEN RAISE EXCEPTION 'DID configuration changed; reload and retry'; END IF;
    IF p_action='linkage' THEN
      UPDATE self_managed_dids SET linkage_document=p_payload->'document',
        linkage_expires_at=(p_payload->>'expiresAt')::timestamptz,validation_status='pending',
        revision=revision+1,validation_message='Deploy both generated files and validate.',updated_at=now() WHERE id=configuration.id;
    ELSIF p_action='validate' THEN
      IF (p_payload->>'valid')::boolean THEN
        IF configuration.linkage_document IS NULL OR configuration.linkage_expires_at IS NULL OR configuration.linkage_expires_at<=now() THEN
          RAISE EXCEPTION 'Generate an unexpired domain linkage file first';
        END IF;
        UPDATE self_managed_dids SET validation_status='valid',validated_revision=revision,checked_at=now(),
          validation_message='Both canonical HTTPS files and the domain linkage signature verified.',updated_at=now()
          WHERE id=configuration.id;
      ELSE
        UPDATE self_managed_dids SET validation_status='invalid',checked_at=now(),
          validation_message='Deployment validation failed. Check canonical HTTPS files, DID, public methods and linkage expiry.',
          updated_at=now() WHERE id=configuration.id;
      END IF;
    ELSIF p_action='self-managed' THEN
      IF managed.status<>'active' OR configuration.validation_status<>'valid'
        OR configuration.validated_revision IS DISTINCT FROM configuration.revision
        OR configuration.linkage_expires_at IS NULL OR configuration.linkage_expires_at<=now()
        OR configuration.checked_at IS NULL OR configuration.checked_at<now()-interval '10 minutes' THEN
        RAISE EXCEPTION 'Validate the current deployment before selecting self-managed issuance';
      END IF;
      UPDATE self_managed_dids SET selected=true,updated_at=now() WHERE id=configuration.id;
    ELSIF p_action='managed' THEN
      UPDATE self_managed_dids SET selected=false,updated_at=now() WHERE id=configuration.id;
    ELSIF p_action<>'download' THEN RAISE EXCEPTION 'Unsupported DID action';
    END IF;
  END IF;
  INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(p_org,p_actor,'organization.did.' || p_action,'self_managed_did',identity_id,'{}');
END;
$$;

CREATE OR REPLACE FUNCTION public.phase3_credential_key()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE signer issuer_keys; binding organization_verification_methods; identity organization_dids; customer self_managed_dids;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.signing_key_id IS DISTINCT FROM OLD.signing_key_id THEN RAISE EXCEPTION 'Credential signing key is immutable'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.signing_key_id IS NOT NULL THEN
    SELECT * INTO signer FROM issuer_keys WHERE id=NEW.signing_key_id AND issuer_id=NEW.issuer_id AND status='active';
    IF signer.id IS NULL THEN RAISE EXCEPTION 'Credential signing key ownership mismatch'; END IF;
    SELECT * INTO binding FROM organization_verification_methods WHERE key_id=signer.id AND issuer_id=NEW.issuer_id AND status='active';
    SELECT * INTO identity FROM organization_dids WHERE id=binding.organization_did_id AND status='active';
    SELECT * INTO customer FROM self_managed_dids WHERE organization_id=identity.organization_id;
    IF identity.id IS NULL THEN RAISE EXCEPTION 'Active organization verification method required'; END IF;
    IF coalesce(customer.selected,false) THEN
      IF customer.validation_status<>'valid' OR customer.validated_revision IS DISTINCT FROM customer.revision
        OR customer.linkage_expires_at IS NULL OR customer.linkage_expires_at<=now() OR NEW.issuer_did IS DISTINCT FROM customer.did
        OR NEW.verification_method IS DISTINCT FROM customer.did || substr(binding.verification_method,length(identity.did)+1) THEN
        RAISE EXCEPTION 'Validated active customer DID signing identity required';
      END IF;
    ELSIF NEW.issuer_did IS DISTINCT FROM identity.did OR NEW.verification_method IS DISTINCT FROM binding.verification_method THEN
      RAISE EXCEPTION 'Managed credential signing identity mismatch';
    END IF;
    NEW.issuer_snapshot:=NEW.issuer_snapshot || jsonb_build_object('keyId',signer.id,'keyVersion',signer.key_version,
      'keyFingerprint',signer.fingerprint,'didUsed',NEW.issuer_did,'verificationMethod',NEW.verification_method);
  END IF;
  RETURN NEW;
END;
$$;

DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'phase5_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
COMMIT;
