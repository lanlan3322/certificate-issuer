import type { AgentContext, AgentResponse } from "../../lib/agent/types";
import type { AgentProvider } from "./AgentProvider";

export class AzureOpenAIProvider implements AgentProvider {
  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    if (!endpoint || !deployment || !process.env.AZURE_OPENAI_API_KEY) throw new Error("Azure OpenAI environment is incomplete.");
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21"}`, { method: "POST", headers: { "Content-Type": "application/json", "api-key": process.env.AZURE_OPENAI_API_KEY }, body: JSON.stringify({ messages: [{ role: "system", content: "You are a secure issuer assistant. Never request private keys, passwords, or API secrets." }, { role: "user", content: JSON.stringify({ message, context }) }] }) });
    if (!response.ok) throw new Error("Azure OpenAI provider request failed.");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { message: payload.choices?.[0]?.message?.content ?? "No response was returned." };
  }
}