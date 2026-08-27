import { query } from "../lib/db";

export interface TemplateInput {
  issuerId: string;
  slug: string;
  name: string;
  description?: string;
  definition?: Record<string, unknown>;
}

export interface TemplateRecord {
  id: string;
  issuerId: string | null;
  slug: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

const mapTemplate = (row: Record<string, unknown>): TemplateRecord => ({
  id: String(row.id),
  issuerId: row.issuer_id ? String(row.issuer_id) : null,
  slug: String(row.slug),
  name: String(row.name),
  description: row.description ? String(row.description) : "",
  definition: (row.definition as Record<string, unknown>) ?? {},
  isActive: row.is_active !== false,
  createdAt: String(row.created_at),
});

export const TemplateService = {
  /** Returns the issuer's templates plus the shared platform templates. */
  async list(issuerId: string, options: { includeInactive?: boolean } = {}) {
    const result = await query<Record<string, unknown>>(
      `SELECT * FROM templates
       WHERE (issuer_id = $1 OR issuer_id IS NULL)
         AND ($2::boolean OR is_active = true)
       ORDER BY created_at DESC`,
      [issuerId, options.includeInactive ?? false]
    );
    return result.rows.map(mapTemplate);
  },

  async get(id: string, issuerId: string) {
    const result = await query<Record<string, unknown>>(
      "SELECT * FROM templates WHERE id=$1 AND (issuer_id=$2 OR issuer_id IS NULL) LIMIT 1",
      [id, issuerId]
    );
    return result.rows[0] ? mapTemplate(result.rows[0]) : null;
  },

  async create(input: TemplateInput) {
    const result = await query<Record<string, unknown>>(
      "INSERT INTO templates (issuer_id,slug,name,description,definition) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [input.issuerId, input.slug, input.name, input.description ?? "", JSON.stringify(input.definition ?? {})]
    );
    return mapTemplate(result.rows[0]);
  },

  /** Upsert on (issuer_id, slug) so the builder can re-save the same template. */
  async upsert(input: TemplateInput) {
    const result = await query<Record<string, unknown>>(
      `INSERT INTO templates (issuer_id,slug,name,description,definition)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (issuer_id, slug)
       DO UPDATE SET name = EXCLUDED.name,
                     description = EXCLUDED.description,
                     definition = EXCLUDED.definition,
                     is_active = true
       RETURNING *`,
      [input.issuerId, input.slug, input.name, input.description ?? "", JSON.stringify(input.definition ?? {})]
    );
    return mapTemplate(result.rows[0]);
  },

  /** Soft delete — platform templates (issuer_id IS NULL) are not deletable. */
  async deactivate(id: string, issuerId: string) {
    const result = await query<Record<string, unknown>>(
      "UPDATE templates SET is_active=false WHERE id=$1 AND issuer_id=$2 RETURNING *",
      [id, issuerId]
    );
    if (!result.rows[0]) throw new Error("Template not found.");
    return mapTemplate(result.rows[0]);
  },
};
