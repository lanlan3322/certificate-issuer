import { guardAgentInput } from "./guardrails";
import { retrieveKnowledge } from "./knowledge";
import type { AgentContext, AgentResponse, IssuanceStep } from "./types";

const issuancePrompts: Record<IssuanceStep, string> = {
  recipientName: "Who should receive this certificate? Enter the recipient's full name.",
  recipientEmail: "What is the recipient's email address?",
  certificateType: "Which certificate type should we create: Professional, Completion, or Achievement?",
  validity: "How long should the credential remain valid? You can keep the default one-year validity or provide dates.",
  review: "Review the recipient, certificate type, and validity. When ready, I can open the issuing console with these details.",
  issue: "Everything is ready. Use Issue Certificate in the console, then approve the MetaMask signature if you selected wallet signing.",
};

export function createLocalAgentResponse(message: string, context: AgentContext): AgentResponse {
  const guarded = guardAgentInput(message);
  if (guarded) return { message: guarded };

  const query = message.toLowerCase();
  const step = context.workflowState?.step as IssuanceStep | undefined;
  if (step) {
    const state = { ...context.workflowState };
    if (step === "recipientName") { state.recipientName = message; state.step = "recipientEmail"; return { message: issuancePrompts.recipientEmail, workflowState: state }; }
    if (step === "recipientEmail") { state.recipientEmail = message; state.step = "certificateType"; return { message: issuancePrompts.certificateType, workflowState: state }; }
    if (step === "certificateType") { state.certificateType = query.includes("completion") ? "CompletionCertificate" : query.includes("achievement") ? "AchievementCertificate" : "ProfessionalCertificate"; state.step = "validity"; return { message: issuancePrompts.validity, workflowState: state }; }
    if (step === "validity") { state.step = "review"; return { message: issuancePrompts.review, workflowState: state }; }
    if (step === "review") return { message: issuancePrompts.issue, workflowState: { ...state, step: "issue" }, actions: [{ type: "prefillForm", href: "/insurance", values: state }] };
  }
  if (query.includes("issue") || query.includes("create certificate")) {
    return {
      message: "I can guide the six-step issuance flow. We'll start with the recipient, then review before issuance.",
      actions: [{ type: "navigate", href: "/insurance" }],
      workflowState: { step: "recipientName" },
    };
  }
  if (query.includes("verify")) {
    return { message: "Open the verification portal, upload or paste a signed credential, and run verification. I can help interpret the result.", actions: [{ type: "navigate", href: "/verify" }] };
  }
  if (query.includes("did") || query.includes("identity")) {
    return { message: "DID management is in the issuer identity control center. Use did:web for a web-hosted DID document and keep signing keys outside the browser.", actions: [{ type: "navigate", href: "/did" }] };
  }
  if (query.includes("revoke")) {
    return { message: "Verify the credential first. The verifier exposes revocation only after a valid proof is confirmed; DID uses OCSP while Ethereum uses the Document Store.", actions: [{ type: "navigate", href: "/verify" }] };
  }
  if (query.includes("professional")) {
    return {
      message: "I can prefill a Professional Certificate and take you to issuance.",
      actions: [{ type: "prefillForm", href: "/insurance", values: { certificateType: "ProfessionalCertificate" } }],
    };
  }

  const articles = retrieveKnowledge(message);
  if (articles.length > 0) return { message: articles.map((article) => `${article.title}: ${article.content}`).join("\n\n") };

  const pageHelp: Record<string, string> = {
    "/insurance": issuancePrompts.recipientName,
    "/verify": "Paste or upload a credential, then select Verify Credential. A valid credential can be previewed or revoked from the result.",
    "/did": "Create or import an issuer DID, then keep its signing material in a secure server-side service.",
    "/admin": "Create issuer workspaces and manage their active status from this page.",
    "/gallery": "Browse example credentials to compare templates and credential structures.",
  };
  return { message: pageHelp[context.currentPage] ?? "Welcome to Verifiable. I can help issue credentials, configure DID identity, verify certificates, and manage revocation. What would you like to do?" };
}