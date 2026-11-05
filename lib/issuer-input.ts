import type { IssuerInput } from "../services/IssuerService";

export function parseIssuerInput(value: unknown, partial = false):
  { input: Partial<IssuerInput>; error?: never } | { error: string; input?: never } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "An issuer object is required." };
  const body = value as Record<string, unknown>;
  const input: Partial<IssuerInput> = {};
  for (const field of ["name", "displayName", "slug", "contactEmail", "description", "website", "logoUrl",
    "verificationMethod", "keyFingerprint", "organizationId", "didUri"] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || raw.length > 2048) return { error: `${field} must be a string of at most 2048 characters.` };
    input[field] = raw.trim();
  }
  if (!partial && (!input.name || !input.slug || !input.contactEmail)) return { error: "name, slug, and contactEmail are required." };
  for (const field of ["name", "displayName", "slug", "contactEmail", "organizationId"] as const) {
    if (input[field] !== undefined && !input[field]) return { error: `${field} cannot be empty.` };
  }
  if (input.slug !== undefined) {
    input.slug = input.slug.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.slug)) return { error: "Issuer code must be 2-63 lowercase letters, numbers, or hyphens." };
  }
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) return { error: "A valid contact email is required." };
  for (const field of ["website", "logoUrl"] as const) {
    if (!input[field]) continue;
    try {
      const url = new URL(input[field]);
      if (!["http:", "https:"].includes(url.protocol)) return { error: `${field} must use HTTP or HTTPS.` };
    } catch { return { error: `${field} must be an absolute URL.` }; }
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !["active", "inactive", "disabled", "suspended", "deleted"].includes(body.status)) {
      return { error: "status must be active, inactive, suspended, or deleted." };
    }
    input.status = body.status as IssuerInput["status"];
  }
  return { input };
}
