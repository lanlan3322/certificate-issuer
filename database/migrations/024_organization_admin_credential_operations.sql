BEGIN;

ALTER POLICY credentials_update ON public.credentials
  USING (
    (phase2_issuer_access(issuer_id, 'operate')
      OR phase1_owns_organization(organization_id, ARRAY['organization_admin']))
    AND phase2_active_issuer(issuer_id)
  )
  WITH CHECK (
    (phase2_issuer_access(issuer_id, 'operate')
      OR phase1_owns_organization(organization_id, ARRAY['organization_admin']))
    AND phase2_active_issuer(issuer_id)
  );

ALTER POLICY revocations_create ON public.revocations
  WITH CHECK (
    phase2_active_issuer(issuer_id)
    AND EXISTS (
      SELECT 1 FROM credentials c
      WHERE c.id = credential_id AND c.issuer_id = revocations.issuer_id
        AND (phase2_issuer_access(revocations.issuer_id, 'operate')
          OR phase1_owns_organization(c.organization_id, ARRAY['organization_admin']))
    )
  );

COMMIT;
