export type BulkRow = {
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  [key: string]: string | undefined;
};

export interface BulkIssuanceJob {
  id: string;
  issuerName: string;
  templateId: string;
  totalRecords: number;
  validRows: number;
  invalidRows: number;
  rows: BulkRow[];
  createdAt: string;
  status: "ready" | "processing" | "complete";
}

export function validateBulkRows(rows: BulkRow[]): {
  valid: boolean;
  errors: string[];
  validRows: BulkRow[];
  invalidRows: BulkRow[];
} {
  const validRows: BulkRow[] = [];
  const invalidRows: BulkRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const name = row.recipientName?.trim();
    const email = row.recipientEmail?.trim();
    const type = row.certificateType?.trim();

    const isValid = Boolean(name && email && type && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    if (isValid) {
      validRows.push(row);
    } else {
      invalidRows.push(row);
      errors.push(`Row ${index + 2}: invalid recipient data for ${row.recipientEmail || "unknown email"}`);
    }
  });

  return {
    valid: invalidRows.length === 0,
    errors,
    validRows,
    invalidRows,
  };
}

export function buildBulkIssuanceJob(input: {
  issuerName: string;
  rows: BulkRow[];
  templateId?: string;
}): BulkIssuanceJob {
  const validation = validateBulkRows(input.rows);

  return {
    id: `bulk-${Date.now()}`,
    issuerName: input.issuerName,
    templateId: input.templateId ?? "classic",
    totalRecords: input.rows.length,
    validRows: validation.validRows.length,
    invalidRows: validation.invalidRows.length,
    rows: validation.validRows,
    createdAt: new Date().toISOString(),
    status: validation.validRows.length > 0 ? "ready" : "complete",
  };
}

export function summarizeBulkJob(job: BulkIssuanceJob): {
  status: string;
  validRows: number;
  totalRecords: number;
  invalidRows: number;
  templateId: string;
} {
  return {
    status: job.validRows > 0 ? "ready" : "complete",
    validRows: job.validRows,
    totalRecords: job.totalRecords,
    invalidRows: job.invalidRows,
    templateId: job.templateId,
  };
}
