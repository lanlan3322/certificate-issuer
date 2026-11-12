"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import AgentWindow from "./AgentWindow";
import { AgentAnalyticsService } from "../../lib/agent/analytics";
import { createLocalAgentResponse } from "../../lib/agent/local";
import type { AgentAction, AgentMessageData, AgentResponse } from "../../lib/agent/types";
import { withBasePath } from "../../lib/site";
import { useWorkspaceSession } from "../WorkspaceSession";

const MEMORY_KEY = "trustvc-agent-history";
const SESSION_KEY = "trustvc-agent-session-id";
const welcome: AgentMessageData = { id: "welcome", role: "assistant", createdAt: new Date().toISOString(), content: "Welcome to Verifiable. I can help you find pages, create credentials, configure issuer details, verify certificates, and manage revocation. What would you like to do?" };

export default function AgentWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useWorkspaceSession();
  const isAuthenticated = Boolean(user);
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<AgentMessageData[]>([welcome]);
  const [workflowState, setWorkflowState] = useState<Record<string, string>>({});
  const [databaseSessionId, setDatabaseSessionId] = useState<string | null>(null);
  const sessionRequest = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const openAgent = () => {
      setOpen(true);
      AgentAnalyticsService.track("widget-toggle", pathname);
    };
    window.addEventListener("trustvc-agent-open", openAgent);
    return () => window.removeEventListener("trustvc-agent-open", openAgent);
  }, [pathname]);

  const createDatabaseSession = useCallback(() => {
    if (sessionRequest.current) return sessionRequest.current;
    const request = (async () => {
      try {
        const response = await fetch(withBasePath("/api/agent/session"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPage: pathname }) });
        const payload = await response.json() as { session?: { id?: string }; error?: string };
        if (!response.ok || !payload.session?.id) throw new Error(payload.error ?? "Unable to create an assistant session.");
        window.sessionStorage.setItem(SESSION_KEY, payload.session.id);
        return payload.session.id;
      } catch (reason) {
        setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", createdAt: new Date().toISOString(),
          content: `${reason instanceof Error ? reason.message : "Unable to connect to the assistant."} Conversation persistence is unavailable.` }]);
        return null;
      }
    })();
    sessionRequest.current = request;
    void request.finally(() => { sessionRequest.current = null; });
    return request;
  }, [pathname]);

  useEffect(() => { const stored = window.localStorage.getItem(MEMORY_KEY); if (stored) setMessages(JSON.parse(stored) as AgentMessageData[]); }, []);
  useEffect(() => { window.localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-40))); }, [messages]);
  useEffect(() => {
    if (!open || !isAuthenticated) return;
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) { setDatabaseSessionId(existing); return; }
    let active = true;
    void createDatabaseSession().then((id) => { if (active && id) setDatabaseSessionId(id); });
    return () => { active = false; };
  }, [createDatabaseSession, open, isAuthenticated]);

  const exitSession = async () => {
    const existingSessionId = databaseSessionId ?? await sessionRequest.current ?? window.sessionStorage.getItem(SESSION_KEY);
    if (existingSessionId) {
      try {
        const response = await fetch(withBasePath(`/api/agent/session?sessionId=${encodeURIComponent(existingSessionId)}`), { method: "DELETE" });
        if (!response.ok) throw new Error("Unable to end the previous assistant session. Please try again.");
      } catch (reason) {
        setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", createdAt: new Date().toISOString(),
          content: reason instanceof Error ? reason.message : "Unable to end the assistant session." }]);
        return;
      }
    }
    window.localStorage.removeItem(MEMORY_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    setWorkflowState({});
    setMessages([{ ...welcome, id: crypto.randomUUID(), createdAt: new Date().toISOString(), content: "New session started. I have cleared the previous conversation and workflow state. How can I help?" }]);
    const newSessionId = await createDatabaseSession();
    if (newSessionId) {
      window.sessionStorage.setItem(SESSION_KEY, newSessionId);
      setDatabaseSessionId(newSessionId);
    } else {
      setDatabaseSessionId(null);
    }
    AgentAnalyticsService.track("session-exit", pathname);
  };

  const runAction = (action: AgentAction) => {
    AgentAnalyticsService.track(`action:${action.type}`, pathname);
    if (action.type === "navigate") return router.push(action.href);
    if (action.type === "prefillForm") { window.sessionStorage.setItem("trustvc-agent-prefill", JSON.stringify(action.values)); router.push(action.href); return; }
    window.dispatchEvent(new CustomEvent("trustvc-agent-action", { detail: action }));
  };

  const send = async (content: string) => {
    if (content.trim().toLowerCase() === "/exit") {
      await exitSession();
      return;
    }
    const userMessage: AgentMessageData = { id: crypto.randomUUID(), role: "user", content, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, userMessage]);
    setThinking(true);
    AgentAnalyticsService.track("question", pathname);
    const context = { currentPage: pathname, userAction: content, workflowState };
    let response: AgentResponse;
    try {
      const request = await fetch(withBasePath("/api/agent"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, context, sessionId: databaseSessionId ?? undefined }) });
      if (!request.ok) throw new Error("Agent API unavailable");
      response = await request.json() as AgentResponse;
    } catch { response = createLocalAgentResponse(content, context, user); }
    if (response.workflowState) setWorkflowState(response.workflowState);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: response.message, actions: response.actions, createdAt: new Date().toISOString() }]);
    setThinking(false);
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {!open && <button type="button" aria-label="Open Issuer Success Agent"
        onClick={() => { setOpen(true); AgentAnalyticsService.track("widget-toggle", pathname); }}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-700 text-white shadow-lg hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 sm:bottom-6 sm:right-6 print:hidden">
        <Bot aria-hidden="true" className="h-7 w-7" />
      </button>}
      {open && (
        <AgentWindow
          page={pathname}
          messages={messages}
          isThinking={thinking}
          onClose={() => setOpen(false)}
          onSend={send}
          onAction={runAction}
        />
      )}
    </>
  );
}