"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../lib/site";
import type { TemplateRecord } from "../services/TemplateService";

export function useIssuanceTemplates() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(withBasePath("/api/templates?purpose=issuance"));
        const payload = await response.json() as { templates?: TemplateRecord[]; error?: string };
        if (!response.ok || !Array.isArray(payload.templates)) {
          throw new Error(payload.error ?? "Unable to load available templates.");
        }
        if (active) setTemplates(payload.templates);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load available templates.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  return { templates, loading, error };
}
