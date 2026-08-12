# Developer Onboarding Guide

## 1. Project purpose

This repository is a certificate issuing and verification platform built with Next.js and TypeScript. It supports:

- DID-based verifiable credential issuance
- Ethereum document-store issuance
- certificate template and gallery flows
- revocation and verification workflows
- bulk operation support and platform administration

## 2. Local environment

### Required tools

- Node.js 20+
- npm
- Git
- VS Code
- Optional: MetaMask for wallet flows

### Setup

```bash
npm install
npm run dev
```

## 3. Repository structure

- app/: user-facing routes
- components/: UI building blocks
- hooks/: browser hooks such as wallet handling
- lib/: core logic and certificate utilities
- public/: static assets and DID document publishing
- docs/: user and operator guidance

## 4. Key files to understand first

- app/page.tsx — main certificate issuance experience
- app/verify/page.tsx — verification workflow
- lib/trustvc.ts — TrustVC and issuance logic
- lib/certificate.ts — validation and formatting helpers
- lib/constants.ts — templates and network configuration
- components/NavBar.tsx — app navigation

## 5. Core workflows

### Issuance

The main issuance path is implemented in the home page and TrustVC helpers. It supports DID-based signing and Ethereum wallet transaction issuance.

### Verification

Verification uses the public credential payload and signer metadata to validate proof and trust state.

### Platform lifecycle

The repo includes platform state, issuer configuration, revocation, and compliance-related models that support admin and governance workflows.

## 6. Build and validation

Run the following checks before finishing changes:

```bash
npm run build
```

For milestone logic and targeted validation, run Node test files that cover the feature area you changed.

## 7. Security expectations

Follow these practices:

- never expose private keys in public JS bundles
- keep signing material in secure backend or secret-managed storage
- prefer server-side issuance boundaries where production security matters
- validate all issuer, template, and revocation data before production release

## 8. Recommended development flow

1. Review the feature area and current file layout.
2. Implement the smallest change needed.
3. Run the relevant test or build validation.
4. Confirm the route and user flow still behave as expected.
5. Document the change in the relevant manual or release notes.

## 9. Good first tasks

- review the main issuance form
- add or adjust template metadata
- validate revocation UI flows
- improve audit/compliance reporting
- add missing docs updates for new features

## 10. Support and release hygiene

Before releasing changes:

- run the production build
- verify all key routes render
- validate critical credential flows
- confirm revoke and sign logic remain correct
- publish any required documentation updates
