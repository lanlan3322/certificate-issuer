/** Certificate entry shape for credential metadata used across issuance. */
export type CertEntry = {
  id?: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  issuerName: string;
  issueDate: string;
  signedDate?: string;
  description: string;
  certificateNo?: string;
  courseLength?: number;
  validFrom: string;
  validUntil?: string;
  templateId?: string;
  status: string;
};