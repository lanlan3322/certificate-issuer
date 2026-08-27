import type { AgentContext, AgentResponse } from "./types";

export interface AgentProvider { respond(message: string, context: AgentContext): Promise<AgentResponse>; }

const SYSTEM_PROMPT =
  "You are the Verifiable Issuer Success Agent. Help users issue, verify, and revoke " +
  "W3C Verifiable Credentials. Never request or repeat secrets, private keys, seed " +
  "phrases, or API keys. Answer concisely in plain text.";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_CHARS = 4_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Agent provider request failed (HTTP ${response.status}).`);
    return (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  } finally {
    clearTimeout(timeout);
  }
}

function buildMessages(message: string, context: AgentContext) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify({ message: message.slice(0, MAX_MESSAGE_CHARS), context }) },
  ];
}

class OpenAIProvider implements AgentProvider {
  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const payload = await postJson(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      { model: process.env.AGENT_MODEL ?? "gpt-4o-mini", messages: buildMessages(message, context) }
    );
    return { message: payload.choices?.[0]?.message?.content ?? "I could not produce a response." };
  }
}

/** Azure uses a different host, auth header, and deployment-based path. */
class AzureOpenAIProvider implements AgentProvider {
  async respond(message: string, context: AgentContext): Promise<AgentResponse> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";
    if (!endpoint || !deployment) {
      throw new Error("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT are required.");
    }
    const payload = await postJson(
      `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      { "api-key": process.env.AZURE_OPENAI_API_KEY ?? "" },
      { messages: buildMessages(message, context) }
    );
    return { message: payload.choices?.[0]?.message?.content ?? "I could not produce a response." };
  }
}

export function getAgentProvider(): AgentProvider | null {
  switch (process.env.AGENT_PROVIDER) {
    case "openai":
      return process.env.OPENAI_API_KEY ? new OpenAIProvider() : null;
    case "azure-openai":
      return process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT
        ? new AzureOpenAIProvider()
        : null;
    default:
      return null;
  }
}
