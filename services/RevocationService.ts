import { transaction, query } from "../lib/db";

export type RevocationAction = "revoke" | "suspend" | "reinstate";

export interface RevocationRecord {
  id: string;
  credentialId: string;
  issuerId: string;
  action: RevocationAction;
  reason: string;
  transactionHash: string | null;
  createdAt: string;
}

export class RevocationStateError extends Error {}
export class CredentialNotFoundError extends Error {}

const STATUS_FOR_ACTION: Record<RevocationAction, string> = {
  revoke: "revoked",
  suspend: "suspended",
  reinstate: "issued",
};

const mapRecord = (row: Record<string, unknown>): RevocationRecord => ({
  id: String(row.id),
  credentialId: String(row.credential_id),
  issuerId: String(row.issuer_id),
  action: row.action as RevocationAction,
  reason: row.reason ? String(row.reason) : "",
  transactionHash: row.transaction_hash ? String(row.transaction_hash) : null,
  createdAt: String(row.created_at),
});

export const RevocationService = {
  async list(issuerId: string, limit = 100) {
    const result = await query<Record<string, unknown>>(
      `SELECT r.*, c.external_id, c.status AS credential_status
       FROM revocations r
       JOIN credentials c ON c.id = r.credential_id
       WHERE r.issuer_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [issuerId, Math.min(Math.max(limit, 1), 500)]
    );
    return result.rows.map((row) => ({
      ...mapRecord(row),
      externalId: String(row.external_id),
      credentialStatus: String(row.credential_status),
    }));
  },

  /**
   * Applies a revocation action atomically. The credential row is locked for
   * the duration so concurrent requests cannot both pass the state check.
   * `credentialRef` may be a credentials.id or an external_id.
   */
  async apply(input: {
    credentialRef: string;
    issuerId: string;
    action: RevocationAction;
    reason: string;
    transactionHash?: string;
  }) {
    return transaction(async (client) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.credentialRef);
      const found = await client.query<{ id: string; status: string; external_id: string }>(
        `SELECT id, status, external_id FROM credentials
         WHERE issuer_id = $2 AND (${isUuid ? "id = $1::uuid" : "external_id = $1"})
         FOR UPDATE`,
        [input.credentialRef, input.issuerId]
      );

      const credential = found.rows[0];
      if (!credential) throw new CredentialNotFoundError("Credential not found for this issuer.");

      const nextStatus = STATUS_FOR_ACTION[input.action];
      if (credential.status === "revoked" && input.action !== "reinstate") {
        throw new RevocationStateError("Credential is already revoked.");
      }
      if (credential.status === "revoked" && input.action === "reinstate") {
        throw new RevocationStateError("A revoked credential cannot be reinstated.");
      }
      if (credential.status === nextStatus) {
        throw new RevocationStateError(`Credential is already ${nextStatus}.`);
      }

      const log = await client.query<Record<string, unknown>>(
        "INSERT INTO revocations (credential_id,issuer_id,action,reason,transaction_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [credential.id, input.issuerId, input.action, input.reason, input.transactionHash ?? null]
      );
      await client.query("UPDATE credentials SET status=$2 WHERE id=$1", [credential.id, nextStatus]);

      return {
        ...mapRecord(log.rows[0]),
        externalId: credential.external_id,
        credentialStatus: nextStatus,
      };
    });
  },
};
