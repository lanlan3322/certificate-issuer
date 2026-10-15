"use client";

import ClassicTemplate from "./ClassicTemplate";
import FTATemplate from "./FTATemplate";
import MinimalTemplate from "./MinimalTemplate";
import ModernTemplate from "./ModernTemplate";
import { resolveTemplateId } from "./registry";
import { CertificateTemplateData, Theme } from "./types";

interface RendererProps {
  certificate: CertificateTemplateData;
  theme?: Theme;
}

const DEFAULT_THEME: Theme = "light";

export default function CertificateTemplateRenderer({ certificate, theme }: RendererProps) {
  const templateId = resolveTemplateId(certificate.templateId);
  const t = theme ?? DEFAULT_THEME;

  let content: React.ReactNode;

  if (templateId === "modern") {
    content = <ModernTemplate certificate={certificate} theme={t} />;
  } else if (templateId === "fta") {
    content = <FTATemplate certificate={certificate} theme={t} />;
  } else if (templateId === "minimal") {
    content = <MinimalTemplate certificate={certificate} theme={t} />;
  } else {
    content = <ClassicTemplate certificate={certificate} theme={t} />;
  }

  return (
    <div className="flex min-h-[297mm] w-full flex-col">
      <div className="flex-1">{content}</div>
      <div className="mt-8 flex items-end gap-6 border-t border-gray-200 pt-5 sm:gap-8">
        <div className="ml-auto text-xs text-gray-400">verifiable.sg</div>
      </div>
    </div>
  );
}
