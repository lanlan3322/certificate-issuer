import { query } from "../lib/db";

export interface IssuerInput { organizationId: string; name: string; slug: string; contactEmail: string; didUri?: string; }
export interface IssuerRecord extends IssuerInput { id: string; status: "active" | "disabled" | "suspended"; createdAt: string; }
const mapIssuer = (row: Record<string, unknown>): IssuerRecord => ({ id: String(row.id), organizationId: String(row.organization_id), name: String(row.name), slug: String(row.slug), contactEmail: String(row.contact_email), didUri: row.did_uri ? String(row.did_uri) : undefined, status: row.status as IssuerRecord["status"], createdAt: String(row.created_at) });
export const IssuerService = {
  async list() { return (await query<Record<string, unknown>>("SELECT * FROM issuers ORDER BY created_at DESC")).rows.map(mapIssuer); },
  async create(input: IssuerInput) { const result = await query<Record<string, unknown>>("INSERT INTO issuers (organization_id,name,slug,contact_email,did_uri) VALUES ($1,$2,$3,$4,$5) RETURNING *", [input.organizationId, input.name, input.slug, input.contactEmail, input.didUri ?? null]); return mapIssuer(result.rows[0]); },
  async updateStatus(id: string, status: IssuerRecord["status"]) { const result = await query<Record<string, unknown>>("UPDATE issuers SET status=$2 WHERE id=$1 RETURNING *", [id, status]); if (!result.rows[0]) throw new Error("Issuer not found."); return mapIssuer(result.rows[0]); },
};