# Architecture Review

## System Overview

The certificate issuer is a modern web application for issuing W3C Verifiable Credentials using the TrustVC SDK, managed by Singapore's IMDA (Infocomm Media Development Authority). It supports both DID-based and Ethereum-based certificate issuance.

## Frameworks and Technologies

- **Framework:** Next.js 14 (App Router, TypeScript, static export)
- **Styling:** Tailwind CSS
- **Authentication:** Supabase Auth
- **Database:** Supabase PostgreSQL
- **TrustVC SDK:** `@trustvc/trustvc` for W3C VC signing
- **Blockchain:** Ethereum Sepolia testnet (OpenAttestation Document Store)
- **Wallet Integration:** MetaMask (browser wallet via ethers.js v5)

## Key Components

### 1. TrustVC Integration (`lib/trustvc.ts`)
The core of the system is the TrustVC SDK integration, which handles:
- W3C Verifiable Credential generation
- ECDSA-SD-2023 cryptographic signing for DID issuance
- Ethereum document store integration
- Verification workflows

### 2. DID Implementation
- Uses `did:web:verifiable.sg` for issuer identification
- Implements proper DID document with verification methods
- Supports cryptographic signing using `ecdsa-sd-2023`

### 3. Ethereum Integration
- Connects to Sepolia testnet via ethers.js v5
- Integrates with OpenAttestation Document Store contract
- Supports wallet-based issuance and verification

### 4. Supabase Authentication
- User registration and login system
- Session management
- Password reset functionality

## API Endpoints

The application uses Next.js API routes for server-side operations:
- `/api/issue` - Certificate issuance endpoint
- `/api/verify` - Certificate verification endpoint
- `/api/auth` - Authentication endpoints

## Build System

- Uses Next.js 14 with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Static export for deployment to GitHub Pages or Vercel

## Vercel Configuration

The application is designed to work on both Vercel and GitHub Pages, with specific configurations for each deployment target:
- Environment variables for DID keys are handled differently based on deployment target
- For Vercel: Server-side signing is enabled with private key access
- For GitHub Pages: Only unsigned drafts can be generated (security limitation)

## Security Considerations

1. **Key Management**: DID private keys are server-only and never exposed to browser
2. **Authentication**: Supabase Auth handles user authentication securely
3. **Verification**: Both cryptographic verification and blockchain verification
4. **Deployment**: Different configurations for static vs dynamic deployments
