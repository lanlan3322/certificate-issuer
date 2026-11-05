import type { OrganizationInput } from "../services/OrganizationService";

export function parseOrganizationInput(value: unknown, partial = false): Partial<OrganizationInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("An organization object is required.");
  const body = value as Record<string, unknown>;
  const result: Partial<OrganizationInput> = {};
  for (const field of ["name", "displayName", "slug"] as const) {
    if (body[field] === undefined && partial) continue;
    if (field === "displayName" && body[field] === undefined) continue;
    if (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 200) {
      throw new Error(`${field} must be a non-empty string of at most 200 characters.`);
    }
    result[field] = body[field].trim();
  }
  if (result.slug && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(result.slug)) {
    throw new Error("Slug must be 2-63 lowercase letters, numbers, or hyphens.");
  }
  for (const field of ["website", "logoUrl"] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null || body[field] === "") { result[field] = null; continue; }
    if (typeof body[field] !== "string" || body[field].length > 2048) throw new Error(`${field} must be a URL.`);
    const url = new URL(body[field]);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error(`${field} must be an HTTP or HTTPS URL without credentials.`);
    }
    result[field] = url.href;
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") throw new Error("status must be active or disabled.");
    result.status = body.status;
  }
  if (!Object.keys(result).length) throw new Error("No organization changes provided.");
  return result;
}

export function organizationIdFromRequest(request: Request): string {
  const match = new URL(request.url).pathname.match(/\/organizations\/([0-9a-f-]{36})(?:\/|$)/i);
  if (!match || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match[1])) {
    throw new Error("A valid organization ID is required.");
  }
  return match[1];
}
