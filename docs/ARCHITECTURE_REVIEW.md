# Architecture Review - verifiable.sg

## Overview
This document provides an architectural review of the verifiable.sg certificate issuer system, focusing on its implementation of W3C Verifiable Credentials using the TrustVC SDK and did:web DID method.

## System Components

### Core Technologies
- **Next.js 14**: Frontend framework for the application
- **Supabase**: Backend as a Service for database and authentication
- **TrustVC SDK (@trustvc/trustvc)**: W3C Verifiable Credentials implementation
- **did:web DID Method**: Decentralized identifier method for certificate issuance
- **ecdsa-sd-2023 Cryptosuite**: Cryptographic suite for verifiable credentials

### Key Files and Directories
- `lib/trustvc.ts`: Core TrustVC integration and DID-based signing/verification logic
- `app/api/issue/route.ts`: Certificate issuance API endpoint
- `app/api/verify/route.ts`: Certificate verification API endpoint
- `services/CredentialService.ts`: Credential storage and retrieval
- `lib/auth.ts`: Authentication and authorization services
- `public/.well-known/did.json`: DID document for the issuer

## Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Client   │    │  Next.js App     │    │   Supabase      │
│                 │    │                  │    │                 │
│  ┌───────────┐  │    │  ┌─────────────┐ │    │  ┌────────────┐ │
│  │           │  │    │  │             │ │    │  │            │ │
│  │ Browser   │  │    │  │ API Routes  │ │    │  │ Database   │ │
│  │           │  │    │  │             │ │    │  │            │ │
│  └───────────┘  │    │  └─────────────┘ │    │  └────────────┘ │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                            │                       │
                            ▼                       ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   TrustVC SDK   │    │   DID Resolution│
                    │                 │    │                 │
                    │  W3C VC         │    │  did:web        │
                    │  Signing/Verify │    │  Resolution     │
                    └─────────────────┘    └─────────────────┘
```

## Certificate Issuance Process

1. **Authentication**: User must be authenticated via Supabase
2. **API Request**: Client sends issuance request to `/api/issue`
3. **DID Resolution**: System resolves `did:web:verifiable.sg` 
4. **Credential Creation**: Uses TrustVC SDK to create W3C Verifiable Credential
5. **Signing**: Credential signed with ECDSA-Signature-Suite-2023
6. **Storage**: Certificate stored in Supabase credentials table
7. **Response**: Signed credential returned to client

## DID Implementation

The system uses the `did:web` method for certificate issuance:
- DID: `did:web:verifiable.sg`
- Key Type: ECDSA-Signature-Suite-2023 (secp256k1)
- Public Key: Embedded in `.well-known/did.json`

## Security Considerations

### Authentication
- User authentication handled by Supabase
- Role-based access control implemented
- Password requirements enforced (minimum 10 characters with uppercase, lowercase, and number)

### Data Protection
- All credentials stored encrypted in Supabase
- Private keys used for signing are managed securely
- Rate limiting implemented to prevent abuse

## Compatibility Assessment

### TradeTrust Compatibility
The system is designed to be compatible with TradeTrust through:
- Implementation of W3C Verifiable Credentials standard
- Use of TrustVC SDK which supports TradeTrust format
- Proper DID-based issuance process

### OpenCerts Compatibility  
The system is designed to be compatible with OpenCerts through:
- W3C Verifiable Credentials implementation
- Standard credential structure that aligns with OpenCerts schema
- Support for certificate verification via the standard API endpoints

## Technical Debt and Recommendations

### Current Implementation
- Uses TrustVC SDK v2.15.2 for core functionality
- Implements DID-based signing using did:web method
- Leverages Supabase for database and authentication

### Areas for Improvement
1. Consider migrating to more recent versions of dependencies
2. Implement comprehensive logging for audit trails
3. Add additional security measures for credential storage
4. Expand test coverage for edge cases in credential processing

## Dependencies
- @trustvc/trustvc v2.15.2
- @supabase/supabase-js v2.112.4
- ethers v5.8.0
- Next.js 14