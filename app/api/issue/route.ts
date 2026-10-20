import { after, NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import {
  buildVCPayload,
  computeDocumentStoreHash,
  getDIDKeyPairFromEnv,
  getDIDKeyPairFromIssuerProfile,
  signDocumentWithDID,
  withEmbeddedRenderMethod,
} from "../../../lib/trustvc";
import { resolveTemplateId } from "../../templates/registry";
import { AuditService } from "../../../services/AuditService";
import { CredentialService, DuplicateCredentialError } from "../../../services/CredentialService";
import { getDefaultDocumentStoreConfig, registerHash, isRegistered } from "../../../lib/document-store";
import type { CertificateData } from "../../../lib/trustvc";
import { StatusListService, requireStatusListConfiguration } from "../../../services/StatusListService";
import { IssuerProfileService } from "../../../services/IssuerProfileService";
import { TemplateService } from "../../../services/TemplateService";
import { NETWORKS } from "../../../lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FIELD = 512;

/**
 * Extracts the OpenCerts targetHash (bytes32) from a signed VC.
 * The `injectTargetHash` utility writes it to `credentialStatus[0].targetHash`.
 */
function extractTargetHash(credential: Record<string, unknown>): string | null {
  const status = credential["credentialStatus"];
  if (!status) return null;
  // Array form (W3C VC spec): [{ ..., targetHash: "0x..." }]
  if (Array.isArray(status)) {
    const first = status[0];
    if (first && typeof first === "object") {
      const h = (first as Record<string, unknown>)["targetHash"];
      if (typeof h === "string" && /^0x[0-9a-f]{64}$/i.test(h)) return h;
    }
  } else if (typeof status === "object") {
    // Object form (legacy / some verifiers)
    const hash = (status as Record<string, unknown>)["targetHash"];
    if (typeof hash === "string" && /^0x[0-9a-f]{64}$/i.test(hash)) return hash;
  }
  return null;
}


function validate(data: Record<string, unknown>): { ok: true; value: CertificateData } | { ok: false; error: string } {
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string).trim() : "");

  const id = str("id");
  const recipientName = str("recipientName");
  const recipientEmail = str("recipientEmail");
  const certificateType = str("certificateType");

  if (!id) return { ok: false, error: "id is required." };
  if (!recipientName) return { ok: false, error: "recipientName is required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) return { ok: false, error: "A valid recipientEmail is required." };
  if (!certificateType) return { ok: false, error: "certificateType is required." };

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > MAX_FIELD) {
      return { ok: false, error: `${key} exceeds ${MAX_FIELD} characters.` };
    }
  }

  const methods = Array.isArray(data.issuingMethods)
    ? (data.issuingMethods as unknown[]).filter((m): m is string => m === "did" || m === "ethereum")
    : ["did"];

  return {
    ok: true,
    value: {
      ...(data as unknown as CertificateData),
      id,
      recipientName,
      recipientEmail,
      certificateType,
      issuingMethods: methods as CertificateData["issuingMethods"],
    },
  };
}

export async function POST(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;

  try {
    const body = (await request.json()) as {
      data?: Record<string, unknown>;
      type?: "did" | "ethereum";
      templateId?: string;
      persist?: boolean;
      certificateFormat?: "standard" | "opencerts" | "v1" | "w3c";
      statusProfile?: "legacy" | "bitstring" | "trustvc";
      renderMethod?: "none" | "embedded";
    };

    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "Missing credential payload." }, { status: 400 });
    }

    const validated = validate(body.data);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    let data = validated.value;
    if (body.statusProfile !== undefined && !["legacy", "bitstring", "trustvc"].includes(body.statusProfile)) {
      return NextResponse.json({ error: "Unsupported status profile." }, { status: 400 });
    }
    const trustvcProfile = body.statusProfile === "trustvc";
    const usesStatusList = trustvcProfile || body.statusProfile === "bitstring";
    if (trustvcProfile && (body.persist === false || !data.issuingMethods?.includes("did"))) {
      return NextResponse.json({ error: "TrustVC profile requires persisted DID issuance." }, { status: 400 });
    }
    if (body.renderMethod !== undefined && body.renderMethod !== "none" && body.renderMethod !== "embedded") {
      return NextResponse.json({ error: "Unsupported render method." }, { status: 400 });
    }
    if (body.renderMethod === "embedded" && !data.issuingMethods?.includes("did")) {
      return NextResponse.json({ error: "Embedded rendering requires DID issuance." }, { status: 400 });
    }
    if (body.statusProfile === "bitstring") {
      if (body.persist === false || data.issuingMethods?.length !== 1 || data.issuingMethods[0] !== "did") {
        return NextResponse.json(
          { error: "Bitstring status requires persisted DID-only issuance." }, { status: 400 }
        );
      }
    }

    if ((body.type ?? "did") !== "did") {
      return NextResponse.json(
        { error: "Ethereum anchoring is performed client-side with the connected wallet." },
        { status: 400 }
      );
    }

    const templateReference = body.templateId?.trim() || data.templateId?.trim();
    const template = templateReference
      ? await TemplateService.getForIssuance(templateReference, user.issuerId)
      : null;
    const isUuidTemplateReference = Boolean(templateReference &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateReference));
    if (isUuidTemplateReference && !template) {
      return NextResponse.json({ error: "Template not found for this issuer." }, { status: 404 });
    }
    if (template && !template.isActive) {
      return NextResponse.json({ error: "Template is inactive and cannot issue credentials." }, { status: 409 });
    }

    const issuerProfile = template?.issuerProfileId
      ? await IssuerProfileService.get(template.issuerProfileId, user.issuerId)
      : null;
    if (template?.issuerProfileId && (!issuerProfile || !issuerProfile.active)) {
      return NextResponse.json(
        { error: "Template issuer profile is missing or inactive." },
        { status: 409 }
      );
    }
    if (issuerProfile && body.persist === false) {
      return NextResponse.json(
        { error: "Issuer-profile credentials must be persisted to preserve issuance and revocation records." },
        { status: 400 }
      );
    }

    if (issuerProfile &&
        (!issuerProfile.documentStoreAddress ||
          !/^0x[0-9a-f]{40}$/i.test(issuerProfile.documentStoreAddress) ||
          !issuerProfile.documentStoreNetwork ||
          !Object.hasOwn(NETWORKS, issuerProfile.documentStoreNetwork))) {
      return NextResponse.json(
        { error: "Issuer profile requires a valid Document Store address and supported network before issuance." },
        { status: 409 }
      );
    }

    const statusListIssuer = issuerProfile ? {
      id: issuerProfile.id,
      did: issuerProfile.did,
      verificationMethod: issuerProfile.verificationMethod,
      keyReference: issuerProfile.keyReference,
    } : undefined;
    if (usesStatusList) requireStatusListConfiguration(statusListIssuer);

    let profileKeyPair = null;
    if (issuerProfile) {
      try {
        profileKeyPair = getDIDKeyPairFromIssuerProfile(issuerProfile);
      } catch (error) {
        return errorResponse(error, "Issuer profile signing key configuration is invalid.", 503);
      }
    }
    if (issuerProfile && !profileKeyPair) {
      return NextResponse.json(
        {
          error: `Signing key for issuer profile is not configured. Set ${issuerProfile.keyReference} and ${issuerProfile.keyReference}_PUBLIC_KEY_MULTIBASE in the server secret store.`,
        },
        { status: 503 }
      );
    }
    const legacyKeyPair = issuerProfile ? null : getDIDKeyPairFromEnv();
    if (!issuerProfile && !legacyKeyPair) {
      return NextResponse.json(
        {
          signed: false,
          credential: buildVCPayload(data, body.certificateFormat),
          error:
            "DID signing is not configured in the server environment. Set DID_KEY_ID, DID_CONTROLLER, DID_PUBLIC_KEY_MULTIBASE, and DID_PRIVATE_KEY_MULTIBASE.",
        },
        { status: 503 }
      );
    }

    const documentStore = issuerProfile ? {
      address: issuerProfile.documentStoreAddress!,
      network: issuerProfile.documentStoreNetwork!,
    } : getDefaultDocumentStoreConfig();
    data = {
      ...data,
      issuerDid: issuerProfile?.did,
      issuerDisplayName: issuerProfile?.displayName,
      issuerName: issuerProfile?.displayName ?? data.issuerName,
      documentStoreAddress: documentStore.address,
      documentStoreNetwork: documentStore.network,
    };

    const payload = buildVCPayload(trustvcProfile ? { ...data, issuingMethods: ["did"] } : data,
      trustvcProfile ? "standard" : body.certificateFormat);
    const statusCredential: Record<string, unknown> = usesStatusList
      ? { ...payload, credentialStatus: await StatusListService.reserve(user.issuerId, data.id, statusListIssuer) }
      : payload;
    const credential = body.renderMethod === "embedded"
      ? withEmbeddedRenderMethod(statusCredential, resolveTemplateId(data.templateId ?? body.templateId))
      : statusCredential;
    const result = await signDocumentWithDID(
      credential,
      undefined,
      profileKeyPair
        ? {
            did: profileKeyPair.controller,
            verificationMethod: profileKeyPair.id,
            publicKeyMultibase: profileKeyPair.publicKeyMultibase,
            secretKeyMultibase: profileKeyPair.secretKeyMultibase,
          }
        : undefined
    );
    if (!result.signed) {
      return NextResponse.json(
        { signed: false, credential: result.credential, error: result.error ?? "Signing failed." },
        { status: 500 }
      );
    }

    const targetHash = trustvcProfile && data.issuingMethods?.includes("ethereum")
      ? computeDocumentStoreHash(result.credential)
      : extractTargetHash(result.credential);
    let stored: { id: string } | null = null;
    if (body.persist !== false) {
      try {
        const record = await CredentialService.create({
          issuerId: user.issuerId,
          templateId: template?.id,
          issuerProfileId: issuerProfile?.id,
          issuerDid: issuerProfile?.did,
          documentStoreAddress: documentStore.address,
          documentStoreNetwork: documentStore.network,
          verificationMethod: issuerProfile?.verificationMethod,
          externalId: data.id,
          recipientName: data.recipientName,
          recipientEmail: data.recipientEmail,
          credential: result.credential,
          documentHash: targetHash ?? undefined,
          issuingMethods: data.issuingMethods,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
        });
        stored = { id: record.id };
        await AuditService.record({
          organizationId: user.organizationId,
          issuerId: user.issuerId,
          userId: user.id,
          action: "credential.issued",
          entityType: "credential",
          entityId: record.id,
          metadata: { externalId: data.id, methods: data.issuingMethods, statusProfile: body.statusProfile },
        });
      } catch (storeError) {
        if (storeError instanceof DuplicateCredentialError) {
          return NextResponse.json({ signed: false, error: storeError.message }, { status: 409 });
        }
        throw storeError;
      }
    }

    const ethereumSelected = data.issuingMethods?.includes("ethereum") === true;
    if ((ethereumSelected || isRegistered()) && targetHash) {
      const entityId = stored?.id;
      after(async () => {
        try {
          const registration = await registerHash(targetHash, {
            credentialId: data.id,
            externalId: data.id,
            recipientEmail: data.recipientEmail,
            issuerId: user.issuerId,
          }, documentStore, async (txHash) => {
            await AuditService.record({
              organizationId: user.organizationId,
              issuerId: user.issuerId,
              userId: user.id,
              action: "credential.registration_submitted",
              entityType: "credential",
              entityId,
              metadata: {
                externalId: data.id,
                targetHash,
                documentStoreAddress: documentStore.address,
                documentStoreNetwork: documentStore.network,
                txHash,
              },
            });
          }, { required: ethereumSelected });
          await AuditService.record({
            organizationId: user.organizationId,
            issuerId: user.issuerId,
            userId: user.id,
            action: registration.error ? "credential.registration_failed" : "credential.registered",
            entityType: "credential",
            entityId,
            metadata: {
              externalId: data.id,
              targetHash,
              documentStoreAddress: documentStore.address,
              documentStoreNetwork: documentStore.network,
              ...registration,
            },
          });
        } catch {
          console.error("[issue/registration] post-response registration failed.");
        }
      });
    }

    return NextResponse.json({ signed: true, credential: result.credential, stored,
      ...(trustvcProfile && data.issuingMethods?.includes("ethereum")
        ? { blockchainRegistration: "scheduled" } : {}) });
  } catch (error) {
    if (error instanceof DuplicateCredentialError) {
      return NextResponse.json({ signed: false, error: error.message }, { status: 409 });
    }
    return errorResponse(error, "Unable to issue credential.", 500);
  }
}
