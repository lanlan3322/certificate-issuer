# Sample Issued Certificate — verifiable.sg

This document shows the structure of a W3C Verifiable Credential issued by `did:web:verifiable.sg` using this codebase. It is produced **without any code changes** — it describes exactly what `buildVCPayload()` + `signDocumentWithDID()` emit at runtime.

## Structure of an Unsigned Credential (before signing)

Built by `lib/trustvc.ts::buildVCPayload()`:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/security/data-integrity/v2",
    {
      "@version": 1.1,
      "@vocab": "https://schema.org/",
      "certificateId": "https://schemas.tradetrust.io/credentials#certificateId",
      "certificateType": "https://schemas.tradetrust.io/credentials#certificateType",
      "templateId": "https://schemas.tradetrust.io/credentials#templateId"
    }
  ],
  "type": ["VerifiableCredential"],
  "validFrom": "2026-09-10T00:00:00Z",
  "validUntil": "2027-09-10T00:00:00Z",
  "issuer": "did:web:verifiable.sg",
  "credentialSubject": {
    "id": "urn:uuid:a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "certificateId": "CERT-2026-0001",
    "type": ["Person"],
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "certificateType": "Professional Certificate",
    "templateId": "PROFESSIONAL_CERTIFICATE",
    "description": "Completed AI Governance Course"
  }
}
```

## After Signing (ECDSA-SD-2023)

The `signCredentialWithEcdsaSd2023()` function appends a `proof` object with the ecdsa-sd-2023 cryptosuite:

```json
{
  "proof": {
    "type": "DataIntegrityProof",
    "proofPurpose": "assertionMethod",
    "verificationMethod": "did:web:verifiable.sg#key-1",
    "created": "2026-09-10T10:00:00Z",
    "proofValue": "...",
    "cryptosuite": "ecdsa-sd-2023"
  }
}
```

## Issuing Methods

The credential includes a `issuingMethods` array in the request body, but it is **NOT persisted in the VC payload itself**. It is only stored in Supabase (`credentials` table) for local bookkeeping.

## Key Observations

- The issuer is a **plain DID string** (`did:web:verifiable.sg`), not an object — intentional (see `buildVCPayload` comment).
- The credential uses **W3C VC v2 context** and **Data Integrity v2**, signed with **ecdsa-sd-2023**.
- `credentialSubject.id` is a randomly generated UUID (not the same as the certificate ID in Supabase).
- Three TradeTrust-specific terms are mapped in an embedded term-definition context object:
  - `certificateId` → `https://schemas.tradetrust.io/credentials#certificateId`
  - `certificateType` → `https://schemas.tradetrust.io/credentials#certificateType`
  - `templateId` → `https://schemas.tradetrust.io/credentials#templateId`
- There is **no OpenAttestation proof format** (no `$signature`, no OpenAttestation $context, no TT-specific proof envelope).
- Document store anchoring (Ethereum) is handled separately via the contract ABI in `lib/trustvc.ts`; it is not part of the VC payload.
