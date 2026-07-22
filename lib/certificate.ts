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

export interface BatchCertificateDownloadItem {
  fileName: string;
  certificate: ReturnType<typeof buildVCPayload>;
}

export interface BatchCertificateZipResult {
  total: number;
  added: number;
  failedFiles: string[];
}

// Yield to the browser event loop every N files; 25 keeps large batch downloads responsive
// without adding noticeable overhead for small/medium batches.
const ZIP_YIELD_INTERVAL = 25;

export function sanitizeCertificateFileNameForZip(fileName: string): string {
  const withoutPathSegments = fileName
    .replace(/[\\/]+/g, "-")
    .replace(/\.\.+/g, "-");
  const normalized = withoutPathSegments
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return "certificate.json";
  }
  return `${normalized}.json`;
}

export async function downloadCertificatesZip(
  items: BatchCertificateDownloadItem[],
  zipName: string = "issued-certificates.zip"
): Promise<BatchCertificateZipResult> {
  const zip = new JSZip();
  const fileNames = new Set<string>();
  const failedFiles: string[] = [];
  let addedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (
      !item?.fileName ||
      item.certificate === null ||
      typeof item.certificate === "undefined"
    ) {
      failedFiles.push(item?.fileName || `certificate-${i + 1}`);
      continue;
    }

    try {
      let baseName = sanitizeCertificateFileNameForZip(item.fileName);
      let finalName = baseName;
      let duplicateCount = 1;
      while (fileNames.has(finalName)) {
        finalName = baseName.replace(/\.json$/i, `-${duplicateCount}.json`);
        duplicateCount += 1;
      }
      fileNames.add(finalName);

      const content = JSON.stringify(item.certificate, null, 2);
      zip.file(finalName, content);
      addedCount += 1;
    } catch {
      failedFiles.push(item.fileName);
    }

    if ((i + 1) % ZIP_YIELD_INTERVAL === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (addedCount === 0) {
    throw new Error("No certificates could be prepared for ZIP download.");
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);

  return {
    total: items.length,
  added: addedCount,
    failedFiles,
  };
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