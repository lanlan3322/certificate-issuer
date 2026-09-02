import { getSupabaseServerClient } from "../lib/supabase/server";

export const AgentMemoryService = {
  async createSession(input: { issuerId?: string; userId?: string; currentPage?: string; workflow?: string; state?: Record<string, unknown>; }) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("agent_sessions").insert({
      issuer_id: input.issuerId ?? null,
      user_id: input.userId ?? null,
      current_page: input.currentPage ?? "/",
      current_workflow: input.workflow ?? null,
      session_state: JSON.stringify(input.state ?? {}),
    }).select().single();
    if (error) throw error;
    return data;
  },

  async ownsSession(sessionId: string, userId: string | null) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("agent_sessions").select("id").eq("id", sessionId).is("user_id", userId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async saveConversation(sessionId: string, role: "user" | "assistant" | "system", content: string, metadata: Record<string, unknown> = {}) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("agent_messages").insert({
      session_id: sessionId,
      role,
      content,
      metadata: JSON.stringify(metadata),
    }).select().single();
    if (error) throw error;
    return data;
  },

  async loadConversation(sessionId: string, userId: string | null) {
    const supabase = await getSupabaseServerClient();
    const { data: sessions, error: sessErr } = await supabase.from("agent_sessions").select("id").eq("id", sessionId).is("user_id", userId).maybeSingle();
    if (sessErr) throw sessErr;
    if (!sessions) return [];

    const { data, error } = await supabase.from("agent_messages").select("*").eq("session_id", sessionId).order("created_at");
    if (error) throw error;
    return data ?? [];
  },

  async saveWorkflowState(sessionId: string, state: Record<string, unknown>, currentPage?: string, workflow?: string) {
    const supabase = await getSupabaseServerClient();
    const updates: Record<string, unknown> = { session_state: JSON.stringify(state) };
    if (currentPage !== undefined) updates.current_page = currentPage;
    if (workflow !== undefined) updates.current_workflow = workflow ?? null;

    const { data, error } = await supabase.from("agent_sessions").update(updates).eq("id", sessionId).select().single();
    if (error) throw error;
    return data;
  },

  async loadWorkflowState(sessionId: string, userId: string | null) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("agent_sessions").select("session_state, current_page, current_workflow").eq("id", sessionId).is("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async clearSession(sessionId: string, userId: string | null) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("agent_sessions")
      .delete()
      .eq("id", sessionId)
      .is("user_id", userId)
      .select("id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },
};
