import type { AgentContext, AgentResponse } from "../../lib/agent/types";
import type { AgentProvider } from "./AgentProvider";

export class OpenAIProvider implements AgentProvider {
  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: process.env.AGENT_MODEL ?? "gpt-4o-mini", messages: [{ role: "system", content: "You are a secure issuer assistant. Never request private keys, passwords, or API secrets." }, { role: "user", content: JSON.stringify({ message, context }) }] }) });
    if (!response.ok) throw new Error("OpenAI provider request failed.");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { message: payload.choices?.[0]?.message?.content ?? "No response was returned." };
  }
}