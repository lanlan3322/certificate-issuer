export type TemplateFieldDefinition = {
  key: string;
  label: string;
  value?: string;
  required?: boolean;
  type?: "text" | "date" | "number" | "select";
};

export type TemplateDefinition = {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  accentColor: string;
  description: string;
  fields: TemplateFieldDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type RevocationStatus = "active" | "suspended" | "revoked";

export interface RevocationHistoryEntry {
  action: "create" | "revoke" | "suspend" | "reinstate";
  reason: string;
  at: string;
}

export interface RevocationRecord {
  credentialId: string;
  status: RevocationStatus;
  reason: string;
  history: RevocationHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

function interpolateTemplate(text: string, values: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

export function createTemplateDefinition(input: {
  id?: string;
  name: string;
  title: string;
  subtitle: string;
  accentColor?: string;
  description: string;
  fields?: TemplateFieldDefinition[];
}): TemplateDefinition {
  const timestamp = new Date().toISOString();

  return {
    id: input.id ?? `template-${Date.now()}`,
    name: input.name,
    title: input.title,
    subtitle: input.subtitle,
    accentColor: input.accentColor ?? "#111827",
    description: input.description,
    fields: input.fields ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function renderTemplateText(
  template: TemplateDefinition,
  values: Record<string, string | undefined>
): {
  title: string;
  subtitle: string;
  description: string;
  fields: Array<{ key: string; label: string; value: string; required: boolean }>;
} {
  return {
    title: interpolateTemplate(template.title, values),
    subtitle: interpolateTemplate(template.subtitle, values),
    description: interpolateTemplate(template.description, values),
    fields: template.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: interpolateTemplate(field.value ?? "", values),
      required: Boolean(field.required),
    })),
  };
}

export function createRevocationRecord(
  credentialId: string,
  reason: string
): RevocationRecord {
  const now = new Date().toISOString();

  return {
    credentialId,
    status: "active",
    reason,
    history: [
      {
        action: "create",
        reason,
        at: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function revokeCredential(record: RevocationRecord, reason: string): RevocationRecord {
  const now = new Date().toISOString();

  return {
    ...record,
    status: "revoked",
    reason,
    updatedAt: now,
    history: [
      ...record.history,
      {
        action: "revoke",
        reason,
        at: now,
      },
    ],
  };
}

export function suspendCredential(record: RevocationRecord, reason: string): RevocationRecord {
  const now = new Date().toISOString();

  return {
    ...record,
    status: "suspended",
    reason,
    updatedAt: now,
    history: [
      ...record.history,
      {
        action: "suspend",
        reason,
        at: now,
      },
    ],
  };
}

export function reinstateCredential(record: RevocationRecord, reason: string): RevocationRecord {
  const now = new Date().toISOString();

  return {
    ...record,
    status: "active",
    reason,
    updatedAt: now,
    history: [
      ...record.history,
      {
        action: "reinstate",
        reason,
        at: now,
      },
    ],
  };
}
