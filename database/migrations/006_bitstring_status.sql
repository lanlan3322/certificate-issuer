-- Opt-in only. No existing credentials or revocation records are rewritten.
CREATE TABLE bitstring_status_allocations (
  allocation BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 0 MINVALUE 0) PRIMARY KEY,
  issuer_id UUID NOT NULL REFERENCES issuers(id) ON DELETE RESTRICT,
  external_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bitstring_status_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bitstring_status_allocations FROM anon, authenticated;

CREATE FUNCTION reserve_bitstring_status(p_issuer UUID, p_external TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_allocation BIGINT;
BEGIN
  IF p_external IS NULL OR length(trim(p_external)) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'Invalid credential identifier';
  END IF;
  INSERT INTO bitstring_status_allocations (issuer_id, external_id)
    VALUES (p_issuer, p_external) RETURNING allocation INTO v_allocation;
  RETURN v_allocation;
END;
$$;

-- One statement snapshot: no recipient identifiers or tenant metadata leave SQL.
CREATE FUNCTION read_bitstring_status(p_page INTEGER)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_agg(jsonb_build_object(
    'index', a.allocation % 131072,
    'status', coalesce(c.status::text, 'revoked')
  )) END
  FROM bitstring_status_allocations a
  LEFT JOIN credentials c ON c.external_id = a.external_id AND c.issuer_id = a.issuer_id
  WHERE p_page >= 0 AND a.allocation >= p_page::bigint * 131072
    AND a.allocation < (p_page::bigint + 1) * 131072;
$$;

CREATE FUNCTION apply_bitstring_revocation(
  p_credential UUID, p_issuer UUID, p_action TEXT, p_reason TEXT, p_transaction TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_credential credentials%ROWTYPE; v_log revocations%ROWTYPE; v_next credential_status;
BEGIN
  SELECT * INTO v_credential FROM credentials
    WHERE id = p_credential AND issuer_id = p_issuer FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM bitstring_status_allocations
      WHERE issuer_id = p_issuer AND external_id = v_credential.external_id
  ) THEN RAISE EXCEPTION 'Status credential allocation not found'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('revoke', 'suspend', 'reinstate')
      OR p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Invalid revocation action';
  END IF;
  v_next := CASE p_action WHEN 'revoke' THEN 'revoked'::credential_status
    WHEN 'suspend' THEN 'suspended'::credential_status ELSE 'issued'::credential_status END;
  IF v_credential.status = 'revoked' OR v_credential.status = v_next THEN
    RAISE EXCEPTION 'Invalid credential status transition';
  END IF;
  INSERT INTO revocations (credential_id, issuer_id, action, reason, transaction_hash)
    VALUES (p_credential, p_issuer, p_action, p_reason, p_transaction) RETURNING * INTO v_log;
  UPDATE credentials SET status = v_next WHERE id = p_credential;
  RETURN to_jsonb(v_log) || jsonb_build_object(
    'external_id', v_credential.external_id, 'credential_status', v_next);
END;
$$;

REVOKE ALL ON FUNCTION reserve_bitstring_status(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION read_bitstring_status(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_bitstring_revocation(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_bitstring_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION read_bitstring_status(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION apply_bitstring_revocation(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
