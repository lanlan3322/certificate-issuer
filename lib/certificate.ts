// Certificate Utility Functions

import { CertificateData } from "./trustvc";
import { CERTIFICATE_TEMPLATES } from "./constants";

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Format date for ISO string
export function getISODateString(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

// Calculate valid until date
export function calculateValidUntil(
  validFrom: string,
  templateName: string
): string {
  const template = Object.values(CERTIFICATE_TEMPLATES).find(
    (t) => t.name === templateName
  );
  const years = template?.validForYears ?? 1;

  const fromDate = new Date(validFrom);
  const untilDate = new Date(fromDate);
  untilDate.setFullYear(untilDate.getFullYear() + years);

  return getISODateString(untilDate);
}

// Get certificate template info
export function getTemplateInfo(certificateType: string) {
  return (
    Object.values(CERTIFICATE_TEMPLATES).find(
      (t) => t.name === certificateType
    ) ?? {
      name: certificateType,
      description: "Custom certificate",
      validForYears: 1,
    }
  );
}

// Generate a printable certificate summary
export function generateCertificateSummary(data: CertificateData): string[] {
  const template = getTemplateInfo(data.certificateType);
  return [
    `Certificate Type: ${data.certificateType}`,
    `Recipient: ${data.recipientName}`,
    `Email: ${data.recipientEmail}`,
    `Issue Date: ${formatDate(data.issueDate)}`,
    `Valid From: ${formatDate(data.validFrom)}`,
    `Valid Until: ${data.validUntil ? formatDate(data.validUntil) : "Lifetime"}`,
    `Description: ${data.description}`,
    `Issuer: ${data.issuerName}`,
    `Certificate ID: ${data.id}`,
  ];
}

// Validate certificate data
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCertificateData(
  data: Partial<CertificateData>
): ValidationResult {
  const errors: string[] = [];

  if (!data.recipientName?.trim()) {
    errors.push("Recipient name is required");
  }

  if (!data.recipientEmail?.trim()) {
    errors.push("Recipient email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.recipientEmail)) {
    errors.push("Invalid email format");
  }

  if (!data.certificateType?.trim()) {
    errors.push("Certificate type is required");
  }

  if (!data.description?.trim()) {
    errors.push("Description is required");
  }

  return { valid: errors.length === 0, errors };
}

// Create a downloadable JSON file
export function downloadCertificate(data: CertificateData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificate-${data.id.split(":")[2]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Copy to clipboard helper
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}