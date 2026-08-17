import type { AgentContext, AgentResponse } from "../../lib/agent/types";

export interface AgentProvider {
  respond(message: string, context: AgentContext): Promise<AgentResponse>;
}