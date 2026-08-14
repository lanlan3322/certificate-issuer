# Issuer Success Agent Backlog

## Epic 1: Embedded Copilot

- As an issuer, I can open a floating assistant from every page so I can get help without leaving my task.
- As an issuer, I can see page-aware suggested prompts for issuance, verification, DID, and administration.
- As an issuer, I can retain my session conversation after navigation.

## Epic 2: Guided Issuance

- As an issuer, I am guided through recipient name, email, certificate type, validity, review, and issue one step at a time.
- As an issuer, I can have reviewed values prefetched into the issuance form.
- As an issuer, I receive a clear distinction between MetaMask authorization and server-side DID proofs.

## Epic 3: Knowledge and Trust

- As an issuer, I can ask about TrustVC, W3C VC, DID:web, verification, revocation, OpenCerts, TradeTrust, and templates.
- As a security owner, I can prevent the agent from handling sensitive keys or secrets.
- As a platform owner, I can choose OpenAI, Azure OpenAI, Copilot Studio, or local fallback by environment configuration.

## Epic 4: Actions and Analytics

- As an issuer, I can navigate, prefill issuance, open supported UI actions, and download credentials through agent actions.
- As a product owner, I can inspect questions, completed workflows, drop-offs, and popular actions without recording credential contents.

## Acceptance Criteria

- Widget is visible and usable on desktop and mobile across every route.
- Static deployment provides local agent behavior when `/api/agent` is unavailable.
- Agent does not render secrets or advise users to expose keys.
- Guided flow retains state and prefills the insurance form.
- Build and type checks pass.