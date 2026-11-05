"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthUser } from "../lib/auth";
import { withBasePath } from "../lib/site";

interface SessionContext {
  user: AuthUser | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const WorkspaceSession = createContext<SessionContext | null>(null);

export function WorkspaceSessionProvider({ initialUser, children }: { initialUser: AuthUser | null; children: ReactNode }) {
  const [user, setUser] = useState(initialUser);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const revision = useRef(0);

  useEffect(() => {
    revision.current += 1;
    setUser(initialUser);
    setError(null);
  }, [initialUser]);

  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const requestRevision = revision.current;
    const request = (async () => {
      try {
        const response = await fetch(withBasePath("/api/auth/me"), { method: "POST", cache: "no-store" });
        const payload = await response.json() as { user?: AuthUser | null; error?: string };
        if (!response.ok || !Object.hasOwn(payload, "user")) throw new Error(payload.error ?? "Unable to refresh your session. Reload the page to try again.");
        if (requestRevision === revision.current) {
          setUser(payload.user ?? null);
          setError(null);
        }
      } catch (reason) {
        if (requestRevision === revision.current) {
          setUser(null);
          setError(reason instanceof Error ? reason.message : "Unable to refresh your session.");
        }
      }
    })();
    pending.current = request;
    void request.finally(() => { pending.current = null; });
    return request;
  }, []);

  useEffect(() => {
    const changed = () => { void refresh(); };
    window.addEventListener("trustvc-auth-changed", changed);
    return () => window.removeEventListener("trustvc-auth-changed", changed);
  }, [refresh]);

  return <WorkspaceSession.Provider value={{ user, error, refresh }}>{children}</WorkspaceSession.Provider>;
}

export function useWorkspaceSession(): SessionContext {
  const session = useContext(WorkspaceSession);
  if (!session) throw new Error("WorkspaceSessionProvider is required.");
  return session;
}
