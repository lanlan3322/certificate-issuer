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
}

export interface TemplateOption {
  id: CertificateTemplateId;
  label: string;
  description: string;
}
