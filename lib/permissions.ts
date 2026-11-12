export type Role = "platform_admin" | "organization_admin" | "issuer" | "viewer";
export type IssuerMemberRole = "issuer_admin" | "issuer_operator" | "viewer";
export interface IssuerMembership { issuerId: string; role: IssuerMemberRole }
interface PermissionUser {
  roles: readonly string[];
  issuerMemberships?: readonly IssuerMembership[];
  issuerId?: string;
  organizationId?: string;
}
export type Permission =
  | "organizations.manage" | "organizations.read" | "members.manage" | "users.manage"
  | "issuers.manage" | "templates.manage" | "credentials.read"
  | "credentials.issue" | "credentials.revoke" | "credentials.send"
  | "billing.read" | "billing.manage";

const aliases: Record<string, Role> = {
  platform_admin: "platform_admin", "platform-admin": "platform_admin",
  organization_admin: "organization_admin", "issuer-admin": "organization_admin",
  issuer: "issuer", "issuer-operator": "issuer",
  viewer: "viewer", verifier: "viewer",
};

const grants: Record<Role, readonly Permission[]> = {
  platform_admin: ["organizations.manage", "organizations.read", "members.manage", "users.manage",
    "issuers.manage", "templates.manage", "credentials.read", "credentials.issue", "credentials.revoke", "credentials.send", "billing.read", "billing.manage"],
  organization_admin: ["organizations.read", "members.manage", "issuers.manage", "templates.manage", "credentials.read", "credentials.issue", "credentials.revoke", "credentials.send", "billing.read"],
  issuer: ["organizations.read", "credentials.read", "credentials.issue", "credentials.revoke", "credentials.send"],
  viewer: ["organizations.read", "credentials.read"],
};

export function normalizeRoles(roles: readonly string[]): Role[] {
  return [...new Set(roles.flatMap((role) => Object.hasOwn(aliases, role) ? [aliases[role]] : []))];
}

const issuerGrants: Record<IssuerMemberRole, readonly Permission[]> = {
  issuer_admin: ["templates.manage", "credentials.read"],
  issuer_operator: ["credentials.read", "credentials.issue", "credentials.revoke", "credentials.send"],
  viewer: ["credentials.read"],
};

export function hasPermission(user: PermissionUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  const roles = normalizeRoles(user.roles);
  if (roles.some((role) => role !== "issuer" && grants[role].includes(permission))) return true;
  if (user.issuerMemberships !== undefined) {
    return user.issuerMemberships.some((membership) => issuerGrants[membership.role]?.includes(permission));
  }
  return roles.some((role) => grants[role].includes(permission));
}

export function isPlatformAdmin(user: { roles: readonly string[] } | null | undefined): boolean {
  return hasPermission(user, "organizations.manage");
}

export function canAccessOrganization(
  user: { roles: readonly string[]; organizationId: string }, organizationId: string
): boolean {
  return isPlatformAdmin(user) || user.organizationId === organizationId;
}

export function hasLegacyRole(user: { roles: readonly string[] }, role: string): boolean {
  const normalized = Object.hasOwn(aliases, role) ? aliases[role] : undefined;
  return isPlatformAdmin(user) || Boolean(normalized && normalizeRoles(user.roles).includes(normalized));
}

export function canAccessIssuer(
  user: PermissionUser,
  issuer: { id: string; organizationId: string },
  capability: "read" | "manage" | "templates" | "issue" | "operate" = "read",
): boolean {
  if (isPlatformAdmin(user)) return true;
  if (issuer.organizationId !== user.organizationId) return false;
  const roles = normalizeRoles(user.roles);
  if (roles.includes("organization_admin")) return true;
  const membership = user.issuerMemberships?.find((entry) => entry.issuerId === issuer.id);
  if (membership) return capability === "read" ||
    (capability === "templates" && membership.role === "issuer_admin") ||
    ((capability === "issue" || capability === "operate") && membership.role === "issuer_operator");
  if (user.issuerMemberships === undefined && user.issuerId === issuer.id) {
    return capability === "read" || ((capability === "issue" || capability === "operate") && roles.includes("issuer"));
  }
  return capability === "read" && !user.issuerId && !user.issuerMemberships?.length && roles.includes("viewer");
}
