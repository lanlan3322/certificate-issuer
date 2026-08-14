import type { AgentContext, AgentResponse } from "./types";

export interface AgentProvider { respond(message: string, context: AgentContext): Promise<AgentResponse>; }

class OpenAIProvider implements AgentProvider {
  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.AGENT_MODEL ?? "gpt-4o-mini", messages: [{ role: "system", content: "You are the Verifiable Issuer Success Agent. Never request secrets or private keys." }, { role: "user", content: JSON.stringify({ message, context }) }] }) });
    if (!response.ok) throw new Error("OpenAI provider request failed.");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { message: payload.choices?.[0]?.message?.content ?? "I could not produce a response." };
  }
}

export class AzureOpenAIProvider extends OpenAIProvider {}
export class CopilotStudioProvider extends OpenAIProvider {}

export function getAgentProvider(): AgentProvider | null {
  if (process.env.AGENT_PROVIDER === "openai" && process.env.OPENAI_API_KEY) return new OpenAIProvider();
  if (process.env.AGENT_PROVIDER === "azure-openai" && process.env.OPENAI_API_KEY) return new AzureOpenAIProvider();
  if (process.env.AGENT_PROVIDER === "copilot-studio" && process.env.OPENAI_API_KEY) return new CopilotStudioProvider();
  return null;
}