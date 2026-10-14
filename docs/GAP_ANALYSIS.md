# GAP ANALYSIS - TradeTrust / OpenCerts Compatibility

> Superseded on 2026-10-14 by
> [TRADETRUST_COMPATIBILITY_REPORT.md](./TRADETRUST_COMPATIBILITY_REPORT.md) and
> [OPENCERTS_COMPATIBILITY_REPORT.md](./OPENCERTS_COMPATIBILITY_REPORT.md).
> The historical analysis below conflates W3C and OpenAttestation formats and
> contains unverified field names and requirements. Do not implement its proposed
> wrapper/proof replacements, context list or Token Registry requirement.
> Follow the authoritative continuation in [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

Generated: 2026-08-10
Status: Complete analysis

---

## Executive Summary

The current certificate-issuer implementation produces valid W3C Verifiable Credentials
with `did:web:verifiable.sg` as the issuer, cryptographic signing via TrustVC (EcdsaSd2023),
and Ethereum Document Store integration. However, several structural gaps prevent full
TradeTrust and OpenCerts compliance.

**Critical finding**: The credential payload uses a custom proof structure (`EthereumPersonalSignature2024` / `EcdsaSecp256k1Signature2019`) with raw Ethereum addresses as verification methods instead of DID-linked references, and lacks the `OpenAttestationWrapper` layer entirely.

---

## Current State Inventory

### What Works (No Gap)

| Area | Status | Notes |
|------|--------|-------|
| Issuer DID | ``did:web:verifiable.sg`` | Correct format; resolves via `.well-known/did.json` |
| DID Document | Complete | Contains `verificationMethod`, `assertionMethod`, `authentication`, and `OpenCertsVerificationService2021` service endpoint |
| JWKS | Published | At `.well-known/jwks.json`; secp256k1 key-pair |
| Web DID Format | Correct | Uses `did:web` (required by OpenCerts/TradeTrust) |
| Document Store | Deployed | Sepolia address: ``0x92600b6B5fE4D15D87d26cAdCcaf9D74594`` |
| TrustVC Signing | Working | EcdsaSd2023 proof generation functional |
| Revocation (On-Chain) | Working | `revokeCertificateOnChain()` submits to Document Store |
| Revocation (OCSP) | Working | Supports OCSP-based revocation via responder URL |
| Issuance API | Working | `/api/certificates` POST endpoint functional |
| Verification API | Working | `/api/verify-certificate` GET endpoint functional |

---

## Gap Analysis

### Gap 1: Missing OpenAttestation Credential Type Tag (HIGH)

**Current**:
```json
"type": ["VerifiableCredential"]
```

**Expected (TradeTrust / OpenCerts)**:
```json
"type": ["VerifiableCredential", "OpenAttestationDocument2018"]
```

**Impact**: Without `OpenAttestationDocument2018`, verifiers will not recognize this as an OA-format certificate. The type tag is a mandatory marker per OpenCerts specification v3.2 section 3.1.

**File to change**: `lib/trustvc.ts` (`buildVCPayload` or new wrapper builder)

---

### Gap 2: Missing OpenAttestation Wrapper Layer (HIGH)

**Current**:
```json
{
  "credentialSubject": { ... },
  "proof": { "type": "EcdsaSecp256k1Signature2019", ... }
}
```

**Expected (TradeTrust / OpenCerts)**:
Top-level `signature` object with `_type: "OPENATTACKATION_JSON_LD_PROOF"`, plus `signatureFormat` and `credentialSignature` fields wrapping the proof data.

**Impact**: Not wrapped. TradeTrust verifiers expect a top-level `signature` object that maps to OpenAttestationSignedDocument format. The `credentialSignature` field provides context mapping back to W3C VC spec compliance.

**File to change**: `lib/trustvc.ts` (`buildVCPayload` or new wrapper builder)

### Gap 3: Incomplete @context Array for OA Mode (HIGH)

**Current**:
```json
[
  "https://www.w3.org/2018/credentials/v1",
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/ecdsa-secp256k1-2019",
  "https://trustnetic.com/trustvc/contexts/context.json"
]
```

**Expected for TradeTrust/OpenCerts mode**: Must additionally include:
- `https://opencredentials.github.io/long-term-archive/contexts/opencerts/opencerts-v2.1.jsonld`
- `https://opentrust.org/schema/dss/format/1.0/context.jsonld`
- `https://ts.openattestation.com/comprobante/1.0/context.json`

**Impact**: Without OA schemas in @context, verifiers cannot resolve type definitions for `_type` fields and will reject the credential.

**Note**: `lib/constants.ts` already defines these URLs in `OPENCERTS_CONTEXTS` — they just need to be used during credential construction.

---

### Gap 4: Verification Method Reference Format (MEDIUM)

**Current**:
```json
"verificationMethod": "0x..."  // raw Ethereum address
```

**Expected**:
```json
"verificationMethod": "did:web:verifiable.sg#key-1"
```

**Impact**: OpenCerts and TradeTrust require DID-linked verification methods. Raw Ethereum addresses are not standard-compliant for DID-based issuance chains. The DID document already publishes the correct key (`did:web:verifiable.sg#key-1`).

---

### Gap 5: Wrong Proof Type for OA Mode (MEDIUM)

**Current**:
```json
"proof": { "type": "EthereumPersonalSignature2024" }
// or
"proof": { "type": "EcdsaSecp256k1Signature2019" }
```

**Expected for full TradeTrust compliance**: In OpenAttestation mode, use `OpenAttestationAssertion2018` proof type OR the signature-based OA wrapper (`OPENATTACKATION_JSON_LD_PROOF`). Current types are not recognized by OpenCerts verifier tools.

---

### Gap 6: Subject Type Missing _type Marker (MEDIUM)

**Current**:
```json
"credentialSubject": { "id": "did:example:...", "name": "...", "email": "..." }
```

**Expected**:
```json
"credentialSubject": {
  "id": "did:example:...",
  "_type": "OpenAttestationCredentialSubject",
  ...additional OA fields...
}
```

**Impact**: OpenCerts verifiers expect `_type` markers on all nested objects for type resolution. Missing markers cause validation failures.

---

### Gap 7: Missing Document Store Commitment in Proof (HIGH)

Document Store commitment is **separate** from the signing flow — `signDIDCertificate()` produces signed VC with proof, while `commitToDocumentStore()` separately hashes and commits to Ethereum. The two are NOT combined into a single proof layer.

**Expected**: In TradeTrust, the OpenAttestationProof should contain:
```json
"type": "OpenAttestationDnsTxtProof",
"proofPurpose": "assertionMethod",
"verificationMethod": "did:web:verifiable.sg#key-1",
"proofValue": "...",
"commitment": "<32-byte hex>"
```

**Impact**: Without a commitment field in the proof, verifiers cannot verify the certificate was committed to the Document Store. TradeTrust requires this linkage.

---

### Gap 8: No Token Registry Reference (LOW)

Document Store is used but no Token Registry reference exists in the credential. For full OpenCerts compliance, `openCertsCertificateMetadata` should include `"tokenRegistryId": "0x..."`.

---

## Severity Classification Summary

| Gap | Severity | Effort | Backward Compatible? |
|-----|----------|--------|---------------------|
| 1: Missing OA Type Tag | HIGH | Low | Yes — additive to type array |
| 2: Missing OA Wrapper | HIGH | High | Conditionally — separate credential mode |
| 3: Incomplete @context | HIGH | Low | Yes — context arrays are per-credential |
| 4: Verification Method Format | MEDIUM | Medium | Yes — DID format for OA mode only |
| 5: Wrong Proof Type | MEDIUM | Medium | Yes — proof type selection logic |
| 6: Subject _type Marker | MEDIUM | Low | Yes — additive field |
| 7: Missing DS Commitment in Proof | HIGH | High | Requires restructuring of signing flow |
| 8: No Token Registry Reference | LOW | Low | Additive, minimal risk |

---

## Backward Compatibility Assessment

**Approach**: Dual-mode issuance via `certificateType` parameter.

1. **Default preserved**: When `certificateType` is omitted or `"standard"`, behavior remains exactly the same (current W3C VC with proof block).
2. **Additive fields only for standard mode**: In standard mode, we can safely add OA-specific fields that existing verifiers will ignore (per W3C spec).
3. **DID document unchanged**: The existing DID document already contains OpenCerts-compatible structure.

### Regression Risk Analysis

| Flow | Risk Level | Reason |
|------|-----------|--------|
| Auth (Supabase) | None | No credential-related changes |
| Issue (standard mode) | Low | Additive fields only; proof format unchanged |
| Verify (native) | Low | Verification reads proof, not signature wrapper |
| DID Resolution | None | Did document already OA-compatible |
| TrustVC signing | Low | Signing path is independent of output format |

---

## Cross-Reference: Existing Constants vs Required Values

The file `lib/constants.ts` already defines `OPENCERTS_CONTEXTS` (lines 684–702) with the correct OpenCerts context URLs. This is a **configuration readiness** — no constants need to be added, only consumed during credential construction in OA mode.
