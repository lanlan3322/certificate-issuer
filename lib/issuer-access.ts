import type { AuthUser } from "./auth";
import { ForbiddenError } from "./auth";
import { canAccessIssuer } from "./permissions";
import { IssuerService } from "../services/IssuerService";
import { OrganizationService } from "../services/OrganizationService";

export async function requireIssuerAccess(
  user: AuthUser, issuerId: string, capability: "read" | "manage" | "templates" | "issue" | "operate" = "read",
  active = false,
) {
  const issuer = await IssuerService.getById(issuerId);
  if (!issuer || !canAccessIssuer(user, issuer, capability)) throw new ForbiddenError("Issuer access denied.");
  if (active) {
    const organization = await OrganizationService.getById(issuer.organizationId);
    if (!issuer.active || issuer.status !== "active" || !organization ||
      organization.status !== "active" || organization.softDeletedAt) {
      throw new ForbiddenError("An active issuer and organization are required.");
    }
  }
  return issuer;
}
