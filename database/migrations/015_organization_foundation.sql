BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ;
UPDATE public.organizations SET display_name = name WHERE display_name IS NULL;
ALTER TABLE public.organizations ALTER COLUMN display_name SET NOT NULL;

INSERT INTO public.organizations (name, display_name, slug)
VALUES ('Verifiable.sg', 'Verifiable.sg', 'verifiable-sg') ON CONFLICT (slug) DO NOTHING;

UPDATE public.users SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'verifiable-sg')
WHERE organization_id IS NULL;
UPDATE public.issuers SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'verifiable-sg')
WHERE organization_id IS NULL;
ALTER TABLE public.users ALTER COLUMN organization_id SET NOT NULL;

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('organization_admin', 'issuer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id, organization_id);
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, id, CASE
  WHEN roles && ARRAY['issuer-admin','organization_admin'] THEN 'organization_admin'
  WHEN roles && ARRAY['issuer-operator','issuer'] THEN 'issuer'
  ELSE 'viewer' END
FROM public.users;

ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.credentials ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;
UPDATE public.templates t SET organization_id = i.organization_id FROM public.issuers i WHERE i.id = t.issuer_id;
UPDATE public.templates SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'verifiable-sg') WHERE organization_id IS NULL;
UPDATE public.credentials c SET organization_id = i.organization_id FROM public.issuers i WHERE i.id = c.issuer_id;
ALTER TABLE public.templates ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.credentials ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX templates_organization_idx ON public.templates(organization_id, is_active);
CREATE INDEX credentials_organization_idx ON public.credentials(organization_id, issued_at DESC, id);

CREATE FUNCTION public.phase1_owns_organization(target UUID, allowed_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u WHERE u.auth_user_id = auth.uid()
    AND (
      u.roles && ARRAY['platform_admin','platform-admin']
      OR EXISTS (
        SELECT 1 FROM organization_members m JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = u.id AND m.organization_id = target
          AND u.organization_id = target AND o.status = 'active' AND o.soft_deleted_at IS NULL
          AND (allowed_roles IS NULL OR m.role = ANY(allowed_roles))
      )
    )
  );
$$;
CREATE FUNCTION public.phase1_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid()
    AND roles && ARRAY['platform_admin','platform-admin']);
$$;
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
    AND phase1_owns_organization(organization_id) LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.current_app_user()
RETURNS TABLE (user_id UUID, organization_id UUID, issuer_id UUID, roles TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.organization_id, u.issuer_id,
    CASE WHEN phase1_platform_admin() THEN ARRAY['platform_admin']
      ELSE ARRAY[m.role] END
  FROM users u LEFT JOIN organization_members m ON m.user_id = u.id AND m.organization_id = u.organization_id
  WHERE u.auth_user_id = auth.uid() AND phase1_owns_organization(u.organization_id) LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.has_role(target_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT phase1_platform_admin() OR EXISTS (
    SELECT 1 FROM current_app_user() u WHERE
      CASE target_role WHEN 'issuer-admin' THEN 'organization_admin'
        WHEN 'issuer-operator' THEN 'issuer' WHEN 'verifier' THEN 'viewer'
        ELSE target_role END = ANY(u.roles)
  );
$$;

CREATE FUNCTION public.phase1_new_user_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO organization_members (organization_id,user_id,role)
  VALUES (NEW.organization_id,NEW.id,CASE
    WHEN NEW.roles && ARRAY['issuer-admin','organization_admin'] THEN 'organization_admin'
    WHEN NEW.roles && ARRAY['issuer-operator','issuer'] THEN 'issuer' ELSE 'viewer' END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase1_new_user_membership AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.phase1_new_user_membership();

CREATE FUNCTION public.phase1_object_ownership()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE owner_org UUID; template_org UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.issuer_id IS DISTINCT FROM OLD.issuer_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'Object organization and issuer ownership cannot be reassigned';
  END IF;
  IF NEW.issuer_id IS NOT NULL THEN
    SELECT organization_id INTO owner_org FROM issuers WHERE id = NEW.issuer_id;
    IF owner_org IS NULL THEN RAISE EXCEPTION 'Issuer not found'; END IF;
    IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> owner_org THEN
      RAISE EXCEPTION 'Organization must match issuer';
    END IF;
    NEW.organization_id := owner_org;
  END IF;
  IF TG_TABLE_NAME = 'credentials' THEN
    IF NEW.template_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.template_id IS DISTINCT FROM OLD.template_id) THEN
      SELECT organization_id INTO template_org FROM templates WHERE id = NEW.template_id;
      IF template_org IS DISTINCT FROM NEW.organization_id AND NOT phase1_platform_admin() THEN
        RAISE EXCEPTION 'Template must belong to credential organization';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase1_template_ownership BEFORE INSERT OR UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.phase1_object_ownership();
CREATE TRIGGER phase1_credential_ownership BEFORE INSERT OR UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.phase1_object_ownership();

CREATE FUNCTION public.phase1_prevent_issuer_transfer()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Issuer organization transfers are not supported; existing ownership must be preserved';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase1_prevent_issuer_transfer BEFORE UPDATE ON public.issuers
FOR EACH ROW EXECUTE FUNCTION public.phase1_prevent_issuer_transfer();

CREATE FUNCTION public.phase1_organization_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor UUID; target_org UUID; target_id UUID; action_name TEXT;
BEGIN
  SELECT id INTO actor FROM users WHERE auth_user_id = auth.uid();
  IF actor IS NULL THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'organizations' THEN
    target_org := NEW.id; target_id := NEW.id;
    action_name := CASE WHEN TG_OP = 'INSERT' THEN 'organization.created' ELSE 'organization.updated' END;
  ELSE
    target_org := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
    target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    action_name := CASE TG_OP WHEN 'INSERT' THEN 'organization.member.added'
      WHEN 'DELETE' THEN 'organization.member.removed' ELSE 'organization.member.updated' END;
  END IF;
  INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES (target_org,actor,action_name,TG_TABLE_NAME,target_id,
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END);
  RETURN NULL;
END;
$$;
CREATE TRIGGER phase1_organization_audit AFTER INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.phase1_organization_audit();
CREATE TRIGGER phase1_membership_audit AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.phase1_organization_audit();

CREATE FUNCTION public.phase1_membership_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'Membership identity cannot be reassigned';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER phase1_membership_identity BEFORE UPDATE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.phase1_membership_identity();

-- Replace permissive legacy policies, not merely add restrictive-looking peers.
DO $$ DECLARE p RECORD; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('organizations','organization_members','users','issuers','templates','credentials','revocations','audit_logs')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
REVOKE ALL ON public.organization_members FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
REVOKE DELETE ON public.organizations FROM authenticated;

CREATE POLICY organizations_read ON public.organizations FOR SELECT TO authenticated
USING (phase1_owns_organization(id));
CREATE POLICY organizations_create ON public.organizations FOR INSERT TO authenticated
WITH CHECK (phase1_platform_admin() AND created_by = (SELECT user_id FROM current_app_user()));
CREATE POLICY organizations_update ON public.organizations FOR UPDATE TO authenticated
USING (phase1_platform_admin()) WITH CHECK (phase1_platform_admin());
CREATE POLICY members_read ON public.organization_members FOR SELECT TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()) OR phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY members_create ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY members_update ON public.organization_members FOR UPDATE TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['organization_admin']))
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY members_remove ON public.organization_members FOR DELETE TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY users_read ON public.users FOR SELECT TO authenticated
USING (auth_user_id = auth.uid() OR phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY issuers_read ON public.issuers FOR SELECT TO authenticated
USING (phase1_owns_organization(organization_id));
CREATE POLICY issuers_create ON public.issuers FOR INSERT TO authenticated
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY issuers_update ON public.issuers FOR UPDATE TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['organization_admin']))
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY templates_read ON public.templates FOR SELECT TO authenticated
USING (phase1_owns_organization(organization_id));
CREATE POLICY templates_create ON public.templates FOR INSERT TO authenticated
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY templates_update ON public.templates FOR UPDATE TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['organization_admin']))
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY credentials_read ON public.credentials FOR SELECT TO authenticated
USING (phase1_owns_organization(organization_id));
CREATE POLICY credentials_create ON public.credentials FOR INSERT TO authenticated
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['issuer'])
  AND EXISTS (SELECT 1 FROM issuers i WHERE i.id = issuer_id AND i.status = 'active')
  AND (phase1_platform_admin() OR issuer_id = (SELECT u.issuer_id FROM users u WHERE u.auth_user_id = auth.uid())));
CREATE POLICY credentials_update ON public.credentials FOR UPDATE TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['issuer'])
  AND (phase1_platform_admin() OR issuer_id = (SELECT u.issuer_id FROM users u WHERE u.auth_user_id = auth.uid())))
WITH CHECK (phase1_owns_organization(organization_id, ARRAY['issuer'])
  AND (phase1_platform_admin() OR issuer_id = (SELECT u.issuer_id FROM users u WHERE u.auth_user_id = auth.uid())));
CREATE POLICY revocations_read ON public.revocations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM issuers i WHERE i.id = issuer_id AND phase1_owns_organization(i.organization_id)));
CREATE POLICY revocations_create ON public.revocations FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM credentials c WHERE c.id = credential_id AND c.issuer_id = revocations.issuer_id
  AND phase1_owns_organization(c.organization_id, ARRAY['issuer'])
  AND (phase1_platform_admin() OR c.issuer_id = (SELECT u.issuer_id FROM users u WHERE u.auth_user_id = auth.uid()))));
CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated
USING (phase1_owns_organization(organization_id, ARRAY['organization_admin']));
CREATE POLICY audit_create ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
  AND phase1_owns_organization(organization_id));

-- Invitation RPCs retain legacy aliases; membership triggers translate new users.
-- Reuse membership-backed has_role rather than trusting stale users.roles.
CREATE OR REPLACE FUNCTION public.prepare_issuer_invitation(
  p_organization_id UUID, p_name TEXT, p_slug TEXT, p_email TEXT,
  p_role TEXT, p_actor_id UUID, p_did_uri TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_issuer public.issuers; v_user public.users;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('issuer-admin','issuer-operator','organization_admin','issuer','viewer') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = p_actor_id AND (
      u.roles && ARRAY['platform_admin','platform-admin'] OR EXISTS (
        SELECT 1 FROM organization_members m WHERE m.user_id = u.id
        AND m.organization_id = p_organization_id AND m.role = 'organization_admin'
      )
    )
  ) THEN RAISE EXCEPTION 'Invitation not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id AND status = 'active' AND soft_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Active organization not found';
  END IF;
  SELECT * INTO v_issuer FROM issuers WHERE slug = p_slug FOR UPDATE;
  SELECT * INTO v_user FROM users WHERE email = p_email::citext FOR UPDATE;
  IF v_issuer.id IS NOT NULL OR v_user.id IS NOT NULL THEN
    IF v_issuer.id IS NULL OR v_user.id IS NULL OR v_user.auth_user_id IS NOT NULL
      OR v_user.issuer_id IS DISTINCT FROM v_issuer.id
      OR v_issuer.organization_id IS DISTINCT FROM p_organization_id
      OR v_issuer.name IS DISTINCT FROM p_name OR v_issuer.contact_email IS DISTINCT FROM p_email::citext
      OR v_issuer.did_uri IS DISTINCT FROM p_did_uri OR NOT EXISTS (
        SELECT 1 FROM organization_members m WHERE m.user_id = v_user.id AND m.organization_id = p_organization_id
        AND m.role = CASE p_role WHEN 'issuer-admin' THEN 'organization_admin' WHEN 'issuer-operator' THEN 'issuer' ELSE p_role END
      ) THEN
      RAISE EXCEPTION 'Email or issuer slug already exists; existing accounts cannot be reassigned';
    END IF;
  ELSE
    INSERT INTO issuers (organization_id,name,slug,contact_email,did_uri)
    VALUES (p_organization_id,p_name,p_slug,p_email,p_did_uri) RETURNING * INTO v_issuer;
    INSERT INTO users (organization_id,issuer_id,email,display_name,roles)
    VALUES (p_organization_id,v_issuer.id,p_email,p_name,ARRAY[p_role]) RETURNING * INTO v_user;
    INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,entity_id,metadata)
    VALUES (p_organization_id,v_issuer.id,p_actor_id,'issuer.created','issuer',v_issuer.id,
      jsonb_build_object('role',p_role,'invitation','pending'));
    INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id,metadata)
    SELECT p_organization_id,p_actor_id,'organization.member.added','organization_member',id,
      jsonb_build_object('userId',v_user.id,'role',role)
    FROM organization_members WHERE organization_id = p_organization_id AND user_id = v_user.id;
  END IF;
  RETURN jsonb_build_object('issuer',to_jsonb(v_issuer),'user_id',v_user.id);
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_issuer_invitation(p_user_id UUID,p_auth_user_id UUID,p_actor_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user.id IS NULL OR v_user.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'Invitation profile is missing or already linked'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = p_actor_id AND (
      u.roles && ARRAY['platform_admin','platform-admin'] OR EXISTS (
        SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.organization_id = v_user.organization_id AND m.role = 'organization_admin'
      )
    )
  ) THEN RAISE EXCEPTION 'Invitation not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_user.organization_id AND status = 'active' AND soft_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Active organization not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_auth_user_id AND email::citext = v_user.email) THEN
    RAISE EXCEPTION 'Invitation identity does not match';
  END IF;
  UPDATE users SET auth_user_id = p_auth_user_id WHERE id = p_user_id;
  INSERT INTO audit_logs (organization_id,issuer_id,user_id,action,entity_type,entity_id)
  VALUES (v_user.organization_id,v_user.issuer_id,p_actor_id,'issuer.user_invited','user',p_user_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.has_issuer_admin_role(p_user_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user_uuid = auth.uid() AND has_role('issuer-admin');
$$;
REVOKE ALL ON FUNCTION public.phase1_new_user_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_object_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_prevent_issuer_transfer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_organization_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_membership_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_owns_organization(UUID,TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.phase1_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase1_owns_organization(UUID,TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.phase1_platform_admin() TO authenticated, service_role;

CREATE FUNCTION public.phase1_set_platform_admin(p_user UUID, p_enabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor UUID;
BEGIN
  IF NOT phase1_platform_admin() THEN RAISE EXCEPTION 'Platform admin permission required'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Platform admin boolean is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('phase1-platform-admins',0));
  SELECT id INTO actor FROM users WHERE auth_user_id = auth.uid();
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user) THEN RAISE EXCEPTION 'User not found'; END IF;
  IF NOT p_enabled AND EXISTS (SELECT 1 FROM users WHERE id = p_user AND roles && ARRAY['platform_admin','platform-admin'])
    AND (SELECT count(*) FROM users WHERE roles && ARRAY['platform_admin','platform-admin']) <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last platform administrator';
  END IF;
  UPDATE users SET roles = CASE WHEN p_enabled THEN ARRAY['platform_admin'] ELSE ARRAY[]::TEXT[] END WHERE id = p_user;
  INSERT INTO audit_logs (organization_id,user_id,action,entity_type,entity_id,metadata)
  SELECT organization_id,actor,'user.platform_role.updated','user',id,jsonb_build_object('platformAdmin',p_enabled)
  FROM users WHERE id = p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.phase1_set_platform_admin(UUID,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phase1_set_platform_admin(UUID,BOOLEAN) TO authenticated;
COMMIT;
