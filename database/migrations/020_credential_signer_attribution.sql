BEGIN;

-- Project immutable issuance snapshots without rewriting historical signed JSON.
ALTER TABLE public.credentials
  ADD COLUMN issuer_name TEXT GENERATED ALWAYS AS
    (coalesce(issuer_snapshot->>'issuerDisplayName',issuer_snapshot->>'issuerName')) STORED,
  ADD COLUMN did_used TEXT GENERATED ALWAYS AS
    (coalesce(issuer_snapshot->>'didUsed',issuer_did)) STORED,
  ADD COLUMN key_fingerprint TEXT GENERATED ALWAYS AS
    (issuer_snapshot->>'keyFingerprint') STORED,
  ADD COLUMN key_version INTEGER GENERATED ALWAYS AS
    ((issuer_snapshot->>'keyVersion')::integer) STORED;

COMMIT;
