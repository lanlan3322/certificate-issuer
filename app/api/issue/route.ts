import { after, NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { isPlatformAdmin } from "../../../lib/permissions";
import {
  buildVCPayload,
  computeDocumentStoreHash,
  signDocumentWithDID,
  withEmbeddedRenderMethod,
} from "../../../lib/trustvc";
import { resolveTemplateId } from "../../templates/registry";
import { AuditService } from "../../../services/AuditService";
import { CredentialService, DuplicateCredentialError } from "../../../services/CredentialService";
import { getDefaultDocumentStoreConfig, registerHash, isRegistered } from "../../../lib/document-store";
import type { CertificateData } from "../../../lib/trustvc";
import { StatusListService } from "../../../services/StatusListService";
import { IssuerProfileService } from "../../../services/IssuerProfileService";
import { TemplateService } from "../../../services/TemplateService";
import { NETWORKS } from "../../../lib/constants";
import { requireIssuerAccess } from "../../../lib/issuer-access";
import { OrganizationService } from "../../../services/OrganizationService";
import { IssuerKeyService } from "../../../services/IssuerKeyService";
import { IssuerKeyError } from "../../../lib/issuer-key-crypto";
import { ManagedDIDError } from "../../../services/ManagedDIDService";
import { OrganizationDocumentStoreService, OrganizationDocumentStoreError } from "../../../services/OrganizationDocumentStoreService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FIELD = 512;

export async function GET(request: Request) {
  const auth = await authorize("credentials.issue");
  if (auth.response) return auth.response;
  try {
    const template = await TemplateService.getAvailableForIssuance(
      new URL(request.url).searchParams.get("templateId") ?? "",
      { organizationId: auth.user.organizationId, platformAdmin: isPlatformAdmin(auth.user) }
    );
    if (!template?.isActive || !template.issuerId) {
      return NextResponse.json({ error: "Select an active saved template." }, { status: 404 });
    }
    const issuer = await requireIssuerAccess(auth.user, template.issuerId, "issue", true);
    const store = await OrganizationDocumentStoreService.active(issuer.organizationId);
    return NextResponse.json({ blockchainRegistration: store ? "server" : "wallet" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof OrganizationDocumentStoreError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return errorResponse(error, "Unable to resolve issuance Document Store.", 500);
  }
}

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
  const { user, response } = await authorize("credentials.issue");
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
    if (body.persist === false) {
      return NextResponse.json({ error: "Issuer credentials must be persisted to preserve ownership and revocation records." }, { status: 400 });
    }

    const templateReference = body.templateId?.trim() || data.templateId?.trim();
    const template = templateReference
      ? await TemplateService.getAvailableForIssuance(templateReference, {
        organizationId: user.organizationId,
        platformAdmin: isPlatformAdmin(user),
      })
      : null;
    if (!template) {
      return NextResponse.json({ error: "Select an active saved template available to your organization." }, { status: 404 });
    }
    if (template && !template.isActive) {
      return NextResponse.json({ error: "Template is inactive and cannot issue credentials." }, { status: 409 });
    }
    if (!template.issuerId) return NextResponse.json({ error: "Template has no issuer assignment." }, { status: 409 });
    const issuingIssuer = await requireIssuerAccess(user, template.issuerId, "issue", true);
    const issuingOrganization = await OrganizationService.getById(issuingIssuer.organizationId);
    if (!issuingOrganization) return NextResponse.json({ error: "Issuer organization not found." }, { status: 409 });

    const usesOwnProfile = !!template.issuerProfileId;
    const issuerProfile = usesOwnProfile && template.issuerProfileId
      ? await IssuerProfileService.get(template.issuerProfileId, issuingIssuer.id)
      : null;
    if (usesOwnProfile && (!issuerProfile || !issuerProfile.active)) {
      return NextResponse.json(
        { error: "Template issuer profile is missing or inactive." },
        { status: 409 }
      );
    }
    const organizationStore=await OrganizationDocumentStoreService.active(issuingIssuer.organizationId);
    if (!organizationStore && issuerProfile &&
        (!issuerProfile.documentStoreAddress ||
          !/^0x[0-9a-f]{40}$/i.test(issuerProfile.documentStoreAddress) ||
          !issuerProfile.documentStoreNetwork ||
          !Object.hasOwn(NETWORKS, issuerProfile.documentStoreNetwork))) {
      return NextResponse.json(
        { error: "Issuer profile requires a valid Document Store address and supported network before issuance." },
        { status: 409 }
      );
    }


    let signingContext;
    try {
      signingContext = await IssuerKeyService.signer(issuingIssuer.id);
    }
    catch (error) {
      if (error instanceof IssuerKeyError) return NextResponse.json({error:error.message},{status:error.status});
      if (error instanceof ManagedDIDError) return NextResponse.json({error:error.message},{status:error.status});
      return errorResponse(error,"Issuer signing key could not be resolved.",503);
    }

    const documentStore = organizationStore ?? (issuerProfile ? {
      address: issuerProfile.documentStoreAddress!,
      network: issuerProfile.documentStoreNetwork!,
    } : getDefaultDocumentStoreConfig());
    data = {
      ...data,
      templateId: resolveTemplateId(template.slug),
      issuerDid: signingContext.did,
      issuerDisplayName: issuingIssuer.displayName,
      issuerName: issuingIssuer.displayName,
      organizationId: issuingIssuer.organizationId,
      issuerId: issuingIssuer.id,
      verificationMethod: signingContext.verificationMethod,
      keyFingerprint: signingContext.keyFingerprint,
      keyVersion: signingContext.keyVersion,
      organizationDisplayName: issuingOrganization.displayName,
      documentStoreAddress: documentStore.address,
      documentStoreNetwork: documentStore.network,
    };

    const payload = buildVCPayload(trustvcProfile ? { ...data, issuingMethods: ["did"] } : data,
      trustvcProfile ? "standard" : body.certificateFormat);
    const statusCredential: Record<string, unknown> = usesStatusList
      ? { ...payload, credentialStatus: await StatusListService.reserveManaged(issuingIssuer.id, data.id, signingContext.did) }
      : payload;
    const credential = body.renderMethod === "embedded"
      ? withEmbeddedRenderMethod(statusCredential, resolveTemplateId(template.slug))
      : statusCredential;
    const result = await signDocumentWithDID(
      credential,
      undefined,
      signingContext
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
    try {
      const record = await CredentialService.create({
        issuerId: issuingIssuer.id,
        signingKeyId:signingContext.keyId,
        organizationDocumentStoreId:organizationStore?.id,
        templateId: template.id,
        issuerProfileId: issuerProfile?.id,
        issuerDid: signingContext.did,
        documentStoreAddress: documentStore.address,
        documentStoreNetwork: documentStore.network,
        verificationMethod: signingContext.verificationMethod,
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
        organizationId: issuingIssuer.organizationId,
        issuerId: issuingIssuer.id,
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

    const ethereumSelected = data.issuingMethods?.includes("ethereum") === true;
    let serverRegistration: Awaited<ReturnType<typeof registerHash>> | undefined;
    if (organizationStore && ethereumSelected && targetHash) {
      serverRegistration = await registerHash(targetHash, {
        credentialId: data.id, externalId: data.id, recipientEmail: data.recipientEmail, issuerId: issuingIssuer.id,
      }, documentStore, async txHash => {
        await AuditService.record({
          organizationId: issuingIssuer.organizationId, issuerId: issuingIssuer.id, userId: user.id,
          action: "credential.registration_submitted", entityType: "credential", entityId: stored.id,
          metadata: { targetHash, documentStoreAddress: documentStore.address, documentStoreNetwork: documentStore.network, txHash },
        });
      }, { required: true });
      await AuditService.record({
        organizationId: issuingIssuer.organizationId, issuerId: issuingIssuer.id, userId: user.id,
        action: serverRegistration.error ? "credential.registration_failed" : "credential.registered",
        entityType: "credential", entityId: stored.id,
        metadata: { targetHash, documentStoreAddress: documentStore.address, documentStoreNetwork: documentStore.network, ...serverRegistration },
      });
    } else if (!trustvcProfile && (ethereumSelected || isRegistered()) && targetHash) {
      const entityId = stored?.id;
      after(async () => {
        try {
          const registration = await registerHash(targetHash, {
            credentialId: data.id,
            externalId: data.id,
            recipientEmail: data.recipientEmail,
            issuerId: issuingIssuer.id,
          }, documentStore, async (txHash) => {
            await AuditService.record({
              organizationId: issuingIssuer.organizationId,
              issuerId: issuingIssuer.id,
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
            organizationId: issuingIssuer.organizationId,
            issuerId: issuingIssuer.id,
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
      ...(serverRegistration
        ? { blockchainRegistration: "server", registration: {
          ...serverRegistration, alreadyRegistered: serverRegistration.hashExists && !serverRegistration.registered,
        }, documentStore }
        : trustvcProfile && data.issuingMethods?.includes("ethereum")
        ? { blockchainRegistration: "wallet", documentStore } : {}) });
  } catch (error) {
    if(error instanceof OrganizationDocumentStoreError)return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof DuplicateCredentialError) {
      return NextResponse.json({ signed: false, error: error.message }, { status: 409 });
    }
    return errorResponse(error, "Unable to issue credential.", 500);
  }
}
