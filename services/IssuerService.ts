import { query } from "../lib/db";

export interface IssuerInput { organizationId: string; name: string; slug: string; contactEmail: string; didUri?: string; }
export interface IssuerRecord extends IssuerInput { id: string; status: "active" | "disabled" | "suspended"; createdAt: string; }

const mapIssuer = (row: Record<string, unknown>): IssuerRecord => ({ id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), slug: String(row.slug), contactEmail: String(row.contact_email), didUri: row.did_uri ? String(row.did_uri) : undefined, status: row.status as IssuerRecord["status"], createdAt: String(row.created_at) });

export const IssuerService = {
  /** Scoped to a single organization — never list across tenants. */
  async list(organizationId: string) {
    const result = await query<Record<string, unknown>>(
      "SELECT * FROM issuers WHERE organization_id=$1 ORDER BY created_at DESC",
      [organizationId]
    );
    return result.rows.map(mapIssuer);
  },

  async create(input: IssuerInput) {
    const result = await query<Record<string, unknown>>(
      "INSERT INTO issuers (organization_id,name,slug,contact_email,did_uri) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [input.organizationId, input.name, input.slug, input.contactEmail, input.didUri ?? null]
    );
    return mapIssuer(result.rows[0]);
  },

  /** The organization_id predicate is the tenant guard — do not remove it. */
  async updateStatus(id: string, status: IssuerRecord["status"], organizationId: string) {
    const result = await query<Record<string, unknown>>(
      "UPDATE issuers SET status=$2 WHERE id=$1 AND organization_id=$3 RETURNING *",
      [id, status, organizationId]
    );
    if (!result.rows[0]) throw new Error("Issuer not found.");
    return mapIssuer(result.rows[0]);
  },

  async update(id: string, organizationId: string, input: { name?: string; contactEmail?: string; didUri?: string | null }) {
    const result = await query<Record<string, unknown>>(
      `UPDATE issuers
       SET name = COALESCE($3, name),
           contact_email = COALESCE($4, contact_email),
           did_uri = COALESCE($5, did_uri)
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [id, organizationId, input.name ?? null, input.contactEmail ?? null, input.didUri ?? null]
    );
    if (!result.rows[0]) throw new Error("Issuer not found.");
    return mapIssuer(result.rows[0]);
  },
};
