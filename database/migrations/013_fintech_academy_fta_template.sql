-- Run in the Supabase SQL Editor as the database administrator.
-- Reuses the existing fta renderer; does not create an issuer or change signing keys.
DO $$
DECLARE
  target_organization UUID;
  target_issuer UUID;
  saved_template UUID;
  matches INTEGER;
BEGIN
  SELECT count(*), (array_agg(id))[1]
    INTO matches, target_organization
    FROM public.organizations
    WHERE lower(btrim(name)) = 'fintech academy';
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Fintech Academy organization; found %.', matches;
  END IF;
  PERFORM 1 FROM public.organizations
    WHERE id = target_organization AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fintech Academy organization must be active.';
  END IF;

  SELECT count(*), (array_agg(id))[1]
    INTO matches, target_issuer
    FROM public.issuers
    WHERE organization_id = target_organization AND lower(btrim(name)) = 'laurence';
  IF matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Laurence issuer in Fintech Academy; found %.', matches;
  END IF;
  PERFORM 1 FROM public.issuers
    WHERE id = target_issuer AND organization_id = target_organization AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laurence issuer in Fintech Academy must be active.';
  END IF;

  INSERT INTO public.templates (issuer_id, slug, name, description, definition, is_active)
    VALUES (
      target_issuer,
      'fta',
      'FTA Academy',
      'Formal academy-style certificate with signature and seal footer.',
      jsonb_build_object(
        'name', 'FTA Academy',
        'description', 'Formal academy-style certificate with signature and seal footer.',
        'renderer', 'fta',
        'organizationName', 'Fintech Academy'
      ),
      true
    )
    ON CONFLICT (issuer_id, slug) DO NOTHING
    RETURNING id INTO saved_template;

  IF saved_template IS NOT NULL THEN
    INSERT INTO public.audit_logs (organization_id, issuer_id, action, entity_type, entity_id, metadata)
      VALUES (
        target_organization, target_issuer, 'template.saved', 'template', saved_template,
        jsonb_build_object('slug', 'fta', 'name', 'FTA Academy', 'source', '013_fintech_academy_fta_template')
      );
  ELSE
    PERFORM 1 FROM public.templates
      WHERE issuer_id = target_issuer AND slug = 'fta' AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Laurence already has an inactive FTA template. Review and activate it explicitly.';
    END IF;
  END IF;
END;
$$;

-- Confirm the persisted organization/issuer link after execution.
SELECT t.id, t.name, t.slug, t.is_active, i.name AS issuer_name, o.name AS organization_name
  FROM public.templates t
  JOIN public.issuers i ON i.id = t.issuer_id
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE lower(btrim(o.name)) = 'fintech academy'
    AND lower(btrim(i.name)) = 'laurence'
    AND t.slug = 'fta';
