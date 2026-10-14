# MIGRATION PLAN - TradeTrust / OpenCerts Compatibility Layer

## Authoritative continuation plan — 2026-10-14

**This section supersedes the draft below. Do not implement its speculative
wrapper names, proof removal, Token Registry requirement or unreachable-context
fallback assumptions.** JSON-LD processors must resolve referenced contexts; they
do not safely ignore unreachable URLs.

Current verdict: TradeTrust **PARTIAL**, OpenCerts **PARTIAL**. See the
[TradeTrust report](./TRADETRUST_COMPATIBILITY_REPORT.md) and
[OpenCerts report](./OPENCERTS_COMPATIBILITY_REPORT.md) for source revisions,
per-field checks, risks and live read-only infrastructure observations.

### Preservation gates

- No production auth, Supabase, Resend, DID document, DNS, contract, environment
  or SDK upgrade in this continuation.
- No edits to existing signed documents; no removing revocation/status checks
  to manufacture a successful result.
- Do not repoint or replace `#key-1`. If new cryptographic material is needed,
  retain historical keys and add a distinct method ID after approval.
- Defaults and existing aliases remain unchanged. Any new interoperable profile
  must be separately opt-in and versioned; do not silently remap `w3c`/`v1`.
- Do not deploy contracts or spend funds until the intended profile and existing
  contract inventory prove a deployment necessary.

### Phase A — exact evidence and local regression (completed)

- [x] Resume audit reports and distinguish historical sample from real production JSON.
- [x] Compare current W3C and OA profiles with upstream source.
- [x] Reproduce cryptographic failure when signed content is altered after signing.
- [x] Prepare existing application commitment before signing; produce actual
      bytes32, avoid caller mutation and avoid adding it to unrelated status types.
- [x] Remove duplicate `0x` from new status IDs.
- [x] Local issuance/derived-proof verification/view/tamper/legacy-wallet tests:
      7 passing tests; TypeScript PASS; production build PASS.
- [x] Public DID, DNS TXT, Sepolia code and store ABI read probes.

### Phase B — production fixtures and verifier baseline (next, blocked on input)

- [ ] Receive fresh OpenCerts-mode certificate and known-good legacy certificate.
      User offered to provide these; neither received yet. Keep them local and
      out of git.
- [ ] Verify each unmodified file on verifiable.sg with authorized access.
      Capture format, fragment outcomes and verifier versions without recipient data.
- [ ] Verify issuer/proof public key using the public DID, not the local
      environment-derived loader override.
- [ ] Obtain explicit approval before uploading certificate contents to external
      TradeTrust/OpenCerts sites, or perform isolated local reference verification.
- [ ] Inventory actual production SDK version and key format. Local
      `@trustvc/trustvc@0.0.0` exports no aggregate verifier functions; do not
      equate a local SDK build with the working production environment.

### Phase C — opt-in W3C interoperability (requires design/rollout approval)

1. Select a supported revocation profile. Ordinary non-transferable certificates
   should evaluate Bitstring Status List; do not drop revocation silently.
2. Define literal certificate-category mapping with legacy reader fallback.
   Current human-readable strings in JSON-LD `type` can fail signing.
3. Stage a pinned maintained TrustVC API adaptation, with issuer identity and
   document-status fragment tests that fail closed for invalid/error results.
4. If needed, add an appropriate public verification key under a new ID; retain
   all old keys and continue verification of old documents.
5. Add W3C `renderMethod` only once a protocol-compliant renderer is available,
   without changing current local certificate templates.

Gate every change on issuance, cryptographic verification, view, actual legacy
verification, format JSON checks and `npm run build`. Do not enable the new
profile by default until external verification passes for agreed versions.

### Phase D — infrastructure reconciliation (no deployment approved)

- Configured Sepolia address has bytecode, but tested `isIssued`/`isRevoked`
  calls revert. DNS binds another address which currently returns no code on
  Sepolia. Identify both contracts/network/ownership before making changes.
- Correct registration config/default-address/signer-runner handling and add
  receipt/outcome tracking only behind a tested opt-in operational flag.
- If OA export is actually required, use maintained OA wrapping/hash/proof
  tooling in a separate output profile; preserve existing W3C issuance.
- A Document Store is relevant to OA DNS-TXT issuance, but must have matching
  roles, network, wrapping/commitment, receipt, DNS binding and revocation tests.
- A Token Registry is for transferable records, not a prerequisite for ordinary
  OpenCerts/TradeTrust certificate verification. Do not deploy one for this task.

### Phase E — controlled live acceptance

- [ ] Production Issue Certificate succeeds with an authorized test issuer.
- [ ] Production Verify Certificate succeeds and reports actual status/identity.
- [ ] Production View Certificate succeeds.
- [ ] Actual legacy certificate still verifies and renders unchanged.
- [ ] OpenCerts-mode JSON matches the selected supported profile.
- [ ] Agreed TradeTrust/OpenCerts reference versions verify and render the file.
- [ ] Registration/login/reset/email/DID smoke tests pass without changing their configuration.
- [ ] Final `npm run build` PASS, explicit rollback gate, then approved deployment.

**Stop condition:** no compatibility PASS claim while fixtures, status semantics,
public-key match, chain linkage or external verification are unresolved.

---

## Historical draft — superseded, retained for continuity

Generated: 2026-08-10
Status: Draft v1.0

---

## Overview

This document outlines the phased migration of `certificate-issuer` to support TradeTrust and OpenCerts-compatible certificate issuance alongside existing W3C Verifiable Credential flow. The goal is **zero regression** for existing API consumers while enabling OA-mode certificates on-demand.

### Guiding Principles

1. **Zero backward-incompatible changes** — existing `/api/certificates` callers see no difference unless they opt in.
2. **Feature-flag driven** — a `certificateType` request parameter controls output format per-request.
3. **Reuse existing infrastructure** — DID document, JWKS, Document Store, TrustVC signing all stay unchanged; only the *output payload* changes.
4. **Configuration-first approach** — constants in `lib/constants.ts` already contain most required values; minimal new code.

---

## Phase 0: Discovery & Validation (Week 1)

**Status**: In Progress

- [x] Analyzed `lib/trustvc.ts` (lines 1114–1572) — verified `buildVCPayload`, proof builders, and signing interfaces
- [x] Confirmed DID document at `did:web:verifiable.sg` already contains OpenCerts-compatible structure
- [x] Identified existing `OPENCERTS_CONTEXTS` constant in `lib/constants.ts` (lines 684–702)
- [x] Completed GAP_ANALYSIS.md

**Deliverable**: This migration plan, plus the gap analysis above.

---

## Phase 1: Configuration & Constants (Week 2 — Low Risk, No API Changes)

### Scope

Prepare all constants and configuration for OA-mode without touching runtime code paths.

### Tasks

#### 1.1 Verify `OPENCERTS_CONTEXTS` completeness

Location: `lib/constants.ts`, lines 684–702

**Action**: Review and confirm these URLs are sufficient for both OpenCerts v2.1 and TradeTrust spec:
```typescript
// Already present — review required
export const OPENCERTS_CONTEXTS = [
  "https://www.w3.org/2018/credentials/v1",
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/ecdsa-secp256k1-2019",
  "https://trustnetic.com/trustvc/contexts/context.json",
  "https://opencredentials.github.io/long-term-archive/contexts/opencerts/opencerts-v2.1.jsonld",
  "https://opentrust.org/schema/dss/format/1.0/context.jsonld",
  "https://ts.openattestation.com/comprobante/1.0/context.json"
]
```

**Acceptance criteria**: All URLs resolve; all JSON-LD schemas load correctly via a smoke test.

#### 1.2 Add new constants (if needed)

If any context URL or type tag is missing:
- `OPENCERTS_CREDENTIAL_TYPE = "OpenAttestationDocument2018"`
- `OPENCERTS_SUBJECT_TYPE = "OpenAttestationCredentialSubject"`
- `OPENCERTS_PROOF_TYPE = "OpenAttestationAssertion2018"`
- `OPENATTACKATION_SIGNATURE_TYPE = "OPENATTACKATION_JSON_LD_PROOF"`
- `OPENCERTS_SIGNATURE_FORMAT = "OpenAttestationSignedDocument"`

#### 1.3 Add Token Registry ID constant (if applicable)

```typescript
export const TOKEN_REGISTRY_ID = "0x..." // from OpenCerts deployment
```

---

## Phase 2: Dual-Mode Credential Builder (Week 2–3 — Medium Risk)

### Scope

Add `certificateType` parameter to credential issuance without breaking existing callers.

### Tasks

#### 2.1 Add enum / type for certificate modes

**Location**: `lib/constants.ts` or `types/certificate.ts`
```typescript
export type CertificateMode = "standard" | "opencerts";
```

#### 2.2 Modify credential builder to accept mode parameter

**Locations**:
- `lib/trustvc.ts` — `buildVCPayload()` signature: add `mode?: CertificateMode`
- `src/routes/certificates/` — pass mode from request body

**Changes in `buildVCPayload()` for OA mode**:
```typescript
if (mode === "opencerts") {
  payload["type"] = [...payload["type"], OPENCERTS_CREDENTIAL_TYPE];
  payload["credentialSubject"]["_type"] = "OpenAttestationCredentialSubject";
  const oaContexts = getOACredentialContexts();
  payload["@context"] = [...payload["@context"], ...oaContexts];
}
```

**Recommendation**: Only add OA fields in OA mode. Minimizes diff and keeps standard-mode output pristine.

#### 2.3 Add OA-specific proof/wrapper builder

**Location**: `lib/trustvc.ts` — new function (do NOT modify existing proof builders)

```typescript
function buildOpenAttestationProof(payload, privateKey, didUrl) {
  // Sign the OA wrapper payload with the same keypair
  // Return signature (OPENATTACKATION_JSON_LD_PROOF) + credentialSignature wrapper
}
```

#### 2.4 Wire into API endpoint

**Request body addition**:
```json
{ "recipient": { /* existing */ }, "certificateType": "opencerts" }
```

The `certificateType` field is **optional**. Default behavior (no field = `"standard"`) preserves backward compatibility.

#### 2.5 Add OA wrapper to signed payload

After signing, if `mode === "opencerts"`:
- Remove the W3C `proof` block
- Add `signature`, `signatureFormat`, `credentialSignature` fields
- Optionally add `openCertsCertificateMetadata` with token registry ID




---

## Phase 3: Document Store Commitment Integration (Week 4 — Medium Risk)

Link the on-chain Document Store commitment into the proof layer for TradeTrust compliance.

### Tasks

#### 3.1 Restructure signing flow to support in-line commitment

New OA-mode flow:
```
buildVCPayload() → signDIDCertificate() → hashForDocumentStore() 
                   → commitToDocumentStore() 
                   → addCommitmentToProof() 
                   → return final OA certificate
```

**Key change**: Commitment from `commitToDocumentStore()` fed back into proof layer:
```typescript
proofObject["commitment"] = commitmentHex; // 32-byte hex string
```

#### 3.2 Ensure verification API handles OA mode certificates

Update `/api/verify-certificate` to:
1. Detect if incoming certificate uses OA format (check for `signature` field)
2. Use appropriate verifier (OA verifier for OA certs, native verifier for standard certs)
3. Return unified response schema with `"format": "opencerts" | "standard"` field


---

## Phase 4: Cross-Compatibility & Validation (Week 5 — Low Risk)

### Tasks

#### 4.1 Add OA-specific fields to standard mode (optional enhancement)

Add `_type` markers and OA contexts even in standard mode so the certificate can be parsed by OA tools while remaining valid for W3C verifiers.

> Per W3C VC spec, unknown `@context` URLs must be ignored if unreachable. Only add when both contexts are resolvable.

#### 4.2 Add validation script

Create `scripts/validate-opencerts.ts`:
```bash
pnpm run validate:opencerts <path-to-certificate.json>
```

#### 4.3 Add OpenAttestation revocation check to verification API

Wire existing `revokeCertificateOnChain()` into the OA verification result.


---

## Phase 5: Testing & Deployment (Week 6 — Controlled Rollout)

### Tasks

#### 5.1 Unit tests
- [ ] Test `buildVCPayload()` in both modes produces correct output
- [ ] Test OA wrapper builds correctly
- [ ] Test proof integration includes commitment
- [ ] Test backward compatibility (standard mode unchanged)

#### 5.2 Integration tests
- [ ] Issue an OA-mode certificate via `/api/certificates`
- [ ] Verify it with the OpenCerts reference verifier (https://verify.opencerts.me)
- [ ] Verify revocation is reflected correctly
- [ ] Test DID resolution still works

#### 5.3 Staging deployment
Deploy to staging, issue test certificates, validate with:
1. OpenCerts Verify frontend (`https://staging.verify.opencerts.me`)
2. TradeTrust verifier tools
3. W3C credential verification libraries (ensure standard certs still work)

#### 5.4 Production rollout
- [ ] Merge to main after staging validation passes
- [ ] Monitor error logs for both certificate types
- [ ] Update API documentation with `certificateType` parameter


---

## File Changes Summary

| File | Change Type | Phase |
|------|------------|-------|
| `lib/constants.ts` | Add/type constants | 1 |
| `lib/trustvc.ts` | New OA proof builder; modify `buildVCPayload` | 2 |
| `src/routes/certificates/*.ts` | Pass mode from request body | 2 |
| `src/services/document-store.ts` | Return commitment to caller | 3 |
| `src/services/trustvc.ts` (verify) | Detect OA vs standard format | 3 |
| `src/verify-certificate.ts` | Dual-mode verification logic | 3 |
| `scripts/validate-opencerts.ts` | New validation script | 4 |


---

## Risk Mitigation

### Risk: Breaking existing API consumers
**Mitigation**: `certificateType` is optional with `"standard"` default. No fields are removed from standard output.

### Risk: OA context URLs unreachable in production
**Mitigation**: Test all context URLs from the deployment environment before Phase 2. Have fallback/resolver URLs ready.

### Risk: Document Store commitment fails mid-flow
**Mitigation**: Keep current behavior where signing succeeds independently of document store commit. In OA mode, if commitment fails, fall back to standard format and log a warning.

### Risk: Dual-proof confusion for verifiers
**Mitigation**: In OA mode, remove the `proof` block entirely (do not keep both). The `signature` + `credentialSignature` fields serve as the proof.


---

## Acceptance Criteria for Full Migration

1. [ ] `/api/certificates` accepts `certificateType: "opencerts"` and returns valid OA certificate
2. [ ] Default behavior (`certificateType` omitted) produces identical output to pre-migration
3. [ ] OA-mode certificate validates against https://verify.opencerts.me
4. [ ] Standard-mode certificate still validates with native verification API
5. [ ] Document Store commitment is visible in OA proof layer
6. [ ] Revocation of OA certificates is reflected in verification result
7. [ ] All existing tests pass
8. [ ] New unit + integration tests added and passing

