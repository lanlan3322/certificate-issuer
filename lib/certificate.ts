// Certificate Utility Functions

import { buildVCPayload, CertificateData } from "./trustvc";
import JSZip from "jszip";
import {
  CERTIFICATE_TEMPLATES,
  formatIssuingMethodLabels,
  IssuingMethod,
  SUPPORTED_ISSUING_METHODS,
} from "./constants";

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Format date for RFC3339/ISO 8601 date-time (VC-compatible)
export function getISODateString(date: Date = new Date()): string {
  return date.toISOString();
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

  // Normalize expiry to end-of-day UTC on the computed date
  untilDate.setUTCHours(23, 59, 59, 999);
  return untilDate.toISOString();
}

// Generate a printable certificate summary
export function generateCertificateSummary(data: CertificateData): string[] {
  return [
    `Certificate Type: ${data.certificateType}`,
    `Recipient: ${data.recipientName}`,
    `Email: ${data.recipientEmail}`,
    `Issue Date: ${formatDate(data.issueDate)}`,
    `Valid From: ${formatDate(data.validFrom)}`,
    `Valid Until: ${data.validUntil ? formatDate(data.validUntil) : "Lifetime"}`,
    `Description: ${data.description}`,
    `Issuer: ${data.issuerName}`,
    `Issuing Methods: ${formatIssuingMethodLabels(data.issuingMethods)}`,
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

export function validateIssuingMethods(
  issuingMethods?: IssuingMethod[]
): ValidationResult {
  const errors: string[] = [];

  if (!issuingMethods || issuingMethods.length === 0) {
    errors.push("Select at least one issuing method");
  } else {
    const invalidMethods = issuingMethods.filter(
      (method) => !(method in SUPPORTED_ISSUING_METHODS)
    );
    if (invalidMethods.length > 0) {
      errors.push(`Unsupported issuing method: ${invalidMethods.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Create a downloadable JSON file
export function downloadCertificate(data: CertificateData): void {
  const credential = buildVCPayload(data);
  const blob = new Blob([JSON.stringify(credential, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificate-${data.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Sanitize a file name for use inside a ZIP archive
export function sanitizeCertificateFileNameForZip(fileName: string): string {
  // Replace any characters that are unsafe in ZIP entry names with underscores,
  // and collapse consecutive unsafe characters into a single underscore.
  return fileName.replace(/[^a-zA-Z0-9._\-]/g, "_").replace(/_+/g, "_");
}

// Copy text to the system clipboard
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for environments without the Clipboard API
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export interface ZipDownloadResult {
  added: number;
  total: number;
  failedFiles: string[];
}

// Download a ZIP containing multiple credential JSON files
export async function downloadCertificatesZip(
  items: Array<{ fileName: string; certificate: unknown }>,
  zipName = "issued-certificates.zip"
): Promise<ZipDownloadResult> {
  const zip = new JSZip();
  const failedFiles: string[] = [];

  items.forEach(({ fileName, certificate }) => {
    try {
      zip.file(fileName, JSON.stringify(certificate, null, 2));
    } catch {
      failedFiles.push(fileName);
    }
  });

  const added = items.length - failedFiles.length;

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { added, total: items.length, failedFiles };
}
