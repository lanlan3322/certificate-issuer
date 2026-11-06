BEGIN;

CREATE TABLE public.organization_document_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  network TEXT NOT NULL CHECK (network='sepolia'),
  contract_address TEXT NOT NULL CHECK (contract_address ~ '^0x[0-9a-f]{40}$'
    AND contract_address<>'0x0000000000000000000000000000000000000000'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','inactive','active')),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  connection_status TEXT NOT NULL DEFAULT 'untested' CHECK (connection_status IN ('untested','ok','error')),
  checked_at TIMESTAMPTZ,
  validation_message TEXT,
  signer_address TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(network,contract_address)
);
CREATE UNIQUE INDEX organization_one_active_store ON public.organization_document_stores(organization_id) WHERE status='active';
ALTER TABLE public.organization_document_stores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_document_stores FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.organization_document_stores TO authenticated,service_role;
CREATE POLICY organization_stores_read ON public.organization_document_stores FOR SELECT TO authenticated
USING (phase1_platform_admin() OR phase1_owns_organization(organization_id));

CREATE FUNCTION public.organization_store_action(p_org UUID,p_actor UUID,p_action TEXT,p_store UUID DEFAULT NULL,p_payload JSONB DEFAULT '{}')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE store organization_document_stores; org organizations; platform BOOLEAN;
BEGIN
  SELECT * INTO org FROM organizations WHERE id=p_org FOR UPDATE;
  SELECT coalesce(roles && ARRAY['platform_admin','platform-admin'],false) INTO platform FROM users WHERE id=p_actor;
  IF org.id IS NULL OR NOT coalesce(platform,false) AND NOT EXISTS (
    SELECT 1 FROM users u JOIN organization_members m ON m.user_id=u.id
    WHERE u.id=p_actor AND u.organization_id=p_org AND m.organization_id=p_org
      AND m.role='organization_admin' AND org.status='active' AND org.soft_deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Document Store administration denied'; END IF;
  IF p_action='add' THEN
    INSERT INTO organization_document_stores(organization_id,network,contract_address,created_by)
    VALUES(p_org,p_payload->>'network',p_payload->>'address',p_actor) RETURNING * INTO store;
  ELSE
    SELECT * INTO store FROM organization_document_stores WHERE id=p_store AND organization_id=p_org FOR UPDATE;
    IF store.id IS NULL THEN RAISE EXCEPTION 'Organization Document Store not found'; END IF;
    IF p_action='approve' THEN
      IF NOT coalesce(platform,false) THEN RAISE EXCEPTION 'Platform approval required'; END IF;
      UPDATE organization_document_stores SET approved_by=p_actor,approved_at=now(),
        status=CASE WHEN status='pending' THEN 'inactive' ELSE status END WHERE id=store.id;
    ELSIF p_action='test' THEN
      UPDATE organization_document_stores SET connection_status=CASE WHEN (p_payload->>'ok')::boolean THEN 'ok' ELSE 'error' END,
        checked_at=now(),signer_address=p_payload->>'signer',
        validation_message=CASE WHEN (p_payload->>'ok')::boolean
          THEN 'Sepolia contract reads and server wallet issuer/revoker roles verified.'
          ELSE 'Connection test failed. Check Sepolia contract, RPC and server wallet roles.' END WHERE id=store.id;
    ELSIF p_action='activate' THEN
      IF org.status<>'active' OR org.soft_deleted_at IS NOT NULL OR store.approved_by IS NULL
        OR store.connection_status<>'ok' OR store.checked_at IS NULL OR store.checked_at<now()-interval '10 minutes' THEN
        RAISE EXCEPTION 'Active organization, platform approval and recent successful test required';
      END IF;
      UPDATE organization_document_stores SET status='inactive' WHERE organization_id=p_org AND status='active';
      UPDATE organization_document_stores SET status='active' WHERE id=store.id;
    ELSIF p_action='deactivate' THEN
      UPDATE organization_document_stores SET status=CASE WHEN approved_by IS NULL THEN 'pending' ELSE 'inactive' END WHERE id=store.id;
    ELSE RAISE EXCEPTION 'Unsupported Document Store action';
    END IF;
  END IF;
  INSERT INTO audit_logs(organization_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(p_org,p_actor,'organization.document_store.' || p_action,'organization_document_store',store.id,
    jsonb_build_object('network',store.network,'address',store.contract_address));
END;
$$;
REVOKE ALL ON FUNCTION public.organization_store_action(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.organization_store_action(UUID,UUID,TEXT,UUID,JSONB) TO service_role;

ALTER TABLE public.credentials ADD COLUMN organization_document_store_id UUID
  REFERENCES public.organization_document_stores(id) ON DELETE RESTRICT;
CREATE FUNCTION public.organization_credential_store()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE store organization_document_stores;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.organization_document_store_id IS DISTINCT FROM OLD.organization_document_store_id THEN
      RAISE EXCEPTION 'Credential Document Store ownership is immutable';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO store FROM organization_document_stores WHERE organization_id=NEW.organization_id AND status='active';
  IF NEW.organization_document_store_id IS NOT NULL OR store.id IS NOT NULL THEN
    IF store.id IS NULL OR NEW.organization_document_store_id IS DISTINCT FROM store.id OR store.approved_by IS NULL
      OR store.connection_status<>'ok' OR NEW.document_store_address IS DISTINCT FROM store.contract_address
      OR NEW.document_store_network IS DISTINCT FROM store.network THEN
      RAISE EXCEPTION 'Active organization Document Store snapshot required';
    END IF;
    NEW.issuer_snapshot:=NEW.issuer_snapshot || jsonb_build_object('documentStoreId',store.id,
      'documentStoreAddress',store.contract_address,'documentStoreNetwork',store.network);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.organization_credential_store() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER phase6_credential_store BEFORE INSERT OR UPDATE ON public.credentials
FOR EACH ROW EXECUTE FUNCTION public.organization_credential_store();

COMMIT;
