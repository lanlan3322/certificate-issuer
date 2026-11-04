-- Run in the Supabase SQL Editor as the database administrator.
-- Rename the existing FTA template and issuer-profile display values without
-- changing issuer identities, keys, or previously issued credentials.
UPDATE public.issuer_profiles
  SET issuer_name = CASE
        WHEN issuer_name = 'FTA Academy' THEN 'Fintech Academy'
        ELSE issuer_name
      END,
      display_name = CASE
        WHEN display_name = 'FTA Academy' THEN 'Fintech Academy'
        ELSE display_name
      END,
      updated_at = now()
  WHERE issuer_name = 'FTA Academy'
     OR display_name = 'FTA Academy';

UPDATE public.templates
  SET name = CASE
        WHEN name = 'FTA Academy' THEN 'Fintech Academy'
        ELSE name
      END,
      definition = CASE
        WHEN jsonb_typeof(definition) = 'object'
          AND definition ->> 'name' = 'FTA Academy'
        THEN jsonb_set(definition, '{name}', to_jsonb('Fintech Academy'::text))
        ELSE definition
      END,
      updated_at = now()
  WHERE slug = 'fta'
    AND (
      name = 'FTA Academy'
      OR (
        jsonb_typeof(definition) = 'object'
        AND definition ->> 'name' = 'FTA Academy'
      )
    );
