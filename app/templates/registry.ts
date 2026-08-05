import { CertificateTemplateId, TemplateOption } from "./types";

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "classic",
    label: "Classic Gold",
    description: "Formal certificate layout with ornamental styling.",
  },
  {
    id: "modern",
    label: "Modern Gradient",
    description: "Bold contemporary style with accent gradients.",
  },
  {
    id: "minimal",
    label: "Minimal Mono",
    description: "Clean, understated monochrome presentation.",
  },
  {
    id: "fta",
    label: "FTA Academy",
    description: "Formal academy-style certificate with signature and seal footer.",
  },
];

export const DEFAULT_TEMPLATE_ID: CertificateTemplateId = "classic";

export function resolveTemplateId(templateId?: string): CertificateTemplateId {
  if (
    templateId === "classic" ||
    templateId === "modern" ||
    templateId === "minimal" ||
    templateId === "fta"
  ) {
    return templateId;
  }
  return DEFAULT_TEMPLATE_ID;
}
