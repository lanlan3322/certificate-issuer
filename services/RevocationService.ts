import { transaction } from "../lib/db";
export const RevocationService = {
  async create(input: { credentialId: string; issuerId: string; action: "revoke" | "suspend" | "reinstate"; reason: string; transactionHash?: string; }) {
    return transaction(async (client) => { const log = await client.query("INSERT INTO revocations (credential_id,issuer_id,action,reason,transaction_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *", [input.credentialId, input.issuerId, input.action, input.reason, input.transactionHash ?? null]); const status = input.action === "reinstate" ? "issued" : input.action === "suspend" ? "suspended" : "revoked"; await client.query("UPDATE credentials SET status=$2 WHERE id=$1", [input.credentialId, status]); return log.rows[0]; });
  },
};