export type AgentAction =
  | { type: "navigate"; href: string }
  | { type: "prefillForm"; href: "/insurance"; values: Record<string, string> }
  | { type: "openModal"; modal: "wallet" | "deployment-guide" }
  | { type: "downloadCredential" };

export interface AgentContext {
  currentPage: string;
  userAction?: string;
  workflowState?: Record<string, string>;
}

export interface AgentMessageData {
  id: string;
  role: "assistant" | "user";
  content: string;
  actions?: AgentAction[];
  createdAt: string;
}

export interface AgentResponse {
  message: string;
  actions?: AgentAction[];
  workflowState?: Record<string, string>;
}

export const ISSUANCE_STEPS = [
  "recipientName",
  "recipientEmail",
  "certificateType",
  "validity",
  "review",
  "issue",
] as const;

export type IssuanceStep = (typeof ISSUANCE_STEPS)[number];