/** Internal utilities: pure renderers and template resolution logic. */

import { createElement as h } from "react";
import type { TemplateEntry, TemplateData, TemplateRegistry } from "./types";

// ---------- helpers ----------------------------------------------------------

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function safeStr(v: unknown): string {
  return (v ?? "").toString();
}

// ---------- built-in renderers -----------------------------------------------

export function renderClassic(data: TemplateData): React.ReactElement | null {
  const header = `
    <header style="text-align:center;margin-bottom:16px;position:relative;">
      <div style="display:inline-block;text-align:center;padding:14px 28px;">
        <h1 style="font-size:30px;font-weight:bold;margin:0;color:#2D3748;">${safeStr(data.title || data.certificateType)}</h1>
        ${data.subtitle ? `<p style="font-size:15px;color:#4A5568;margin-top:4px;letter-spacing:.5px;">${safeStr(data.subtitle)}</p>` : ""}
      </div>
      <div style="position:absolute;top:50%;left:-32px;transform:translateY(-50%);font-size:16px;color:#B794F4;font-weight:bold;">&#10022;</div>
      <div style="position:absolute;top:50%;right:-32px;transform:translateY(-50%);font-size:16px;color:#B794F4;font-weight:bold;">&#10022;</div>
    </header>
    <hr style="border:none;height:2px;background:linear-gradient(to right,#805AD5,#ED64A6,#DD6B20);margin:0 0 20px 0;" />
  `;
  const footer = `<hr style="border:none;height:2px;background:linear-gradient(to right,#ED64A6,#DD6B20,#805AD5);margin:20px 0 0 0;" />`;
  return h("div", { className: "p-6" }, [h("div", null, [header, body(), footer])]);

  function body(): string {
    const lines = data.lines ?? [];
    let html = "";
    for (const item of lines) {
      if (typeof item === "string") {
        html += `<p style="margin:4px 0;">${item}</p>`;
      } else if (Array.isArray(item)) {
        html += `<div style="display:flex;margin:8px 0;gap:24px;">`;
        for (const col of item as string[]) {
          html += `<div style="flex:1;padding-left:16px;border-left:3px solid #E9D8FD;font-size:15px;line-height:1.7;color:#4A5568;">${col}</div>`;
        }
        html += `</div>`;
      }
    }
    return html;
  }
}


export function renderModern(data: TemplateData): React.ReactElement | null {
  const header = `<header style="text-align:center;margin-bottom:20px;"><h1 style="font-size:36px;font-weight:bold;margin:8px 0;color:#1A202C;">${safeStr(data.title || data.certificateType)}</h1>${data.subtitle ? `<p style="font-size:16px;color:#4A5568;margin-top:6px;">${safeStr(data.subtitle)}</p>` : ""}</header>`;
  const footer = '<hr style="border:none;height:3px;background:linear-gradient(to right,#DD6B20,#ED64A6,#805AD5);margin:20px 0 0 0;" />';
  return h("div", { className: "p-6" }, [h("div", null, [header, body(), footer])]);

  function body(): string {
    let html = "<div style=\"display:flex;flex-wrap:wrap;gap:28px;\">";
    for (const item of data.lines ?? []) {
      if (typeof item === "string") continue;
      if (Array.isArray(item)) {
        for (const col of item as string[]) {
          html += `<div style="flex:1 1 calc(50% - 14px);font-size:16px;line-height:2;color:#374151;">${col}</div>`;
        }
      }
    }
    html += "</div>";
    return html;
  }
}

export function renderFTA(data: TemplateData): React.ReactElement | null {
  const header = `
    <header style="text-align:center;margin-bottom:16px;">
      <p style="font-size:20px;color:#4A5568;font-weight:500;letter-spacing:.5px;">${safeStr(data.subtitle || "")}</p>
      <h1 style="font-size:30px;font-weight:bold;margin:6px 0;color:#1A202C;">${safeStr(data.title || data.certificateType)}</h1>
    </header>
  `;

  const lines = data.lines ?? [];
  let bodyHTML = "";

  for (const item of lines) {
    if (typeof item === "string") {
      bodyHTML += `<p style="margin:4px 0;font-size:15px;color:#2D3748;">${item}</p>`;
    } else if (Array.isArray(item)) {
      bodyHTML += "<div style=\"display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;\">";
      for (const col of item as string[]) {
        bodyHTML += `<div style="padding:8px 14px;font-size:14px;line-height:1.7;color:#374151;background:#F9FAFB;border-radius:8px;">${col}</div>`;
      }
      bodyHTML += "</div>";
    }
  }

  return h("div", { className: "p-6" }, [h("div", null, [header, `<div style="margin-bottom:12px;">${bodyHTML}</div>`, '<hr style="border:none;height:3px;background:linear-gradient(to right,#F6AD55,#FC8181);margin:12px 0;" />' ])]);
}


// ---------- resolveTemplateId ------------------------------------------------

export function resolveTemplateId(
  maybeValue?: string,
  fallback = "classic",
): string {
  if (!maybeValue || typeof maybeValue !== "string") return fallback;
  const trimmed = maybeValue.trim();
  const stripped = (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ? trimmed.slice(1, -1)
    : trimmed;
  if (STANDARD_TEMPLATES.has(stripped)) return stripped;
  return fallback;
}

const STANDARD_TEMPLATES = new Set(["classic", "modern", "fta"]);

// ---------- template helpers -------------------------------------------------

export function getBuiltInTemplates(): TemplateRegistry {
  return { classic: renderClassic, modern: renderModern, fta: renderFTA };
}

export function getTemplateRegistry(extra: TemplateRegistry): TemplateRegistry {
  const builtins = getBuiltInTemplates();
  for (const [name, renderer] of Object.entries(builtins)) {
    if (!(name in extra)) {
      extra[name] = renderer;
    }
  }
  return extra;
}


// ---------- TemplateResolver (stateful) --------------------------------------

export interface TemplateResolverOptions {
  templates?: TemplateRegistry;
  fallbackTemplate?: string;
}

/** Stateful resolver that caches loaded template renderers. */
export class TemplateResolver {
  private registry: TemplateRegistry | null = null;
  readonly options: TemplateResolverOptions;

  constructor(options?: TemplateResolverOptions) {
    this.options = { fallbackTemplate: "classic", ...options };
  }

  getTemplates(): TemplateRegistry {
    if (this.registry) return this.registry;
    const builtins = getBuiltInTemplates();
    if (!this.options.templates) {
      this.registry = builtins;
      return this.registry;
    }
    const merged: TemplateRegistry = { ...builtins };
    for (const [name, fn] of Object.entries(this.options.templates)) {
      merged[name] = fn;
    }
    this.registry = merged;
    return this.registry;
  }

  getRenderer(templateId: string) {
    const registry = this.getTemplates();
    return registry[templateId] ?? null;
  }

  resolveTemplateId(maybeValue?: string): string {
    return resolveTemplateId(maybeValue, this.options.fallbackTemplate);
  }

  /** Build the TemplateData object from raw credentialSubject + renderMethod. */
  buildTemplateData(rawSubject: Record<string, unknown>, rawMethods: Array<Record<string, unknown>> | undefined): TemplateData {
    const subject = this.asObject(rawSubject);
    const lines: (string | string[])[] = [];

    if (subject) {
      for (const [key, value] of Object.entries(subject)) {
        if (["recipientName", "recipient_name", "templateId", "template_id"].includes(key) || key.toLowerCase().startsWith("recipient")) continue;
        if (value === undefined || value === null) continue;
        if (typeof value === "object") lines.push(`${key}: ${JSON.stringify(value)}`);
        else lines.push(`${key}: ${String(value)}`);
      }
    }

    const methods: TemplateEntry[] = [];
    if (Array.isArray(rawMethods)) {
      for (const m of rawMethods) {
        if (!this.asObject(m)) continue;
        const entry: TemplateEntry = { templateName: String((m as Record<string, string>).templateName ?? "") };
        const params = this.asObject(m.params);
        if (params) {
          entry.title = String(params.title ?? "");
          entry.subtitle = String(params.subtitle ?? "");
          const linesParam = params.lines;
          if (Array.isArray(linesParam)) {
            entry.lines = linesParam.map((l: unknown) => (typeof l === "string" ? [l] : Array.isArray(l) ? (l as string[]) : []));
          }
        }
        methods.push(entry);
      }
    }

    const data: TemplateData = {
      templateId: this.resolveTemplateId((subject?.templateId as string) ?? (subject?.template_id as string) ?? undefined),
      recipientName: String(subject?.recipientName ?? ""),
      certificateType: "",
      lines,
      credentialSubject: subject ?? {},
      renderMethod: methods,
    };

    if (methods.length > 0) {
      const first = methods[0];
      data.templateId = first.templateName || data.templateId;
      if (first.title) data.title = first.title;
      if (first.subtitle) data.subtitle = first.subtitle;
      if (first.lines && first.lines.length > 0) data.lines = first.lines;
    }

    return data;
  }

  // ---------- utils ---------------------------------------------------------

  private asObject(v: unknown): Record<string, unknown> | null {
    return isPlainObject(v) ? v : null;
  }
}
