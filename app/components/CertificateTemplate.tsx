/**
 * CertificateTemplate – pure visual component.
 * Renders a single certificate page using a TemplateData DTO and an optional custom renderer.
 */

import type { TemplateData, TemplateRenderer } from "../templates/types";

interface Props {
  data: TemplateData;
  renderer?: TemplateRenderer;
}

const DEFAULT_RENDERER = "classic" as const;

export function CertificateTemplate({ data, renderer }: Props) {
  const renderMethod = typeof window !== "undefined"
    ? (renderer || DEFAULT_RENDERER)
    : DEFAULT_RENDERER;

  return <div>{`[CertificateTemplate:${renderMethod}]`}</div>;
}
