import { hasPermission, type Permission } from "./permissions";

interface NavigationItem {
  href: string;
  label: string;
  description: string;
  permission?: Permission;
}

export const publicNavigation: NavigationItem[] = [
  { href: "/", label: "Platform", description: "Credential-as-a-Service for your organization" },
  { href: "/verify", label: "Verify", description: "Check credential authenticity and status" },
  { href: "/enterprise", label: "Plans", description: "Explore credential programme options" },
  { href: "/docs/user-manual", label: "Help", description: "Guides for your credential workflows" },
];

const groups: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Credentials", items: [
    { href: "/dashboard", label: "Credential overview", description: "Find, download and manage issued credentials" },
    { href: "/insurance", label: "Issue credentials", description: "Issue one credential or a batch", permission: "credentials.issue" },
    { href: "/branding", label: "Templates", description: "Browse your organization's credential designs" },
    { href: "/templates/builder", label: "Template builder", description: "Create and maintain credential templates", permission: "templates.manage" },
    { href: "/revocation", label: "Credential status", description: "Review revocations and lifecycle changes" },
    { href: "/wallet", label: "Sharing & delivery", description: "Download and email signed credentials" },
    { href: "/bulk", label: "Batch data preview", description: "Validate a batch before issuing", permission: "credentials.issue" },
    { href: "/verification", label: "JSON inspector", description: "Inspect credential data without verification" },
  ] },
  { label: "Administration", items: [
    { href: "/organizations", label: "Organizations", description: "Manage organizations and memberships", permission: "members.manage" },
    { href: "/admin", label: "Issuers", description: "Manage issuer profiles and user assignments", permission: "issuers.manage" },
    { href: "/organization-did", label: "Organization DID", description: "View managed identity and issuer verification methods" },
    { href: "/audit", label: "Activity & audit", description: "Review organization activity", permission: "members.manage" },
    { href: "/platform", label: "Platform overview", description: "Review platform operations", permission: "organizations.manage" },
  ] },
  { label: "Account & support", items: [
    { href: "/profile", label: "My profile", description: "Manage your profile and account security" },
    { href: "/docs/user-manual", label: "User guide", description: "Learn credential workflows" },
    { href: "/docs/admin-manual", label: "Admin guide", description: "Configure organization access", permission: "members.manage" },
    { href: "/contact", label: "Contact support", description: "Get help with your credential programme" },
  ] },
];

export function normalizePagePath(path: string | null | undefined) {
  return path?.replace(/\/+$/, "") || "/";
}

export function workspaceNavigation(user: { roles: readonly string[] } | null) {
  if (!user) return [];
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(user, item.permission))
      .map((item) => item.href === "/organizations" && !hasPermission(user, "organizations.manage")
        ? { ...item, label: "My organization" } : item),
  })).filter((group) => group.items.length > 0);
}

const tools: NavigationItem[] = [
  { href: "/bulk", label: "Batch validation preview", description: "Preview batch data without issuing credentials" },
  { href: "/verification", label: "JSON inspector", description: "Inspect credential data without verification" },
  { href: "/issuer", label: "Workspace access", description: "Sign in to your organization's workspace" },
  { href: "/release-notes", label: "Release notes", description: "Product updates" },
  { href: "/privacy", label: "Privacy policy", description: "How information is handled" },
  { href: "/terms", label: "Terms of service", description: "Terms for using Verifiable.sg" },
];

export function pageNavigation(pathname: string | null) {
  const path = normalizePagePath(pathname);
  return [...publicNavigation, ...groups.flatMap((group) => group.items), ...tools].find((item) => item.href === path);
}

export function isWorkspacePage(pathname: string | null) {
  const path = normalizePagePath(pathname);
  return groups.slice(0, 2).flatMap((group) => group.items).some((item) => item.href === path)
    || ["/profile", "/bulk", "/verification", "/issuer"].includes(path);
}
