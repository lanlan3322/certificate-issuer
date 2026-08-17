import { query } from "../lib/db";

export const VerificationService = {
  async log(input: { credentialId?: string; externalId?: string; verified: boolean; result: Record<string, unknown>; sourceIp?: string }) {
    const result = await query<Record<string, unknown>>("INSERT INTO verification_logs (credential_id,credential_external_id,verified,result,source_ip) VALUES ($1,$2,$3,$4,$5) RETURNING *", [input.credentialId ?? null, input.externalId ?? null, input.verified, JSON.stringify(input.result), input.sourceIp ?? null]);
    return result.rows[0];
  },
  async findByExternalId(externalId: string) {
    const result = await query<Record<string, unknown>>("SELECT * FROM credentials WHERE external_id=$1 LIMIT 1", [externalId]);
    return result.rows[0] ?? null;
  },
};