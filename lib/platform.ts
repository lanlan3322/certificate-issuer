export type PlatformRole =
  | "platform-admin"
  | "issuer-admin"
  | "issuer-operator"
  | "verifier";

export type OrganizationStatus = "active" | "disabled";
export type IssuerStatus = "active" | "disabled" | "suspended";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
}

export interface User {
  id: string;
  name: string;
  email: string;
  roles: PlatformRole[];
}

export interface IssuerWorkspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  contactEmail: string;
  status: IssuerStatus;
  createdAt: string;
}

export interface PlatformState {
  organizations: Organization[];
  users: User[];
  issuers: IssuerWorkspace[];
  issuerBranding: Record<string, IssuerBranding>;
  didRegistry: Record<string, DIDRecord[]>;
}

const BRANDING_REGISTRY: Record<string, IssuerBranding> = {};

export interface IssuerBranding {
  issuerId: string;
  logoUrl?: string;
  themeColor?: string;
  website?: string;
  description?: string;
  verificationBranding?: string;
}

export interface DIDRecord {
  id: string;
  issuerId: string;
  didUri: string;
  keyId: string;
  status: "active" | "inactive" | "rotated";
  createdAt: string;
  updatedAt: string;
}

export function createDefaultPlatform(): PlatformState {
  return {
    organizations: [
      {
        id: "org-demo",
        name: "OpenClaw Education",
        slug: "openclaw-education",
        status: "active",
      },
    ],
    users: [
      {
        id: "user-admin",
        name: "Platform Admin",
        email: "admin@example.com",
        roles: ["platform-admin"],
      },
      {
        id: "user-issuer",
        name: "Issuer Operator",
        email: "issuer@example.com",
        roles: ["issuer-admin", "issuer-operator"],
      },
    ],
    issuers: [],
    issuerBranding: {},
    didRegistry: {},
  };
}

export function createIssuerWorkspace(
  platform: PlatformState,
  input: {
    organizationId: string;
    name: string;
    slug: string;
    contactEmail: string;
  }
): IssuerWorkspace {
  const organization = platform.organizations.find((item) => item.id === input.organizationId);

  if (!organization) {
    throw new Error(`Organization not found: ${input.organizationId}`);
  }

  const issuer: IssuerWorkspace = {
    id: `issuer-${input.slug}`,
    organizationId: organization.id,
    name: input.name,
    slug: input.slug,
    contactEmail: input.contactEmail,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  platform.issuers.push(issuer);
  platform.issuerBranding[issuer.id] = {
    issuerId: issuer.id,
    logoUrl: "",
    themeColor: "#111827",
    website: "",
    description: "",
    verificationBranding: "",
  };
  platform.didRegistry[issuer.id] = [];
  return issuer;
}

export function getIssuerBySlug(platform: PlatformState, slug: string): IssuerWorkspace | undefined {
  return platform.issuers.find((issuer) => issuer.slug === slug);
}

export function setIssuerStatus(
  platform: PlatformState,
  issuerId: string,
  status: IssuerStatus
): IssuerWorkspace {
  const issuer = platform.issuers.find((item) => item.id === issuerId);

  if (!issuer) {
    throw new Error(`Issuer not found: ${issuerId}`);
  }

  issuer.status = status;
  return issuer;
}

export function canIssueCredentials(issuer: IssuerWorkspace): boolean {
  return issuer.status === "active";
}

export function hasRole(user: User, role: PlatformRole): boolean {
  return user.roles.includes(role);
}

export function assignRole(user: User, role: PlatformRole): User {
  if (!user.roles.includes(role)) {
    user.roles = [...user.roles, role];
  }
  return user;
}

export function createIssuerBranding(
  issuerId: string,
  branding: Partial<IssuerBranding> = {}
): IssuerBranding {
  const next = {
    issuerId,
    logoUrl: branding.logoUrl ?? "",
    themeColor: branding.themeColor ?? "#111827",
    website: branding.website ?? "",
    description: branding.description ?? "",
    verificationBranding: branding.verificationBranding ?? "",
  };

  BRANDING_REGISTRY[issuerId] = next;
  return next;
}

export function getIssuerBranding(
  platform: PlatformState,
  issuerId: string
): IssuerBranding {
  const cached = BRANDING_REGISTRY[issuerId] ?? createIssuerBranding(issuerId);
  platform.issuerBranding[issuerId] = cached;
  return cached;
}

export function setIssuerBranding(
  platform: PlatformState,
  issuerId: string,
  patch: Partial<IssuerBranding>
): IssuerBranding {
  const current = getIssuerBranding(platform, issuerId);
  const next = {
    ...current,
    ...patch,
    issuerId,
  };
  BRANDING_REGISTRY[issuerId] = next;
  platform.issuerBranding[issuerId] = next;
  return next;
}

export function updateIssuerBranding(
  issuerId: string,
  patch: Partial<IssuerBranding>
): IssuerBranding {
  const current = BRANDING_REGISTRY[issuerId] ?? createIssuerBranding(issuerId, {
    logoUrl: "",
    themeColor: "#111827",
    website: "",
    description: "",
    verificationBranding: "",
  });

  const next = {
    ...current,
    ...patch,
    issuerId,
  };

  BRANDING_REGISTRY[issuerId] = next;
  return next;
}

export function createDIDRecord(
  issuerId: string,
  input: {
    didUri: string;
    keyId: string;
    status?: DIDRecord["status"];
  }
): DIDRecord {
  const record: DIDRecord = {
    id: `did-${input.didUri}`,
    issuerId,
    didUri: input.didUri,
    keyId: input.keyId,
    status: input.status ?? "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return record;
}

export function getIssuerDIDs(platform: PlatformState, issuerId: string): DIDRecord[] {
  return [...(platform.didRegistry[issuerId] ?? [])];
}

export function saveDIDRecord(
  platform: PlatformState,
  issuerId: string,
  did: DIDRecord
): DIDRecord {
  const registry = platform.didRegistry[issuerId] ?? [];
  const saved = { ...did, issuerId, updatedAt: new Date().toISOString() };
  const index = registry.findIndex((item) => item.id === did.id);
  if (index >= 0) {
    registry[index] = saved;
  } else {
    registry.push(saved);
  }
  platform.didRegistry[issuerId] = registry;
  return saved;
}

export function rotateDIDRecord(
  issuerId: string,
  didId: string,
  input: { keyId?: string }
): DIDRecord {
  const next: DIDRecord = {
    id: didId,
    issuerId,
    didUri: `did:web:rotated.${issuerId}`,
    keyId: input.keyId ?? `did:web:rotated.${issuerId}#key-1`,
    status: "rotated",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return next;
}

export function deactivateDIDRecord(issuerId: string, didId: string): DIDRecord {
  return {
    id: didId,
    issuerId,
    didUri: `did:web:inactive.${issuerId}`,
    keyId: `did:web:inactive.${issuerId}#key-1`,
    status: "inactive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function canUseDID(did: DIDRecord): boolean {
  return did.status === "active" || did.status === "rotated";
}

export type PlatformAction =
  | "create-issuer"
  | "update-issuer-status"
  | "view-issuers"
  | "platform-settings"
  | "issue-credential";

export function authorize(user: User, action: PlatformAction): boolean {
  const roleMap: Record<PlatformAction, PlatformRole[]> = {
    "create-issuer": ["platform-admin", "issuer-admin"],
    "update-issuer-status": ["platform-admin", "issuer-admin"],
    "view-issuers": ["platform-admin", "issuer-admin", "issuer-operator", "verifier"],
    "platform-settings": ["platform-admin"],
    "issue-credential": ["platform-admin", "issuer-admin", "issuer-operator"],
  };

  return roleMap[action].some((role) => hasRole(user, role));
}

export interface IssuerRepository {
  listIssuers(): IssuerWorkspace[];
  getIssuerById(id: string): IssuerWorkspace | undefined;
  getIssuerBySlug(slug: string): IssuerWorkspace | undefined;
  createIssuer(input: {
    organizationId: string;
    name: string;
    slug: string;
    contactEmail: string;
  }): IssuerWorkspace;
  updateIssuerStatus(id: string, status: IssuerStatus): IssuerWorkspace;
}

export function listIssuers(platform: PlatformState): IssuerWorkspace[] {
  return [...platform.issuers];
}

export function createIssuerRepository(platform: PlatformState): IssuerRepository {
  return {
    listIssuers: () => listIssuers(platform),
    getIssuerById: (id: string) => platform.issuers.find((issuer) => issuer.id === id),
    getIssuerBySlug: (slug: string) => getIssuerBySlug(platform, slug),
    createIssuer: (input) => createIssuerWorkspace(platform, input),
    updateIssuerStatus: (id: string, status: IssuerStatus) => setIssuerStatus(platform, id, status),
  };
}
