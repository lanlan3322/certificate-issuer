"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AgentWindow from "./AgentWindow";
import { AgentAnalyticsService } from "../../lib/agent/analytics";
import { createLocalAgentResponse } from "../../lib/agent/local";
import type { AgentAction, AgentMessageData, AgentResponse } from "../../lib/agent/types";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const MEMORY_KEY = "trustvc-agent-history";
const SESSION_KEY = "trustvc-agent-session-id";
const welcome: AgentMessageData = { id: "welcome", role: "assistant", createdAt: new Date().toISOString(), content: "Welcome to Verifiable. I can help you create credentials, configure issuer details, learn DID identity, verify certificates, and manage revocation. What would you like to do?" };

export default function AgentWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<AgentMessageData[]>([welcome]);
  const [workflowState, setWorkflowState] = useState<Record<string, string>>({});
  const [databaseSessionId, setDatabaseSessionId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const openAgent = () => {
      setOpen(true);
      AgentAnalyticsService.track("widget-toggle", pathname);
    };
    window.addEventListener("trustvc-agent-open", openAgent);
    return () => window.removeEventListener("trustvc-agent-open", openAgent);
  }, [pathname]);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      return Boolean(session?.user);
    };
    void checkAuth().then(setIsAuthenticated);

    const supabase = getSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setIsAuthenticated(Boolean(session?.user));
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const createDatabaseSession = async () => {
    try {
      const response = await fetch("/api/agent/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPage: pathname }) });
      if (!response.ok) return null;
      const payload = await response.json() as { session?: { id?: string } };
      return payload.session?.id ?? null;
    } catch {
      return null;
    }
  };

  useEffect(() => { const stored = window.localStorage.getItem(MEMORY_KEY); if (stored) setMessages(JSON.parse(stored) as AgentMessageData[]); }, []);
  useEffect(() => { window.localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-40))); }, [messages]);
  useEffect(() => {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) { setDatabaseSessionId(existing); return; }
    void createDatabaseSession().then((id) => { if (id) { window.sessionStorage.setItem(SESSION_KEY, id); setDatabaseSessionId(id); } });
  }, [pathname]);

  const exitSession = async () => {
    const existingSessionId = databaseSessionId ?? window.sessionStorage.getItem(SESSION_KEY);
    if (existingSessionId) {
      await fetch(`/api/agent/session?sessionId=${encodeURIComponent(existingSessionId)}`, { method: "DELETE" }).catch(() => undefined);
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
      const request = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, context, sessionId: databaseSessionId ?? undefined }) });
      if (!request.ok) throw new Error("Agent API unavailable");
      response = await request.json() as AgentResponse;
    } catch { response = createLocalAgentResponse(content, context); }
    if (response.workflowState) setWorkflowState(response.workflowState);
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: response.message, actions: response.actions, createdAt: new Date().toISOString() }]);
    setThinking(false);
  };

  if (!isAuthenticated) return null;

  return (
    <>
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