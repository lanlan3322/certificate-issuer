import { query } from "../lib/db";
export interface TemplateInput { issuerId?: string; slug: string; name: string; description?: string; definition?: Record<string, unknown>; }
export const TemplateService = {
  async list(issuerId?: string) { const result = await query<Record<string, unknown>>(`SELECT * FROM templates ${issuerId ? "WHERE issuer_id=$1 OR issuer_id IS NULL" : ""} ORDER BY created_at DESC`, issuerId ? [issuerId] : []); return result.rows; },
  async create(input: TemplateInput) { const result = await query<Record<string, unknown>>("INSERT INTO templates (issuer_id,slug,name,description,definition) VALUES ($1,$2,$3,$4,$5) RETURNING *", [input.issuerId ?? null, input.slug, input.name, input.description ?? "", JSON.stringify(input.definition ?? {})]); return result.rows[0]; },
};