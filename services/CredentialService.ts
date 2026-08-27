import { query } from "../lib/db";

export interface CredentialInput {
  issuerId: string;
  templateId?: string;
  externalId: string;
  recipientName: string;
  recipientEmail: string;
  credential: Record<string, unknown>;
  documentHash?: string;
  issuingMethods?: string[];
  validFrom?: string;
  validUntil?: string;
}

export interface CredentialRecord {
  id: string;
  issuerId: string;
  templateId: string | null;
  externalId: string;
  recipientName: string;
  recipientEmail: string;
  credential: Record<string, unknown>;
  documentHash: string | null;
  issuingMethods: string[];
  status: "issued" | "revoked" | "suspended" | "expired";
  issuedAt: string;
  validFrom: string | null;
  validUntil: string | null;
}

export class DuplicateCredentialError extends Error {}

const mapCredential = (row: Record<string, unknown>): CredentialRecord => ({
  id: String(row.id),
  issuerId: String(row.issuer_id),
  templateId: row.template_id ? String(row.template_id) : null,
  externalId: String(row.external_id),
  recipientName: String(row.recipient_name),
  recipientEmail: String(row.recipient_email),
  credential: (row.credential as Record<string, unknown>) ?? {},
  documentHash: row.document_hash ? String(row.document_hash) : null,
  issuingMethods: (row.issuing_methods as string[]) ?? [],
  status: row.status as CredentialRecord["status"],
  issuedAt: String(row.issued_at),
  validFrom: row.valid_from ? String(row.valid_from) : null,
  validUntil: row.valid_until ? String(row.valid_until) : null,
});

export const CredentialService = {
  async list(issuerId: string, options: { limit?: number; status?: string } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM credentials
       WHERE issuer_id = $1 AND ($2::text IS NULL OR status::text = $2)
       ORDER BY issued_at DESC LIMIT $3`,
      [issuerId, options.status ?? null, limit]
    );
    return result.rows.map(mapCredential);
  },

  async get(id: string, issuerId: string) {
    const result = await query<Record<string, unknown>>(
      "SELECT * FROM credentials WHERE id=$1 AND issuer_id=$2 LIMIT 1",
      [id, issuerId]
    );
    return result.rows[0] ? mapCredential(result.rows[0]) : null;
  },

  async findByExternalId(externalId: string) {
    const result = await query<Record<string, unknown>>(
      "SELECT * FROM credentials WHERE external_id=$1 LIMIT 1",
      [externalId]
    );
    return result.rows[0] ? mapCredential(result.rows[0]) : null;
  },

  async create(input: CredentialInput) {
    try {
      const result = await query<Record<string, unknown>>(
        `INSERT INTO credentials
           (issuer_id,template_id,external_id,recipient_name,recipient_email,credential,document_hash,issuing_methods,valid_from,valid_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          input.issuerId,
          input.templateId ?? null,
          input.externalId,
          input.recipientName,
          input.recipientEmail,
          JSON.stringify(input.credential),
          input.documentHash ?? null,
          input.issuingMethods ?? [],
          input.validFrom ?? null,
          input.validUntil ?? null,
        ]
      );
      return mapCredential(result.rows[0]);
    } catch (error) {
      // 23505 = unique_violation on credentials.external_id
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
        throw new DuplicateCredentialError("A credential with this identifier has already been issued.");
      }
      throw error;
    }
  },

  /** Records the on-chain anchor once the wallet transaction confirms. */
  async attachDocumentHash(externalId: string, issuerId: string, documentHash: string) {
    const result = await query<Record<string, unknown>>(
      "UPDATE credentials SET document_hash=$3 WHERE external_id=$1 AND issuer_id=$2 RETURNING *",
      [externalId, issuerId, documentHash]
    );
    return result.rows[0] ? mapCredential(result.rows[0]) : null;
  },

  /** Marks credentials past valid_until as expired. Safe to run repeatedly. */
  async expireOverdue(issuerId?: string) {
    const result = await query<{ id: string }>(
      `UPDATE credentials SET status='expired'
       WHERE status='issued' AND valid_until IS NOT NULL AND valid_until < now()
         AND ($1::uuid IS NULL OR issuer_id = $1)
       RETURNING id`,
      [issuerId ?? null]
    );
    return result.rowCount ?? 0;
  },
};
