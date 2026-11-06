import { hasPermission, type IssuerMembership, type Permission } from "./permissions";

interface NavigationItem {
  href: string;
  label: string;
  description: string;
  permission?: Permission;
}

export const publicNavigation: NavigationItem[] = [
  { href: "/", label: "Home", description: "Credential-as-a-Service for your organization" },
  { href: "/solutions", label: "Solutions", description: "Credential programmes for your industry" },
  { href: "/platform", label: "Platform", description: "Explore credential infrastructure capabilities" },
  { href: "/pricing", label: "Pricing", description: "Plans for organizational growth" },
  { href: "/partners", label: "Partners", description: "Build a digital credential ecosystem" },
  { href: "/resources", label: "Resources", description: "Guides and answers for credential teams" },
  { href: "/about", label: "About", description: "IBS Digital Credential Services" },
  { href: "/contact", label: "Contact", description: "Demo, consultation and support" },
];

const groups: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Workspace", items: [
    { href: "/dashboard", label: "Dashboard", description: "Review your credential programme and operational status" },
    { href: "/organizations", label: "Organizations", description: "Manage organizations and memberships", permission: "organizations.manage" },
    { href: "/admin", label: "Issuers", description: "Manage issuer profiles and user assignments", permission: "issuers.manage" },
    { href: "/branding", label: "Templates", description: "Browse your organization's credential designs", permission: "templates.manage" },
    { href: "/insurance", label: "Issue Credential", description: "Issue one credential or a batch", permission: "credentials.issue" },
    { href: "/credentials", label: "Credentials", description: "Find, download and manage issued credentials" },
    { href: "/verify", label: "Verification", description: "Check credential authenticity and status" },
  ] },
  { label: "Identity & Trust", items: [
    { href: "/identity-trust", label: "Identity & Trust", description: "Organization identity, issuer keys and anchoring infrastructure", permission: "members.manage" },
    { href: "/organization-did#managed-did", label: "Managed DID", description: "Review platform-hosted organization identity", permission: "members.manage" },
    { href: "/organization-did#self-managed-did", label: "Self-Managed DID", description: "Deploy and validate identity on your domain", permission: "members.manage" },
    { href: "/organization-did#verification-methods", label: "Verification Methods", description: "Review issuer methods and key versions", permission: "members.manage" },
    { href: "/identity-trust#issuer-keys", label: "Issuer Keys", description: "Review issuer key governance and open issuer key management", permission: "issuers.manage" },
    { href: "/organization-did#did-documents", label: "DID Documents", description: "Download and inspect public DID documents", permission: "members.manage" },
    { href: "/document-stores", label: "Document Stores", description: "Manage organization blockchain anchoring contracts", permission: "members.manage" },
  ] },
  { label: "Administration", items: [
    { href: "/billing", label: "Billing & usage", description: "Review subscription, limits and usage", permission: "billing.read" },
    { href: "/organizations#members", label: "Users", description: "Manage organization memberships", permission: "members.manage" },
    { href: "/audit", label: "Audit Logs", description: "Review organization activity", permission: "members.manage" },
    { href: "/platform/dashboard", label: "Administration", description: "Review platform operations", permission: "organizations.manage" },
  ] },
  { label: "Account & support", items: [
    { href: "/profile", label: "Profile", description: "Manage your profile and account security" },
    { href: "/docs/user-manual", label: "User guide", description: "Learn credential workflows" },
    { href: "/docs/admin-manual", label: "Admin guide", description: "Configure organization access", permission: "members.manage" },
    { href: "/contact", label: "Contact support", description: "Get help with your credential programme" },
  ] },
];

export function normalizePagePath(path: string | null | undefined) {
  return path?.replace(/\/+$/, "") || "/";
}

export function workspaceNavigation(user: { roles: readonly string[]; issuerMemberships?: readonly IssuerMembership[] } | null) {
  if (!user) return [];
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(user, item.permission))
  })).filter((group) => group.items.length > 0);
}

const tools: NavigationItem[] = [
  { href: "/bulk", label: "Batch data preview", description: "Preview batch data without issuing credentials" },
  { href: "/organization-did", label: "DID Management", description: "Configure organization identity and issuer methods" },
  { href: "/templates/builder", label: "Template builder", description: "Maintain credential templates" },
  { href: "/wallet", label: "Sharing & delivery", description: "Share signed credentials with recipients" },
  { href: "/revocation", label: "Credential status", description: "Review lifecycle changes" },
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
  return groups.flatMap((group) => group.items).some((item) => item.href === path && !["/verify", "/contact", "/docs/user-manual", "/docs/admin-manual"].includes(path))
    || ["/organization-did", "/templates/builder", "/wallet", "/revocation", "/bulk", "/verification", "/issuer"].includes(path);
}
