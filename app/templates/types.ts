export type CertificateTemplateId = "classic" | "modern" | "minimal" | "fta";

export interface CertificateTemplateData {
  id?: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
  templateId?: string;
  verificationUrl?: string;
}

export interface TemplateOption {
  id: CertificateTemplateId;
  label: string;
  description: string;
}

// ---- Unified rendering types ----

export interface TemplateEntry {
  templateName: string;
  title?: string;
  subtitle?: string;
  lines?: (string | string[])[];
}

/** Normalized DTO passed to every renderer. */
export interface TemplateData {
  templateId: string;
  recipientName: string;
  certificateType: string;
  /** Display title (derived from entry or subject) */
  title?: string;
  /** Display subtitle (derived from entry or subject) */
  subtitle?: string;
  /** Flattened key-value lines from credentialSubject */
  lines: (string | string[])[];
  /** Original raw subject object */
  credentialSubject: Record<string, unknown>;
  /** Render-method entries from the VC */
  renderMethod: TemplateEntry[];
}

/** Renderer function type for a named template. */
export type TemplateRenderer = "classic" | "modern" | "fta" | string;

/** Visual theme for certificate rendering. */
export type Theme = "light" | "dark" | "sepia";

// ---- Registry mapping template IDs to their renderer functions. ----
export type TemplateRegistry = Record<string, (data: TemplateData) => React.ReactElement | null>;

/** Options accepted by TemplateResolver. */
export interface TemplateResolverOptions {
  templates?: TemplateRegistry;
  fallbackTemplate: string;
}
