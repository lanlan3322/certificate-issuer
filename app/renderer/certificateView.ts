import { resolveTemplateId, TEMPLATE_OPTIONS } from "../templates/registry";
import type { CertificateTemplateData, CertificateTemplateId } from "../templates/types";

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

const firstObject = (value: unknown): JsonObject => asObject(Array.isArray(value) ? value[0] : value);

/** Template chosen by the signed renderMethod, falling back to the subject's templateId. */
export function getRendererTemplateId(document: unknown): CertificateTemplateId {
  const doc = asObject(document);
  const renderMethod = firstObject(doc.renderMethod);
  const subject = firstObject(doc.credentialSubject);
  const requested = typeof renderMethod.templateName === "string"
    ? renderMethod.templateName
    : typeof subject.templateId === "string"
      ? subject.templateId
      : undefined;
  return resolveTemplateId(requested);
}

export function getRendererTemplates(document: unknown) {
  const templateId = getRendererTemplateId(document);
  const option = TEMPLATE_OPTIONS.find((template) => template.id === templateId);
  return [{ id: templateId, label: option?.label ?? "Certificate", type: "custom-template" }];
}

/** Maps a W3C credential to the props used by the in-app certificate views. */
export function toCertificateTemplateData(document: unknown, verificationUrl: string): CertificateTemplateData {
  const doc = asObject(document);
  const subject = firstObject(doc.credentialSubject);
  const issuer = asObject(doc.issuer);
  const text = (value: unknown, fallback = "") =>
    typeof value === "string" || typeof value === "number" ? String(value) : fallback;

  return {
    id: text(subject.certificateId ?? doc.id),
    recipientName: text(subject.name, "Certificate recipient"),
    recipientEmail: text(subject.email),
    certificateType: text(subject.certificateType ?? subject.type, "Certificate"),
    issuerName: text(issuer.name ?? issuer.id, "Certificate Issuer"),
    issueDate: text(doc.issuanceDate ?? doc.validFrom),
    description: text(subject.description),
    validFrom: text(doc.validFrom ?? doc.issuanceDate),
    validUntil: typeof doc.validUntil === "string" ? doc.validUntil : undefined,
    templateId: getRendererTemplateId(document),
    verificationUrl,
  };
}
