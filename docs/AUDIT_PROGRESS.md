# AUDIT_PROGRESS.md

Last Updated: 2026-10-14

## Continuation checkpoint: 2026-10-14

This checkpoint supersedes the historical findings below and the August gap
analysis. Resume here; do not restart discovery. Reference source revisions and
field-level evidence are in [TradeTrust](./TRADETRUST_COMPATIBILITY_REPORT.md) and
[OpenCerts](./OPENCERTS_COMPATIBILITY_REPORT.md) compatibility reports.

### Current result

- **TradeTrust: PARTIAL.** Local W3C issuance, TrustVC derivation and signature
  verification pass. Current status profile is unsupported by the reviewed
  upstream W3C verifier. No fresh production certificate has been supplied or
  submitted to the reference verifier.
- **OpenCerts: PARTIAL.** Current OpenCerts supports a W3C verification path;
  an OA wrapper is not universally required. Local cryptographic checks pass,
  but status, public-key alignment and external rendering remain unresolved.
- Production registration/login/password reset/Supabase/Resend are user-reported
  working baselines, not newly exercised production tests. No changes to those
  systems, public DID files, production settings or contracts.

### Completed in this continuation

1. Read existing reports and existing sample; determined the sample is historical,
   not a freshly issued production artifact, and cannot prove compatibility.
2. Compared current payload and signing/status paths against TradeTrust docs,
   OpenCerts reference site and TrustVC reference verifier source.
3. Added a regression that verifies a disclosure derived from the **returned**
   signed certificate, rather than checking only that a proof exists.
4. Fixed local store commitment preparation: calculate bytes32 `targetHash`
   before signing, avoid ASCII-hex double encoding, do not mutate caller input,
   and do not inject the custom commitment into unrelated status types.
5. Removed duplicate `0x` from newly built status IDs.
6. Tested all four format aliases, serialized viewer mapping, all four React
   certificate templates, the legacy DID issuance entry point, legacy-style
   wallet verification, and rejection of tampered hashes/recipients.
7. Read-only public DID, DNS and Sepolia contract checks completed; no transaction
   submitted. The configured contract does not answer the expected store ABI.

### Verification evidence

| Check | Result | Scope |
|---|---|---|
| `node --test lib/trustvc.test.js` | PASS, 7 tests | Synthetic, temporary P-256 keys; 6 subtests plus parent |
| `tsc --noEmit --incremental false` | PASS | Full project |
| `npm run build` | PASS before and after code fixes | Next.js production build, 24 static pages |
| Issue / verify / view | PASS locally | Signing, disclosure verification and server rendering; not authenticated production API/database E2E |
| Previously issued production certificate | BLOCKED | User offered to provide fresh and legacy files; neither received yet |
| Public DID GET | PASS accessibility | Returns `did:web:verifiable.sg`, `#key-1`, secp256k1 JWK; redirects to `www` |
| Live external TradeTrust / OpenCerts upload | NOT RUN | Await certificate fixtures and explicit consent to external submission |

The new regression was also run against the original `HEAD` signing code in
memory, normalizing only the unrelated status-ID typo to isolate proof handling:
all four DID format cases and the legacy DID entry point failed with
`Invalid signature`, while the wallet case passed. The fixed working tree passes
the same tests. No baseline source file was overwritten.

### Exact deployment observations

- Sepolia RPC `eth_chainId`: `0xaa36a7` (11155111).
- Configured address `0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594`:
  15,993 bytes of code; `name()` returns `Verifiable`; `isIssued(bytes32)` and
  `isRevoked(bytes32)` revert for a zero-hash read probe. Neither selector was
  found in the returned bytecode. This is not proof of the expected Document
  Store interface, nor proof that any certificate was issued.
- `_document-store.verifiable.sg` TXT:
  `openatts net=ethereum netId=11155111 addr=0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4`.
  This differs from configuration; `eth_getCode` for that address on Sepolia
  returns `0x`. No `openatts` TXT was observed at `verifiable.sg` itself.
- The server registration service's default address omits two hex characters,
  and its signer lookup uses ethers-v5 `.signer` rather than ethers-v6 `.runner`.
  This service was **not changed**; environment overrides and ownership must be
  established before enabling transactions.

### Next unfinished work

1. Receive fresh OpenCerts-mode and known-good legacy certificate files. Keep
   recipient data local; do not commit production certificates.
2. Compare actual proof key to the publicly resolved DID key; local loader
   overrides cannot establish external issuer identity.
3. Approve a separate, opt-in supported revocation profile (e.g. Bitstring Status
   List) and renderer integration. Do not silently remove status checks.
4. Inventory the actual contracts/network/permissions and reconcile DNS only
   after owner approval. **Do not deploy another contract or Token Registry.**
5. Test against the exact external verifier versions with consent, then rerun
   authenticated production lifecycle and legacy fixtures before rollout.

---

## Historical audit (retained for continuity; superseded above)

---

# Project Overview

## Production Site

- https://verifiable.sg

## Production DID

```text
did:web:verifiable.sg
```

## DID Document

```text
https://verifiable.sg/.well-known/did.json
```

Status:

✅ Publicly accessible

✅ HTTPS enabled

✅ DID resolves

✅ Verification methods published

✅ Assertion methods published

---

# Current Production State

## Authentication

### Registration

✅ Working

### Login

✅ Working

### Password Reset

✅ Working

### Resend Email

✅ Working

### Supabase Auth

✅ Working

### Email Verification

✅ Working

---

## Credential Lifecycle

### Issue Certificate

✅ Working

### Verify Certificate

✅ Working

### View Certificate

✅ Working

---

## Infrastructure

### Vercel

✅ Working

### Supabase

✅ Working

### Resend

✅ Working

### DID Resolution

✅ Working

---

# Technical Architecture

## Frontend

```text
Next.js
Vercel
```

## Identity

```text
did:web:verifiable.sg
```

## Authentication

```text
Supabase Auth
```

## Email

```text
Resend
```

## Credential Engine

```text
TrustVC
```

## Verification

```text
Native Verifiable Verification
```

---

# Current Credential Profile

Example observations from issued credentials:

## Issuer

```json
"issuer": "did:web:verifiable.sg"
```

Status:

✅ Correct

---

## Credential Type

```json
"type": [
  "VerifiableCredential"
]
```

Status:

✅ W3C VC

---

## Proof Type

```json
"type": "EthereumPersonalSignature2024"
```

Status:

⚠ Compatibility currently under review

---

## Verification Method

Current:

```json
"verificationMethod":
"0x..."
```

Expected TradeTrust-compatible form may be:

```json
"verificationMethod":
"did:web:verifiable.sg#key-1"
```

Status:

⚠ Compatibility analysis required

---

# Completed Work

## Phase 1

Authentication Stabilization

Status:

✅ Complete

Deliverables:

- Supabase Auth
- Registration
- Login
- Password Reset
- Email Delivery

---

## Phase 2

TrustVC Deployment Stabilization

Status:

✅ Complete

Deliverables:

- TrustVC package loading
- Issuance restored
- Verification restored

---

## Phase 3

DID Migration

Status:

✅ Complete

Previous DID:

```text
did:web:lanlan3322.github.io:certificate-issuer
```

Current DID:

```text
did:web:verifiable.sg
```

Result:

✅ Issuer updated

✅ DID published

✅ DID resolves

---

## Phase 4

Production Verification

Status:

✅ Complete

Deliverables:

- Credential verification working
- DID verification working
- Production deployment verified

---

# Active Audit Objective

Determine whether Verifiable-issued credentials are fully compatible with:

## TradeTrust

Status:

⚠ In Progress

Target:

```text
PASS
```

---

## OpenCerts

Status:

⚠ In Progress

Target:

```text
PASS
```

---

# Compatibility Review Checklist

## TradeTrust

### DID

✅ did:web support

### DID Document

✅ Published

### Verification Method

⚠ Review required

### Proof Format

⚠ Review required

### OpenAttestation Compatibility

⚠ Review required

### Document Store

❌ Not Confirmed

### Token Registry

❌ Not Confirmed

### On-chain Verification

❌ Not Implemented

---

## OpenCerts

### W3C VC Structure

✅ Present

### DID Issuer

✅ Present

### OpenAttestation Format

⚠ Review required

### Verification Compatibility

⚠ Review required

### OpenCerts Schema

⚠ Review required

---

# Current Open Issues

## Issue 1

TradeTrust Proof Compatibility

Status:

⚠ Investigation Required

Questions:

- Is EthereumPersonalSignature2024 accepted?
- Is DataIntegrityProof required?
- Is TradeTrust-compatible proof required?

---

## Issue 2

Verification Method Alignment

Current:

```text
Ethereum address
```

Potential target:

```text
did:web:verifiable.sg#key-1
```

Status:

⚠ Investigation Required

---

## Issue 3

Document Store Compatibility

Status:

❌ Not Implemented

Need to determine:

- Required?
- Optional?
- TradeTrust version dependency?

---

## Issue 4

Token Registry Compatibility

Status:

❌ Not Implemented

Need to determine:

- Required?
- Optional?
- TradeTrust version dependency?

---

## Issue 5

On-Chain Verification

Current:

```text
DID verification
```

Status:

✅ Working

Current:

```text
Blockchain verification
```

Status:

❌ Not Implemented

---

# Risk Assessment

## Authentication

LOW

## Issuance

LOW

## Viewing

LOW

## DID

LOW

## TradeTrust Compatibility

MEDIUM

## OpenCerts Compatibility

MEDIUM

## Blockchain Verification

HIGH

---

# Generated Reports

Pending:

```text
docs/TRADETRUST_COMPATIBILITY_REPORT.md
```

```text
docs/OPENCERTS_COMPATIBILITY_REPORT.md
```

```text
docs/GAP_ANALYSIS.md
```

```text
docs/MIGRATION_PLAN.md
```

---

# Next Steps for Compatibility

## Step 1

TradeTrust Compatibility Validation

Goal:

Determine whether current credential passes TradeTrust verification requirements.

Actions:

- Compare current VC against TradeTrust examples
- Validate proof format
- Validate DID usage
- Validate verificationMethod

Output:

```text
docs/TRADETRUST_COMPATIBILITY_REPORT.md
```

---

## Step 2

OpenCerts Compatibility Validation

Goal:

Determine whether current credential passes OpenCerts verification requirements.

Actions:

- Compare current VC against OpenCerts examples
- Validate OpenAttestation expectations
- Validate issuer requirements

Output:

```text
docs/OPENCERTS_COMPATIBILITY_REPORT.md
```

---

## Step 3

Verification Method Review

Goal:

Determine whether:

```text
verificationMethod = Ethereum address
```

should become:

```text
did:web:verifiable.sg#key-1
```

without breaking existing verification.

Output:

Compatibility recommendation.

---

## Step 4

Proof Format Review

Goal:

Determine whether:

```text
EthereumPersonalSignature2024
```

is acceptable.

If not:

- determine required TradeTrust/TrustVC proof type
- determine migration path

Output:

Compatibility recommendation.

---

## Step 5

On-Chain Verification Assessment

Goal:

Determine whether current implementation requires:

- Document Store
- Token Registry v4
- Token Registry v5

Actions:

- Compare against TradeTrust architecture
- Compare against TrustVC implementation

Output:

```text
docs/BLOCKCHAIN_VERIFICATION_PLAN.md
```

---

## Step 6

Gap Analysis

Classify:

LOW

MEDIUM

HIGH

for each compatibility issue.

Output:

```text
docs/GAP_ANALYSIS.md
```

---

## Step 7

5-Phase Migration Plan

Generate:

```text
docs/MIGRATION_PLAN.md
```

Phases:

1. Current State Preservation

2. TradeTrust Compatibility Mode

3. OpenCerts Compatibility Mode

4. Blockchain Verification

5. Unified Credential Strategy

---

# Recovery Instructions

If interrupted:

1. Read this file.
2. Do not re-scan repository.
3. Do not repeat completed phases.
4. Continue from the next unfinished compatibility step.
5. Update this file before continuing.

---

# Success Criteria

✅ Existing Verifiable functionality preserved

✅ TradeTrust compatibility assessed

✅ OpenCerts compatibility assessed

✅ Compatibility gaps documented

✅ Migration plan completed

✅ No regressions introduced

✅ Reports generated

✅ Future work clearly defined