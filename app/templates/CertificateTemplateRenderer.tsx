"use client";

import ClassicTemplate from "./ClassicTemplate";
import FTATemplate from "./FTATemplate";
import MinimalTemplate from "./MinimalTemplate";
import ModernTemplate from "./ModernTemplate";
import { resolveTemplateId } from "./registry";
import { CertificateTemplateData } from "./types";

interface RendererProps {
  certificate: CertificateTemplateData;
}

export default function CertificateTemplateRenderer({ certificate }: RendererProps) {
  const templateId = resolveTemplateId(certificate.templateId);

  if (templateId === "modern") {
    return <ModernTemplate certificate={certificate} />;
  }
  if (templateId === "fta") {
    return <FTATemplate certificate={certificate} />;
  }
  if (templateId === "minimal") {
    return <MinimalTemplate certificate={certificate} />;
  }
  return <ClassicTemplate certificate={certificate} />;
}
