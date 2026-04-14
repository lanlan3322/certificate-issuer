# Certificate Issuer Platform — TrustVC + IMDA/OpenCerts

## Overview
A modern web application for issuing verifiable certificates using TrustVC SDK (managed by IMDA). Certificates are W3C Verifiable Credentials with on-chain verification via Ethereum Document Store.

## Tech Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **TrustVC SDK:** `@trustvc/trustvc` for signing/verification
- **Blockchain:** Ethereum Sepolia testnet (document store)
- **Deployment:** GitHub Pages via GitHub Actions

## Features
1. **Issue Certificate** — Form to input recipient info, generate W3C VC, sign with TrustVC
2. **Verify Certificate** — Upload JSON or paste to verify authenticity
3. **Certificate Gallery** — View sample certificates
4. **QR Code** — Each certificate has a verification QR code

## Architecture
```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Issuer UI   │────▶│  TrustVC SDK │────▶│  Document Store  │
│  (Next.js)   │     │  (signW3C)   │     │  (Ethereum)      │
└──────────────┘     └──────────────┘     └──────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ W3C Verifiable│
                    │ Credential     │
                    └──────────────┘
```

## Certificate Data Model
```typescript
interface CertificateData {
  id: string;                    // UUID
  recipientName: string;
  recipientEmail: string;
  certificateType: string;       // e.g., "Professional Certificate"
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
}
```

## TrustVC Integration
- **Signing:** `signW3C()` with ECDSA-SD-2023 (default)
- **Verification:** `verifyDocument()` — automatic derivation for ECDSA-SD
- **Credential Status:** BitstringStatusList2021 (revocation)
- **DID Method:** `did:web` (hosted DID)

## Smart Contract
- **Document Store:** deployed on Sepolia testnet
- **Network:** Sepolia (chainId: 11155111)
- **Registry:** OpenAttestation document store pattern

## File Structure
```
certificate-issuer/
├── app/
│   ├── page.tsx              # Landing + issue form
│   ├── verify/page.tsx       # Verification page
│   ├── gallery/page.tsx       # Sample certificates
│   └── layout.tsx             # Root layout
├── components/
│   ├── CertificatePreview.tsx # Live preview
│   ├── IssueForm.tsx          # Issuance form
│   ├── VerifyForm.tsx        # Verification
│   ├── QRCodeDisplay.tsx      # QR code component
│   └── NavBar.tsx             # Navigation
├── lib/
│   ├── trustvc.ts            # TrustVC SDK wrappers
│   ├── certificate.ts         # Certificate utilities
│   └── constants.ts           # Config & addresses
├── styles/
│   └── globals.css           # Tailwind + custom
├── package.json
├── tailwind.config.ts
├── next.config.js
└── .github/workflows/deploy.yml
```

## DID Configuration
- **DID:** `did:web:certificate-issuer.vercel.app`
- **Multikey format:** ECDSA secp256k1
- **Keys hosted at:** `/.well-known/did.json`

## Testing
- Demo issuer using Sepolia testnet Document Store
- Sample certificates pre-loaded in gallery
- Testnet verification always succeeds

## Deployment
- GitHub Actions on push to `main`
- Builds Next.js and deploys to `gh-pages`
- Preview deployments for PRs