export interface AgentAnalyticsEvent { type: string; page: string; createdAt: string; }

const KEY = "trustvc-agent-analytics";

export const AgentAnalyticsService = {
  track(type: string, page: string) {
    if (typeof window === "undefined") return;
    const events = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as AgentAnalyticsEvent[];
    window.localStorage.setItem(KEY, JSON.stringify([...events.slice(-99), { type, page, createdAt: new Date().toISOString() }]));
  },
};