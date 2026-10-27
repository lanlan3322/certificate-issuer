ALTER TABLE public.users ADD COLUMN issuer_id UUID;
ALTER TABLE public.issuers ADD CONSTRAINT issuers_id_org_unique UNIQUE (id, organization_id);
ALTER TABLE public.users ADD CONSTRAINT users_issuer_org_fk
  FOREIGN KEY (issuer_id, organization_id) REFERENCES public.issuers(id, organization_id)
  ON UPDATE CASCADE;

UPDATE public.users u SET issuer_id = (
  SELECT min(i.id::text)::uuid FROM public.issuers i
  WHERE i.organization_id = u.organization_id HAVING count(*) = 1
);

-- Reserve the issuer and login profile atomically before sending an invitation.
-- An identical retry can resume an invitation that has not been linked yet.
CREATE FUNCTION public.prepare_issuer_invitation(
  p_organization_id UUID, p_name TEXT, p_slug TEXT, p_email TEXT,
  p_role TEXT, p_actor_id UUID, p_did_uri TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_issuer public.issuers;
  v_user public.users;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('issuer-admin', 'issuer-operator') THEN
    RAISE EXCEPTION 'Invalid invitation role';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_actor_id AND (
      'platform-admin' = ANY(roles) OR (
        organization_id = p_organization_id AND 'issuer-admin' = ANY(roles)
      )
    )
  ) THEN RAISE EXCEPTION 'Invitation not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id AND status = 'active') THEN
    RAISE EXCEPTION 'Active organization not found';
  END IF;
  SELECT * INTO v_issuer FROM issuers WHERE slug = p_slug FOR UPDATE;
  SELECT * INTO v_user FROM users WHERE email = p_email::citext FOR UPDATE;
  IF v_issuer.id IS NOT NULL OR v_user.id IS NOT NULL THEN
    IF v_issuer.id IS NULL OR v_user.id IS NULL OR v_user.auth_user_id IS NOT NULL
      OR v_user.issuer_id IS DISTINCT FROM v_issuer.id
      OR v_issuer.organization_id IS DISTINCT FROM p_organization_id
      OR v_issuer.name IS DISTINCT FROM p_name
      OR v_issuer.contact_email IS DISTINCT FROM p_email::citext
      OR v_issuer.did_uri IS DISTINCT FROM p_did_uri
      OR v_user.roles IS DISTINCT FROM ARRAY[p_role] THEN
      RAISE EXCEPTION 'Email or issuer slug already exists; existing accounts cannot be reassigned';
    END IF;
  ELSE
    INSERT INTO issuers (organization_id, name, slug, contact_email, did_uri)
      VALUES (p_organization_id, p_name, p_slug, p_email, p_did_uri) RETURNING * INTO v_issuer;
    INSERT INTO users (organization_id, issuer_id, email, display_name, roles)
      VALUES (p_organization_id, v_issuer.id, p_email, p_name, ARRAY[p_role])
      RETURNING * INTO v_user;
    INSERT INTO audit_logs (organization_id, issuer_id, user_id, action, entity_type, entity_id, metadata)
      VALUES (p_organization_id, v_issuer.id, p_actor_id, 'issuer.created', 'issuer', v_issuer.id,
        jsonb_build_object('role', p_role, 'invitation', 'pending'));
  END IF;
  RETURN jsonb_build_object('issuer', to_jsonb(v_issuer), 'user_id', v_user.id);
END;
$$;

CREATE FUNCTION public.complete_issuer_invitation(p_user_id UUID, p_auth_user_id UUID, p_actor_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.users;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_user.id IS NULL OR v_user.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation profile is missing or already linked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_actor_id AND (
      'platform-admin' = ANY(roles) OR (
        organization_id = v_user.organization_id AND 'issuer-admin' = ANY(roles)
      )
    )
  ) THEN RAISE EXCEPTION 'Invitation not authorized'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_auth_user_id AND email::citext = v_user.email
  ) THEN RAISE EXCEPTION 'Invitation identity does not match'; END IF;
  UPDATE users SET auth_user_id = p_auth_user_id WHERE id = p_user_id;
  INSERT INTO audit_logs (organization_id, issuer_id, user_id, action, entity_type, entity_id)
    VALUES (v_user.organization_id, v_user.issuer_id, p_actor_id, 'issuer.user_invited', 'user', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_issuer_invitation(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_issuer_invitation(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_issuer_invitation(UUID,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_issuer_invitation(UUID,UUID,UUID) TO service_role;
