// Batch Certificate Parsing Utilities

import { validateCertificateData } from "./certificate";
import { CERTIFICATE_TEMPLATES } from "./constants";

export interface BatchRow {
  rowIndex: number;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  description: string;
  certificateNo?: string;
  courseLength?: number;
  issueDate?: string;
  signedDate?: string;
  hasValidity?: boolean;
  validFrom?: string;
  validUntil?: string;
  errors: string[];
  status: "pending" | "issuing" | "success" | "error";
  txHash?: string;
  issueError?: string;
}

const VALID_CERTIFICATE_TYPES = Object.values(CERTIFICATE_TEMPLATES).map(
  (t) => t.name
);

// Map a set of header names and cell values into a BatchRow
function cellsToRow(
  headers: string[],
  cells: string[],
  rowIndex: number
): BatchRow {
  const getCell = (aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1 && idx < cells.length) {
        return cells[idx].trim();
      }
    }
    return "";
  };

  const recipientName = getCell(["recipientname", "recipient name", "name"]);
  const recipientEmail = getCell([
    "recipientemail",
    "recipient email",
    "email",
  ]);
  const certificateType = getCell([
    "certificatetype",
    "certificate type",
    "type",
  ]);
  const description = getCell(["description", "achievement"]);
  const certificateNo = getCell(["certificateno", "certificate no"]);
  const courseLength = getCell(["courselength", "course length"]);
  const issueDate = getCell(["issuedate", "issue date", "issuing date"]);
  const signedDate = getCell(["signeddate", "signed date"]);
  const hasValidity = getCell(["hasvalidity", "has validity"]).toLowerCase();
  const validFrom = getCell(["validfrom", "valid from"]);
  const validUntil = getCell(["validuntil", "valid until"]);

  const validation = validateCertificateData({
    recipientName,
    recipientEmail,
    certificateType,
    description,
  });

  const errors = [...validation.errors];

  if (courseLength && (!/^\d+$/.test(courseLength) || !Number.isSafeInteger(Number(courseLength)) || Number(courseLength) <= 0)) {
    errors.push("Course length must be a positive whole number");
  }
  if (hasValidity && hasValidity !== "true" && hasValidity !== "false") {
    errors.push("Has validity must be true or false");
  }
  for (const [label, value] of [
    ["Issue date", issueDate],
    ["Signed date", signedDate],
    ["Valid from", validFrom],
    ["Valid until", validUntil],
  ]) {
    if (value) {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        errors.push(`${label} must be a valid YYYY-MM-DD date`);
      }
    }
  }
  if (hasValidity !== "false" && validFrom && validUntil && validUntil < validFrom) {
    errors.push("Valid until date must be on or after valid from date");
  }

  // Validate certificate type value if one is provided
  if (
    certificateType.trim() &&
    !(VALID_CERTIFICATE_TYPES as string[]).includes(certificateType)
  ) {
    errors.push(
      `Unknown certificate type. Valid: ${VALID_CERTIFICATE_TYPES.join(", ")}`
    );
  }

  return {
    rowIndex,
    recipientName,
    recipientEmail,
    certificateType,
    description,
    certificateNo: certificateNo || undefined,
    courseLength: courseLength ? Number(courseLength) : undefined,
    issueDate: issueDate || undefined,
    signedDate: signedDate || undefined,
    hasValidity: hasValidity === "" ? undefined : hasValidity === "true",
    validFrom: validFrom || undefined,
    validUntil: validUntil || undefined,
    errors,
    status: "pending",
  };
}

// --- CSV parsing ---

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseCSV(text: string): BatchRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/^"|"$/g, "")
  );
  const rows: BatchRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map((c) =>
      c.trim().replace(/^"|"$/g, "")
    );
    rows.push(cellsToRow(headers, cells, i));
  }

  return rows;
}

// --- Excel parsing (browser only, uses dynamic import) ---

export async function parseExcel(file: File): Promise<BatchRow[]> {
  // Dynamic import ensures the library is only loaded in the browser
  const mod = await import("read-excel-file/browser");
  const readXlsxFile = (mod.default ?? mod) as unknown as (
    f: File
  ) => Promise<(string | number | boolean | Date | null)[][]>;

  const sheetRows = await readXlsxFile(file);

  if (sheetRows.length < 2) return [];

  const headers = sheetRows[0].map((h) =>
    (h == null ? "" : String(h)).trim().toLowerCase()
  );

  const result: BatchRow[] = [];
  for (let i = 1; i < sheetRows.length; i++) {
    const cells = sheetRows[i].map((c) =>
      (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? "" : String(c)).trim()
    );
    result.push(cellsToRow(headers, cells, i));
  }

  return result;
}

// --- Sample template ---

export function generateSampleCSV(): string {
  const header = "recipientName,recipientEmail,certificateType,description,certificateNo,courseLength,issueDate,signedDate,hasValidity,validFrom,validUntil";
  const today = new Date();
  const issueDate = today.toISOString().slice(0, 10);
  const nextYear = new Date(today);
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  const validUntil = nextYear.toISOString().slice(0, 10);
  const examples = [
    `Ahmad bin Rahman,ahmad@example.com,Professional Certificate,Certified in AI Governance,FTA-001,40,${issueDate},${issueDate},true,${issueDate},${validUntil}`,
    "Siti Nurhaliza,siti@example.com,Certificate of Completion,Completed Data Ethics Workshop,FTA-002,8,,,false,,",
    "David Chen,david@example.com,Certificate of Achievement,Excellence in Cloud Architecture,,,,,,,",
  ];
  return [header, ...examples].join("\n");
}
