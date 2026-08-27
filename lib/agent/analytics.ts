import { withBasePath } from "../site";

/**
 * Client-side analytics reporter. Posts to the server so events land in
 * audit_logs attributed to the signed-in issuer; silently no-ops for anonymous
 * visitors, whose events the API rejects with 401.
 */
export const AgentAnalyticsService = {
  track(type: string, page: string) {
    if (typeof window === "undefined") return;
    void fetch(withBasePath("/api/agent/analytics"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: `agent.${type}`, metadata: { page } }),
      keepalive: true,
    }).catch(() => undefined);
  },
};
