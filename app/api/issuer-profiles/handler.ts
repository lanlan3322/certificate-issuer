import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { AuditService } from "../../../services/AuditService";
import {
  IssuerProfileService,
  IssuerProfileIdentityLockedError,
  type IssuerProfileInput,
} from "../../../services/IssuerProfileService";
import { isRootDidWeb, LEGACY_DID_ID } from "../../../lib/did-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileBody = Omit<IssuerProfileInput, "ownerIssuerId">;

function validateProfile(body: Partial<ProfileBody>, partial = false): string | null {
  const required: Array<keyof ProfileBody> = [
    "issuerName",
    "displayName",
    "did",
    "verificationMethod",
    "keyReference",
  ];
  if (!partial) {
    for (const field of required) {
      if (typeof body[field] !== "string" || !body[field]?.trim()) {
        return `${field} is required.`;
      }
    }
  }

  for (const field of required) {
    const value = body[field];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      return `${field} must be a non-empty string.`;
    }
  }

  const did = body.did?.trim();
  const method = body.verificationMethod?.trim();
  if (partial && ((did && !method) || (!did && method))) {
    return "did and verificationMethod must be updated together.";
  }
  if (did && !isRootDidWeb(did)) {
    return "did must be a root did:web hostname for public issuer DID resolution.";
  }
  if (did === LEGACY_DID_ID) {
    return "did is reserved for the legacy platform issuer.";
  }
  if (did && method && !method.startsWith(`${did}#`)) {
    return "verificationMethod must be a fragment of the profile DID.";
  }
  if (body.active !== undefined && typeof body.active !== "boolean") {
    return "active must be a boolean.";
  }
  const keyReference = body.keyReference?.trim();
  if (keyReference && !/^[A-Z][A-Z0-9_]{2,127}$/.test(keyReference)) {
    return "keyReference must be an uppercase environment/secret reference identifier, not key material.";
  }
  for (const field of ["documentStoreAddress", "documentStoreNetwork", "logoUrl", "website"] as const) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return `${field} must be a string or null.`;
    }
  }
  for (const field of ["logoUrl", "website"] as const) {
    const value = body[field];
    if (typeof value === "string" && value.trim()) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          return `${field} must use HTTP or HTTPS.`;
        }
      } catch {
        return `${field} must be an absolute URL.`;
      }
    }
  }
  return null;
}

function profileInput(body: ProfileBody, ownerIssuerId: string): IssuerProfileInput {
  return {
    ownerIssuerId,
    issuerName: body.issuerName!.trim(),
    displayName: body.displayName!.trim(),
    did: body.did!.trim(),
    verificationMethod: body.verificationMethod!.trim(),
    documentStoreAddress: body.documentStoreAddress?.trim() || null,
    documentStoreNetwork: body.documentStoreNetwork?.trim() || null,
    logoUrl: body.logoUrl?.trim() || null,
    website: body.website?.trim() || null,
    active: body.active ?? true,
    keyReference: body.keyReference!.trim(),
  };
}

function publicProfile<T extends { keyReference: string }>(profile: T) {
  const { keyReference: _keyReference, ...safeProfile } = profile;
  return safeProfile;
}

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    return NextResponse.json({
      canManage: user.roles.includes("issuer-admin"),
      issuerProfiles: (await IssuerProfileService.list(user.issuerId, { includeInactive }))
        .map(({ id, issuerName, displayName, did, verificationMethod, documentStoreAddress,
          documentStoreNetwork, logoUrl, website, active, createdAt, updatedAt }) => ({
          id,
          issuerName,
          displayName,
          did,
          verificationMethod,
          documentStoreAddress,
          documentStoreNetwork,
          logoUrl,
          website,
          active,
          createdAt,
          updatedAt,
        })),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load issuer profiles.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;
  try {
    const body = (await request.json()) as Partial<ProfileBody>;
    const validationError = validateProfile(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const profile = await IssuerProfileService.create(profileInput(body as ProfileBody, user.issuerId));
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "issuer_profile.created",
      entityType: "issuer_profile",
      entityId: profile.id,
      metadata: { displayName: profile.displayName, did: profile.did, keyReference: profile.keyReference },
    });
    return NextResponse.json({ issuerProfile: publicProfile(profile) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create issuer profile.");
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await authorize("issuer-admin");
  if (response) return response;
  try {
    const body = (await request.json()) as Partial<ProfileBody> & { id?: string };
    const id = body.id?.trim();
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    const { id: _id, ...updates } = body;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "At least one profile field is required." }, { status: 400 });
    }
    const validationError = validateProfile(updates, true);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const profile = await IssuerProfileService.update(id, user.issuerId, updates);
    await AuditService.record({
      organizationId: user.organizationId,
      issuerId: user.issuerId,
      userId: user.id,
      action: "issuer_profile.updated",
      entityType: "issuer_profile",
      entityId: profile.id,
      metadata: { displayName: profile.displayName, did: profile.did, keyReference: profile.keyReference },
    });
    return NextResponse.json({ issuerProfile: publicProfile(profile) });
  } catch (error) {
    if (error instanceof IssuerProfileIdentityLockedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error, "Unable to update issuer profile.");
  }
}
