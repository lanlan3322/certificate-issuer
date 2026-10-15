/**
 * CertificateRenderer – orchestrator component.
 * Resolves the correct template, maps raw VCD data to TemplateData via TemplateResolver,
 * and delegates rendering to either a custom or built-in renderer.
 */

"use client";

import type { TemplateData } from "../templates/types";
import { TemplateResolver, resolveTemplateId, getBuiltInTemplates, isPlainObject, safeStr } from "../templates/certificateRendererInternal";
import { CertificateTemplate } from "./CertificateTemplate";

interface Props {
  /** Raw credentialSubject from a VerifiableCredential */
  credentialSubject?: Record<string, unknown>;
  /** Raw renderMethods array from a VerifiableCredential */
  renderMethod?: Array<Record<string, unknown>>;
  /** Override template name */
  templateName?: string;
  /** Optional custom renderer for "render-method" style certs */
  customRenderer?: (data: TemplateData) => React.ReactElement | null;
}

export function CertificateRenderer(props: Props) {
  const resolver = new TemplateResolver();

  if (!props.credentialSubject && !props.renderMethod) {
    return <div className="p-6 text-center text-gray-500">No certificate data to render.</div>;
  }

  // Resolve template name
  let resolvedTemplateId: string;
  if (props.customRenderer) {
    resolvedTemplateId = props.templateName || "modern";
  } else if (props.credentialSubject && isPlainObject(props.credentialSubject)) {
    const candidate = props.credentialSubject.templateId ?? props.credentialSubject.template_id ?? props.templateName;
    resolvedTemplateId = resolveTemplateId(typeof candidate === "string" ? candidate : undefined, "classic");
  } else {
    resolvedTemplateId = resolveTemplateId(props.templateName, "classic");
  }

  // Build TemplateData
  const rawSubject: Record<string, unknown> = props.credentialSubject ?? {};
  const templateData: TemplateData = resolver.buildTemplateData(rawSubject, props.renderMethod);

  // Select renderer
  const renderer = props.customRenderer ?? resolver.getRenderer(resolvedTemplateId) ?? null;

  if (!renderer) {
    return <div className="p-6 text-center text-gray-500">No renderer found for template: {resolvedTemplateId}</div>;
  }

  return (
    <CertificateTemplate
      data={templateData}
      renderer={resolvedTemplateId}
    />
  );
}
