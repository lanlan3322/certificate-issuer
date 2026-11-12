BEGIN;

ALTER POLICY credentials_create ON public.credentials
  WITH CHECK (
    (phase2_issuer_access(issuer_id, 'operate')
      OR phase1_owns_organization(organization_id, ARRAY['organization_admin']))
    AND phase2_active_issuer(issuer_id)
  );

COMMIT;
