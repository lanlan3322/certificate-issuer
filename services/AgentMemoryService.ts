import { query } from "../lib/db";

export const AgentMemoryService = {
  async createSession(input: { issuerId?: string; userId?: string; currentPage?: string; workflow?: string; state?: Record<string, unknown>; }) {
    const result = await query<Record<string, unknown>>(
      "INSERT INTO agent_sessions (issuer_id,user_id,current_page,current_workflow,session_state) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [input.issuerId ?? null, input.userId ?? null, input.currentPage ?? "/", input.workflow ?? null, JSON.stringify(input.state ?? {})]
    );
    return result.rows[0];
  },

  /**
   * Ownership check used by every session-scoped operation. Sessions created
   * anonymously (user_id IS NULL) are only reachable by the anonymous caller,
   * never by a signed-in user, and vice versa.
   */
  async ownsSession(sessionId: string, userId: string | null) {
    const result = await query<{ id: string }>(
      "SELECT id FROM agent_sessions WHERE id=$1 AND user_id IS NOT DISTINCT FROM $2 LIMIT 1",
      [sessionId, userId]
    );
    return Boolean(result.rows[0]);
  },

  async saveConversation(sessionId: string, role: "user" | "assistant" | "system", content: string, metadata: Record<string, unknown> = {}) {
    const result = await query<Record<string, unknown>>(
      "INSERT INTO agent_messages (session_id,role,content,metadata) VALUES ($1,$2,$3,$4) RETURNING *",
      [sessionId, role, content, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async loadConversation(sessionId: string, userId: string | null) {
    const result = await query<Record<string, unknown>>(
      `SELECT m.* FROM agent_messages m
       JOIN agent_sessions s ON s.id = m.session_id
       WHERE m.session_id = $1 AND s.user_id IS NOT DISTINCT FROM $2
       ORDER BY m.created_at`,
      [sessionId, userId]
    );
    return result.rows;
  },

  async saveWorkflowState(sessionId: string, state: Record<string, unknown>, currentPage: string, workflow?: string) {
    const result = await query<Record<string, unknown>>(
      "UPDATE agent_sessions SET session_state=$2,current_page=$3,current_workflow=$4 WHERE id=$1 RETURNING *",
      [sessionId, JSON.stringify(state), currentPage, workflow ?? null]
    );
    return result.rows[0];
  },

  async loadWorkflowState(sessionId: string, userId: string | null) {
    const result = await query<Record<string, unknown>>(
      "SELECT session_state,current_page,current_workflow FROM agent_sessions WHERE id=$1 AND user_id IS NOT DISTINCT FROM $2",
      [sessionId, userId]
    );
    return result.rows[0] ?? null;
  },

  async clearSession(sessionId: string, userId: string | null) {
    const result = await query(
      "DELETE FROM agent_sessions WHERE id=$1 AND user_id IS NOT DISTINCT FROM $2",
      [sessionId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
