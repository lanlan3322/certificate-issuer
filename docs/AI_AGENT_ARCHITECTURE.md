# Issuer Success Agent Architecture

## Current Architecture

The application is a Next.js 14 App Router application configured for static export. The global shell is `app/layout.tsx`, with `NavBar`, `Footer`, and the newly mounted `AgentWidget` shared across routes.

| Area | Current implementation |
| --- | --- |
| Public/operational routes | `/`, `/insurance`, `/verify`, `/gallery`, `/did`, `/admin`, `/platform`, `/enterprise`, `/wallet`, `/revocation` |
| Issuance | `app/insurance/page.tsx` owns recipient, validity, template, DID/Ethereum choices, MetaMask interaction, batch issue controls, and credential download. |
| TrustVC | `lib/trustvc.ts` builds W3C VC payloads, performs DID signing where available, verifies Data Integrity and wallet proofs, and reads/writes Ethereum Document Store status. |
| DID | `app/did/page.tsx` provides client-side DID lifecycle UI. `lib/platform.ts` contains DID registry domain structures. |
| Verification | `app/verify/page.tsx` validates credential proofs, supports revocation, previews templates, and generates PDFs. |
| API | `/api/issue`, `/api/issuers`, and `/api/revocation` are server routes. Static hosts cannot depend on these routes at runtime. |

## Target Architecture

```mermaid
flowchart LR
  User --> Widget[Issuer Success Agent UI]
  Widget --> Context[Route + action + workflow context]
  Context --> AgentAPI[/api/agent]
  AgentAPI --> Guardrails
  Guardrails --> Provider[OpenAI / Azure OpenAI / Copilot Studio]
  Guardrails --> Local[Local knowledge fallback]
  Provider --> Knowledge[TrustVC knowledge domain]
  Local --> Knowledge
  Widget --> Actions[Navigate / prefill / modal / download]
  Actions --> Workflows[Issuance, verify, DID, revocation]
  Widget --> Analytics[Local session analytics]
```

The implementation uses a local-first assistant so Netlify and GitHub Pages remain functional. When `AGENT_PROVIDER` and provider credentials are configured in a server-enabled deployment, `/api/agent` delegates to the selected provider. Secrets never reach the client.

## Components and Data Flow

- `components/agent/AgentWidget.tsx`: global controller, route context, local session memory, analytics, action execution.
- `AgentWindow`, `AgentMessage`, and `AgentSuggestions`: floating SaaS chat interface.
- `lib/agent/local.ts`: deterministic fallback, onboarding, page guidance, and six-step issuance state machine.
- `lib/agent/knowledge.ts`: small retrieval index; `knowledge/*.md` is the source knowledge domain for a future vector retrieval pipeline.
- `lib/agent/providers.ts`: provider boundary for OpenAI, Azure OpenAI, and Copilot Studio adapters.
- `lib/agent/guardrails.ts`: blocks sensitive inputs and redacts token-like output.
- `lib/agent/analytics.ts`: localStorage event adapter. Replace with PostgreSQL/CosmosDB event storage in a multi-tenant deployment.

## Gap Analysis

1. Static export means a hosted LLM requires a serverless function, edge function, or dedicated backend; the local agent is the supported static-host fallback.
2. Existing `/api/issuers` and `/api/revocation` are in-memory and not tenant-persistent. Production agent actions must use authenticated persistent APIs.
3. DID management UI is a client-side simulation. Production DID creation, rotation, and signing require KMS/HSM-backed services.
4. Current retrieval is keyword based. Add embeddings, tenant-scoped documents, citations, and evaluation sets before exposing free-form enterprise guidance.
5. Agent memory currently uses browser localStorage. Move to authenticated issuer-scoped PostgreSQL/CosmosDB records with retention controls.

## Security Boundaries

- Never collect private keys, seed phrases, credentials belonging to other users, passwords, or API keys.
- Keep signing materials in server-side KMS/HSM integrations.
- Validate and authorize every agent action server-side before mutation.
- Log anonymized analytics only; do not store credential payloads in agent chat history.