# Issuer Success Agent Implementation Plan

## Sprint 1: Foundation

1. Add agent contracts, guardrails, local knowledge retrieval, analytics adapter, and provider interface.
2. Add `/api/agent` with environment-driven provider selection and local fallback.
3. Create TrustVC knowledge source documents.

## Sprint 2: Experience

1. Build responsive global `AgentWidget`, chat history, typing state, suggested prompts, and page context.
2. Add onboarding welcome content and route-aware help.
3. Persist session history and analytics in localStorage.

## Sprint 3: Guided Workflows

1. Implement six-step issuance state machine.
2. Persist collected fields during navigation.
3. Prefill `/insurance` with reviewed values.
4. Add explicit action contracts for navigation, prefill, modal opening, and credential download.

## Sprint 4: Production Hardening

1. Replace localStorage with authenticated tenant-scoped persistence.
2. Implement real Azure OpenAI/Copilot Studio request adapters and secrets management.
3. Add vector retrieval, citations, prompt-injection tests, telemetry dashboard, and audit logs.

## Files Modified

- `app/layout.tsx`
- `app/insurance/page.tsx`

## New Files

- `components/agent/*`
- `lib/agent/*`
- `app/api/agent/route.ts`
- `knowledge/*`
- `docs/AI_AGENT_*.md`

## Risks

- Static export cannot guarantee API route availability; retain deterministic local fallback.
- LLM output can be inaccurate; constrain high-risk actions and require confirmation.
- Credential and key material are sensitive; never include them in prompts, analytics, or memory.