BEGIN;

-- Replace organization-wide object policies before changing the status type.
DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('issuers','templates','credentials','revocations','issuer_profiles')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;

ALTER TABLE public.issuers ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.issuers ALTER COLUMN status TYPE TEXT USING status::text;
ALTER TABLE public.issuers ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.issuers ADD CONSTRAINT issuers_lifecycle_status
  CHECK (status IN ('active','inactive','disabled','suspended','deleted'));
ALTER TABLE public.issuers
  ADD COLUMN display_name TEXT,
  ADD COLUMN description TEXT NOT NULL DEFAULT '',
  ADD COLUMN logo_url TEXT,
  ADD COLUMN website TEXT,
  ADD COLUMN verification_method TEXT,
  ADD COLUMN key_fingerprint TEXT,
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
UPDATE public.issuers SET display_name = name, active = (status = 'active');
ALTER TABLE public.issuers ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE public.issuers DROP CONSTRAINT issuers_slug_key;
ALTER TABLE public.issuers ADD CONSTRAINT issuers_organization_code_key UNIQUE (organization_id,slug);
ALTER TABLE public.issuers ADD CONSTRAINT issuers_nonempty_names
  CHECK (length(trim(name)) > 0 AND length(trim(display_name)) > 0);

INSERT INTO public.issuers (organization_id,name,display_name,slug,contact_email)
SELECT id,'Verifiable.sg Main Issuer','Verifiable.sg Main Issuer','verifiable-sg-main','support@verifiable.sg'
FROM public.organizations WHERE slug = 'verifiable-sg'
ON CONFLICT (organization_id,slug) DO NOTHING;
INSERT INTO public.issuers (organization_id,name,display_name,slug,contact_email)
SELECT DISTINCT o.id,o.name || ' Main Issuer',o.display_name || ' Main Issuer',
  'legacy-main-' || o.id::text,'support@verifiable.sg'
FROM public.organizations o JOIN public.templates t ON t.organization_id = o.id
WHERE t.issuer_id IS NULL AND o.slug <> 'verifiable-sg'
ON CONFLICT (organization_id,slug) DO NOTHING;

-- Backfills are transactional; signed credential content is never changed.
ALTER TABLE public.templates DISABLE TRIGGER phase1_template_ownership;
WITH candidates AS (
  SELECT t.id,t.slug,i.id AS owner_id,row_number() OVER (PARTITION BY i.id,t.slug ORDER BY t.id) AS duplicate
  FROM public.templates t JOIN public.organizations o ON o.id = t.organization_id
  JOIN public.issuers i ON i.organization_id = o.id
    AND i.slug = CASE WHEN o.slug = 'verifiable-sg' THEN 'verifiable-sg-main' ELSE 'legacy-main-' || o.id::text END
  WHERE t.issuer_id IS NULL
)
UPDATE public.templates t SET slug = t.slug || '-legacy-' || t.id::text FROM candidates c
WHERE t.id = c.id AND (c.duplicate > 1 OR EXISTS (
  SELECT 1 FROM public.templates owned WHERE owned.issuer_id = c.owner_id AND owned.slug = c.slug));
UPDATE public.templates t SET issuer_id = i.id FROM public.issuers i
JOIN public.organizations o ON o.id = i.organization_id
WHERE t.issuer_id IS NULL AND t.organization_id = o.id
  AND i.slug = CASE WHEN o.slug = 'verifiable-sg' THEN 'verifiable-sg-main' ELSE 'legacy-main-' || o.id::text END;
ALTER TABLE public.templates ENABLE TRIGGER phase1_template_ownership;
ALTER TABLE public.templates ALTER COLUMN issuer_id SET NOT NULL;
INSERT INTO public.templates (organization_id,issuer_id,slug,name,is_active)
SELECT DISTINCT c.organization_id,c.issuer_id,'legacy-unrecorded','Legacy credential (template not recorded)',false
FROM public.credentials c WHERE c.template_id IS NULL
ON CONFLICT (issuer_id,slug) DO NOTHING;
UPDATE public.credentials c SET template_id = t.id FROM public.templates t
WHERE c.template_id IS NULL AND t.issuer_id = c.issuer_id AND t.slug = 'legacy-unrecorded';
ALTER TABLE public.credentials ALTER COLUMN template_id SET NOT NULL;
ALTER TABLE public.credentials ADD COLUMN issuer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.credentials c SET issuer_snapshot = jsonb_build_object(
  'issuerId',i.id,'issuerName',i.name,'issuerDisplayName',i.display_name,
  'organizationId',o.id,'organizationDisplayName',o.display_name,
  'verificationMethod',c.verification_method,'keyFingerprint',i.key_fingerprint,
  'source','legacy-metadata-backfill')
FROM public.issuers i JOIN public.organizations o ON o.id = i.organization_id
WHERE c.issuer_id = i.id;
WITH stored AS (
  SELECT id, CASE WHEN jsonb_typeof(credential) = 'string'
    THEN (credential #>> '{}')::jsonb ELSE credential END AS document FROM public.credentials
)
UPDATE public.credentials c SET issuer_snapshot = c.issuer_snapshot || jsonb_strip_nulls(jsonb_build_object(
  'issuerDisplayName',coalesce(stored.document #>> '{credentialSubject,issuerDisplayName}',stored.document #>> '{issuer,name}'),
  'organizationDisplayName',stored.document #>> '{credentialSubject,organizationDisplayName}'))
FROM stored WHERE stored.id = c.id;

CREATE TABLE public.issuer_members (
  issuer_id UUID NOT NULL REFERENCES public.issuers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('issuer_admin','issuer_operator','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer_id,user_id)
);
CREATE INDEX issuer_members_user_idx ON public.issuer_members(user_id,issuer_id);
INSERT INTO public.issuer_members (issuer_id,user_id,role)
SELECT u.issuer_id,u.id,CASE WHEN m.role = 'issuer' THEN 'issuer_operator' ELSE 'viewer' END
FROM public.users u JOIN public.organization_members m
  ON m.user_id = u.id AND m.organization_id = u.organization_id
JOIN public.issuers i ON i.id = u.issuer_id AND i.organization_id = u.organization_id;
ALTER TABLE public.issuer_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.issuer_members TO authenticated;
GRANT ALL ON public.issuer_members TO service_role;
REVOKE ALL ON public.issuer_members FROM anon;

CREATE FUNCTION public.phase2_issuer_access(target UUID, capability TEXT DEFAULT 'read')
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM issuers i JOIN users u ON u.auth_user_id = auth.uid()
    WHERE i.id = target AND (
      phase1_platform_admin()
      OR (phase1_owns_organization(i.organization_id) AND (
        (capability IN ('read','manage','templates') AND EXISTS (
          SELECT 1 FROM organization_members om WHERE om.user_id = u.id
          AND om.organization_id = i.organization_id AND om.role = 'organization_admin'))
        OR EXISTS (SELECT 1 FROM issuer_members im WHERE im.user_id = u.id AND im.issuer_id = i.id
          AND (capability = 'read' OR capability = 'templates' AND im.role = 'issuer_admin'
            OR capability = 'operate' AND im.role = 'issuer_operator'))
        OR (capability = 'read' AND u.issuer_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM issuer_members im JOIN issuers mi ON mi.id = im.issuer_id
            WHERE im.user_id = u.id AND mi.organization_id = i.organization_id)
          AND EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id
            AND om.organization_id = i.organization_id AND om.role = 'viewer'))
      ))
    )
  );
$$;
CREATE FUNCTION public.phase2_active_issuer(target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM issuers i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = target AND i.status = 'active' AND i.active
      AND o.status = 'active' AND o.soft_deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.phase2_issuer_access(UUID,TEXT), public.phase2_active_issuer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase2_issuer_access(UUID,TEXT), public.phase2_active_issuer(UUID) TO authenticated,service_role;

CREATE FUNCTION public.phase2_issuer_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.display_name := coalesce(nullif(trim(NEW.display_name),''),NEW.name);
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.organization_id
      AND status = 'active' AND soft_deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Active organization required';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'deleted' AND OLD.status <> 'deleted'
    AND auth.uid() IS NOT NULL AND NOT phase1_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators may delete issuers';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'deleted'
    AND auth.uid() IS NOT NULL AND NOT phase1_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators may delete issuers';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'deleted' THEN
    RAISE EXCEPTION 'Deleted issuers are immutable';
  END IF;
  NEW.active := NEW.status = 'active';
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := (SELECT id FROM users WHERE auth_user_id = auth.uid());
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase2_issuer_metadata BEFORE INSERT OR UPDATE ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase2_issuer_metadata();

CREATE FUNCTION public.phase2_member_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.issuer_id <> OLD.issuer_id OR NEW.user_id <> OLD.user_id
    OR NEW.created_at <> OLD.created_at) THEN
    RAISE EXCEPTION 'Issuer membership identity is immutable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM issuers i JOIN users u ON u.id = NEW.user_id
    JOIN organization_members om ON om.user_id = u.id AND om.organization_id = i.organization_id
    WHERE i.id = NEW.issuer_id AND u.organization_id = i.organization_id AND i.status <> 'deleted') THEN
    RAISE EXCEPTION 'Issuer user must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase2_member_identity BEFORE INSERT OR UPDATE ON public.issuer_members
FOR EACH ROW EXECUTE FUNCTION public.phase2_member_identity();

-- Invitation compatibility: only new issuer-bound users get an automatic assignment.
CREATE FUNCTION public.phase2_legacy_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.issuer_id IS NOT NULL THEN
    INSERT INTO issuer_members (issuer_id,user_id,role)
    VALUES (NEW.issuer_id,NEW.id,CASE WHEN NEW.roles && ARRAY['issuer','issuer-operator']
      THEN 'issuer_operator' ELSE 'viewer' END);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase2_new_user_assignment AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.phase2_legacy_assignment();

CREATE FUNCTION public.phase2_credential_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner issuers; org organizations; template_owner UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot
      OR NEW.credential IS DISTINCT FROM OLD.credential OR NEW.issuer_profile_id IS DISTINCT FROM OLD.issuer_profile_id
      OR NEW.issuer_did IS DISTINCT FROM OLD.issuer_did OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
      OR NEW.document_store_address IS DISTINCT FROM OLD.document_store_address
      OR NEW.document_store_network IS DISTINCT FROM OLD.document_store_network
      OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name
      OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email OR NEW.issuing_methods IS DISTINCT FROM OLD.issuing_methods
      OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.valid_until IS DISTINCT FROM OLD.valid_until THEN
      RAISE EXCEPTION 'Credential template, signed payload and issuer snapshot are immutable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO owner FROM issuers WHERE id = NEW.issuer_id FOR SHARE;
  SELECT * INTO org FROM organizations WHERE id = owner.organization_id FOR SHARE;
  IF owner.id IS NULL OR owner.status <> 'active' OR NOT owner.active
    OR org.status <> 'active' OR org.soft_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active issuer and organization required';
  END IF;
  SELECT issuer_id INTO template_owner FROM templates WHERE id = NEW.template_id AND is_active FOR SHARE;
  IF template_owner IS DISTINCT FROM NEW.issuer_id THEN
    RAISE EXCEPTION 'Active template must belong to credential issuer';
  END IF;
  NEW.issuer_snapshot := jsonb_build_object(
    'issuerId',owner.id,'issuerName',owner.name,'issuerDisplayName',owner.display_name,
    'organizationId',org.id,'organizationDisplayName',org.display_name,
    'verificationMethod',NEW.verification_method,'keyFingerprint',owner.key_fingerprint,
    'source','issuance');
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase2_credential_identity BEFORE INSERT OR UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.phase2_credential_identity();

CREATE FUNCTION public.phase2_issuer_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor UUID; owner_id UUID; org_id UUID; target_id UUID; event TEXT; details JSONB := '{}';
BEGIN
  SELECT id INTO actor FROM users WHERE auth_user_id = auth.uid();
  IF actor IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'issuers' THEN
    owner_id := NEW.id; target_id := NEW.id;
    event := CASE WHEN TG_OP = 'INSERT' THEN 'issuer.created'
      WHEN NEW.status <> 'active' AND OLD.status IS DISTINCT FROM NEW.status THEN 'issuer.disabled'
      ELSE 'issuer.edited' END;
  ELSIF TG_TABLE_NAME = 'issuer_members' THEN
    owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.issuer_id ELSE NEW.issuer_id END;
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    event := CASE TG_OP WHEN 'INSERT' THEN 'issuer.user.added' WHEN 'DELETE' THEN 'issuer.user.removed' ELSE 'issuer.user.updated' END;
    details := jsonb_build_object('role',CASE WHEN TG_OP = 'DELETE' THEN OLD.role ELSE NEW.role END);
  ELSIF TG_TABLE_NAME = 'templates' THEN
    owner_id := NEW.issuer_id; target_id := NEW.id; event := 'template.assigned_to_issuer';
  ELSE
    owner_id := NEW.issuer_id; target_id := NEW.id; event := 'credential.issued_by_issuer';
  END IF;
  SELECT organization_id INTO org_id FROM issuers WHERE id = owner_id;
  INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (org_id,owner_id,actor,event,TG_TABLE_NAME,target_id,details);
  RETURN NULL;
END;
$$;
CREATE TRIGGER phase2_issuer_audit AFTER INSERT OR UPDATE ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase2_issuer_audit();
CREATE TRIGGER phase2_member_audit AFTER INSERT OR UPDATE OR DELETE ON public.issuer_members
FOR EACH ROW EXECUTE FUNCTION public.phase2_issuer_audit();
CREATE TRIGGER phase2_template_audit AFTER INSERT ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.phase2_issuer_audit();
CREATE TRIGGER phase2_credential_audit AFTER INSERT ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.phase2_issuer_audit();

CREATE POLICY issuers_read ON public.issuers FOR SELECT TO authenticated
USING (phase1_owns_organization(organization_id,ARRAY['organization_admin']) OR phase2_issuer_access(id));
CREATE POLICY issuers_create ON public.issuers FOR INSERT TO authenticated
WITH CHECK (phase1_owns_organization(organization_id,ARRAY['organization_admin']));
CREATE POLICY issuers_update ON public.issuers FOR UPDATE TO authenticated
USING (phase2_issuer_access(id,'manage')) WITH CHECK (phase2_issuer_access(id,'manage'));
REVOKE DELETE ON public.issuers FROM authenticated;
CREATE POLICY issuer_members_read ON public.issuer_members FOR SELECT TO authenticated
USING (user_id = (SELECT user_id FROM current_app_user()) OR phase2_issuer_access(issuer_id,'manage'));
CREATE POLICY issuer_members_create ON public.issuer_members FOR INSERT TO authenticated
WITH CHECK (phase2_issuer_access(issuer_id,'manage'));
CREATE POLICY issuer_members_update ON public.issuer_members FOR UPDATE TO authenticated
USING (phase2_issuer_access(issuer_id,'manage')) WITH CHECK (phase2_issuer_access(issuer_id,'manage'));
CREATE POLICY issuer_members_remove ON public.issuer_members FOR DELETE TO authenticated
USING (phase2_issuer_access(issuer_id,'manage'));
CREATE POLICY templates_read ON public.templates FOR SELECT TO authenticated
USING (phase2_issuer_access(issuer_id));
CREATE POLICY templates_create ON public.templates FOR INSERT TO authenticated
WITH CHECK (phase2_issuer_access(issuer_id,'templates') AND phase2_active_issuer(issuer_id));
CREATE POLICY templates_update ON public.templates FOR UPDATE TO authenticated
USING (phase2_issuer_access(issuer_id,'templates'))
WITH CHECK (phase2_issuer_access(issuer_id,'templates'));
CREATE POLICY credentials_read ON public.credentials FOR SELECT TO authenticated
USING (phase2_issuer_access(issuer_id));
CREATE POLICY credentials_create ON public.credentials FOR INSERT TO authenticated
WITH CHECK (phase2_issuer_access(issuer_id,'operate') AND phase2_active_issuer(issuer_id));
CREATE POLICY credentials_update ON public.credentials FOR UPDATE TO authenticated
USING (phase2_issuer_access(issuer_id,'operate') AND phase2_active_issuer(issuer_id))
WITH CHECK (phase2_issuer_access(issuer_id,'operate') AND phase2_active_issuer(issuer_id));
CREATE POLICY revocations_read ON public.revocations FOR SELECT TO authenticated
USING (phase2_issuer_access(issuer_id));
CREATE POLICY revocations_create ON public.revocations FOR INSERT TO authenticated
WITH CHECK (phase2_issuer_access(issuer_id,'operate') AND phase2_active_issuer(issuer_id)
  AND EXISTS (SELECT 1 FROM credentials c WHERE c.id = credential_id AND c.issuer_id = revocations.issuer_id));
CREATE POLICY issuer_profiles_read ON public.issuer_profiles FOR SELECT TO authenticated
USING (phase2_issuer_access(owner_issuer_id));

-- Fix the legacy invitation lookup now that issuer codes are tenant-local.
-- Existing RPC validation and audit semantics are retained verbatim.
DO $$ DECLARE definition TEXT; BEGIN
  SELECT pg_get_functiondef('public.prepare_issuer_invitation(uuid,text,text,text,text,uuid,text)'::regprocedure) INTO definition;
  definition := replace(definition,
    'FROM issuers WHERE slug = p_slug FOR UPDATE',
    'FROM issuers WHERE slug = p_slug AND organization_id = p_organization_id FOR UPDATE');
  EXECUTE definition;
END $$;

COMMIT;
