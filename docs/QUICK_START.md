# Quick Start Guide

## 1. Prerequisites

Before you begin, make sure you have:

- Node.js 20 or later
- npm
- Git
- MetaMask for Ethereum issuance flows

## 2. Install and run

```bash
npm install
npm run dev
```

Then open the app in your browser at the local route for this project.

## 3. Issue a certificate

### DID issuance

1. Open the home page.
2. Select the DID issuing method.
3. Fill in recipient details.
4. Add validity information if needed.
5. Click Issue Certificate.
6. Review the generated credential proof and payload.

### Ethereum issuance

1. Install and connect MetaMask.
2. Switch to the Sepolia test network.
3. Ensure the wallet has test ETH.
4. Select Ethereum as the issuing method.
5. Fill in the form and click Issue Certificate.
6. Approve the transaction and wait for confirmation.

## 4. Verify a certificate

1. Open the Verify page.
2. Paste or upload certificate JSON.
3. Click Verify.
4. Review the result for validity, proof status, and revocation status.

## 5. Browse examples

Use the Gallery page to view templates and sample outputs before issuing production certificates.

## 6. Common troubleshooting

### Signing did not happen

Check that the DID environment values are configured correctly.

### Wallet not connected

Connect MetaMask and switch to Sepolia.

### Verification fails

Confirm the credential matches the resolved issuer data and is not revoked or expired.

## 7. Production safety note

Do not embed private signing keys in browser-visible environment variables in production deployments. Use server-side or protected secret handling for live signing.
