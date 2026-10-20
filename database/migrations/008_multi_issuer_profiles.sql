CREATE TABLE issuer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_issuer_id UUID NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  issuer_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  did TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  document_store_address TEXT,
  document_store_network TEXT,
  logo_url TEXT,
  website TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  key_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_issuer_id),
  CHECK (did ~ '^did:web:([a-z0-9]|[a-z0-9][a-z0-9.-]*[a-z0-9])$'),
  CHECK (did <> 'did:web:verifiable.sg'),
  CHECK (left(verification_method, length(did) + 1) = did || '#'),
  CHECK (length(trim(issuer_name)) > 0),
  CHECK (length(trim(display_name)) > 0),
  CHECK (key_reference ~ '^[A-Z][A-Z0-9_]{2,127}$')
);

CREATE INDEX issuer_profiles_owner_active_idx
  ON issuer_profiles (owner_issuer_id, active, created_at DESC);

CREATE UNIQUE INDEX issuer_profiles_did_unique_idx ON issuer_profiles (did);

ALTER TABLE templates
  ADD COLUMN issuer_profile_id UUID,
  ADD CONSTRAINT templates_issuer_profile_owner_fk
    FOREIGN KEY (issuer_profile_id, issuer_id)
    REFERENCES issuer_profiles (id, owner_issuer_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT templates_profile_requires_owner
    CHECK (issuer_profile_id IS NULL OR issuer_id IS NOT NULL);

CREATE INDEX templates_issuer_profile_id_idx ON templates (issuer_profile_id);

ALTER TABLE credentials
  ADD COLUMN issuer_profile_id UUID,
  ADD COLUMN issuer_did TEXT,
  ADD COLUMN document_store_address TEXT,
  ADD COLUMN document_store_network TEXT,
  ADD COLUMN verification_method TEXT,
  ADD CONSTRAINT credentials_issuer_profile_owner_fk
    FOREIGN KEY (issuer_profile_id, issuer_id)
    REFERENCES issuer_profiles (id, owner_issuer_id)
    ON DELETE RESTRICT;

CREATE INDEX credentials_issuer_profile_id_idx ON credentials (issuer_profile_id);

CREATE TRIGGER issuer_profiles_updated_at
  BEFORE UPDATE ON issuer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE issuer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY issuer_profiles_own_select ON issuer_profiles
  FOR SELECT USING (
    owner_issuer_id IN (
      SELECT id FROM issuers WHERE organization_id = current_organization_id()
    )
  );

CREATE POLICY issuer_profiles_admin_write ON issuer_profiles
  FOR ALL USING (
    owner_issuer_id IN (
      SELECT id FROM issuers WHERE organization_id = current_organization_id()
    ) AND has_role('issuer-admin')
  )
  WITH CHECK (
    owner_issuer_id IN (
      SELECT id FROM issuers WHERE organization_id = current_organization_id()
    ) AND has_role('issuer-admin')
  );

GRANT ALL ON issuer_profiles TO service_role;
GRANT SELECT ON issuer_profiles TO authenticated;
