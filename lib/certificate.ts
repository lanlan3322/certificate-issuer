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
    `Certificate ID: ${data.certificateId}`,
  ];
}

// Validate certificate data
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DownloadCertificatesZipResult {
  total: number;
  added: number;
  failedFiles: string[];
}

const ZIP_FILE_NAME_UNSAFE_CHARS_RE = /[<>:"/\\|?*\u0000-\u001F]+/g;
const DEFAULT_ZIP_FILE_NAME = "certificate.json";

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
  a.download = `certificate-${data.certificateId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitizeCertificateFileNameForZip(fileName: string): string {
  const trimmedName = fileName.trim();

  if (!trimmedName) {
    return DEFAULT_ZIP_FILE_NAME;
  }

  const extensionIndex = trimmedName.lastIndexOf(".");
  const rawBaseName =
    extensionIndex > 0 ? trimmedName.slice(0, extensionIndex) : trimmedName;
  const rawExtension = extensionIndex > 0 ? trimmedName.slice(extensionIndex) : "";

  const sanitizedBaseName = rawBaseName
    .replace(ZIP_FILE_NAME_UNSAFE_CHARS_RE, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  const sanitizedExtension = rawExtension.replace(ZIP_FILE_NAME_UNSAFE_CHARS_RE, "");
  const safeBaseName = sanitizedBaseName || "certificate";

  return sanitizedExtension
    ? `${safeBaseName}${sanitizedExtension}`
    : `${safeBaseName}.json`;
}

function ensureUniqueZipFileName(
  fileName: string,
  usedNames: Map<string, number>
): string {
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : "";
  const nextCount = (usedNames.get(fileName) ?? 0) + 1;

  usedNames.set(fileName, nextCount);

  if (nextCount === 1) {
    return fileName;
  }

  return `${baseName}-${nextCount - 1}${extension}`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // writeText rejected (e.g. permission denied, insecure context, no user gesture);
      // fall through to the execCommand fallback below.
    }
  }

  // Fallback for browsers without the Clipboard API or where writeText rejects.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!success) {
    throw new Error("Failed to copy text to clipboard");
  }
}

// Download a ZIP containing multiple credential JSON files
export async function downloadCertificatesZip(
  items: Array<{ fileName: string; certificate: unknown }>,
  zipName = "issued-certificates.zip"
): Promise<DownloadCertificatesZipResult> {
  const zip = new JSZip();
  const result: DownloadCertificatesZipResult = {
    total: items.length,
    added: 0,
    failedFiles: [],
  };
  const usedNames = new Map<string, number>();

  items.forEach(({ fileName, certificate }) => {
    let serializedCertificate: string;

    try {
      const json = JSON.stringify(certificate, null, 2);
      // JSON.stringify returns undefined for non-serializable values (undefined,
      // functions, symbols) rather than throwing; treat those as failures.
      if (json === undefined) {
        result.failedFiles.push(fileName);
        return;
      }
      serializedCertificate = json;
    } catch {
      result.failedFiles.push(fileName);
      return;
    }

    const safeFileName = ensureUniqueZipFileName(
      sanitizeCertificateFileNameForZip(fileName),
      usedNames
    );
    zip.file(safeFileName, serializedCertificate);
    result.added += 1;
  });

  if (result.added === 0) {
    return result;
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return result;
}
