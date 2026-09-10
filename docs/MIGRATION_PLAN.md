# Migration Plan: TradeTrust & OpenCerts Compatibility

**Generated:** 2026-09-10  
**DID:** `did:web:verifiable.sg`  
**Phase:** Migration from generic VC issuance to ecosystem-compliant certification

---

## Executive Summary

The current certificate issuer provides a functional verifiable credential issuance, verification, and presentation flow. To achieve TradeTrust and OpenCerts compliance, the following migration work is required, organized into four phases.

**Total estimated effort: 6–10 weeks** (depending on Ethereum infrastructure decisions)

---

## Phase 1: DID Resolution Infrastructure (Week 1)

### Objectives
- Make `did:web:verifiable.sg` resolvable by external verifiers
- Expose cryptographic material for signature verification

### Tasks

| # | Task | Output | Priority |
|---|------|--------|----------|
| 1.1 | Deploy `/.well-known/did.json` | Valid DID Document per W3C DID Core spec | 🔴 P0 |
| 1.2 | Deploy `/.well-known/jwks.json` | JWK Set containing issuer signing keys (public) | 🔴 P0 |
| 1.3 | Add `verificationMethod` to DID Doc | Links JWKs to verification methods (ecdsaSecp256k1VerificationKey2019 or ed25519VerificationKey2020) | 🔴 P0 |
| 1.4 | Add `service` endpoint for OpenCerts verification | `https://verifiable.sg/verify` with type `OpenCertsVerificationService2021` | 🟡 P1 |

**Dependencies:** DNS control over `verifiable.sg` domain, Vercel (or equivalent) deployment capability.

**Risk:** If DNS is not controllable, consider switching to `did:key` or migrating to a TradeTrust-recognized DID method.

---

## Phase 2: Credential Format Alignment (Weeks 2–3)

### Objectives
- Produce credentials in OpenCerts-compatible format
- Register TradeTrust JSON-LD contexts

### Tasks

| # | Task | Output | Priority |
|---|------|--------|----------|
| 2.1 | Define certificate output schema aligned with `oc_certificate_v3.json` | Mapped credential type replacing current custom schema | 🔴 P0 |
| 2.2 | Wrap credential output in JSON-LD with OpenCerts contexts | `@context` including `https://opencerts.github.io/contexts/opencerts/v1.jsonld` | 🔴 P0 |
| 2.3 | Map current VC fields to OpenCerts template fields (`issuer`, `certificationBody`, `courseMetadata`, etc.) | Field mapping document + migration adapter code | 🟡 P1 |
| 2.4 | Register JSON-LD contexts at a hosted location | TradeTrust and OpenCerts custom context files hosted publicly | 🟢 P2 |
| 2.5 | Implement `oc_template_v3.json` template system | Template definitions for each certificate type | 🟡 P1 |

**Dependencies:** OpenCerts v3 schema reference document (from github.com/OpenCerts). Schema decisions must be aligned with TradeTrust documentation team if interoperability is a requirement.

---

## Phase 3: Blockchain Anchoring (Weeks 4–6)

### Objectives
- Anchor issuer identity on Ethereum/Polygon for OpenCerts compliance
- Generate `ethereumSignedData` proof type

### Tasks

| # | Task | Output | Priority |
|---|------|--------|----------|
| 3.1 | Deploy IssuerRegistry smart contract | Contract anchoring DID → public key mapping on-chain | 🔴 P0 |
| 3.2 | Deploy CertificateRegistry smart contract | On-chain certificate hash anchoring (optional, for audit trail) | 🟡 P1 |
| 3.3 | Implement Ethereum wallet management | Secure keystore, signing service for `ethereumSignedData` proof | 🔴 P0 |
| 3.4 | Update issuance flow to produce `ethereumSignedData` proof type | Proof object includes `contractAddress`, `transactionHash`, `signature` | 🔴 P0 |
| 3.5 | Configure Ethereum RPC endpoint (Infura/Alchemy or self-hosted) | Connection to target chain (Polygon recommended for cost efficiency) | 🟡 P1 |

**Dependencies:**
- Ethereum/Polygon network access (testnet first, then mainnet)
- Gas budget for contract deployment (~$200–$500 depending on network and gas prices)
- Wallet security infrastructure (HSM or secure key management)

**Risk:** This is the highest-effort, highest-risk phase. OpenCerts strictly requires Ethereum contract anchoring. Without it, credentials are **not OpenCerts-compliant**. Alternative: negotiate with TradeTrust about DID-web-only compliance for specific use cases.

---

## Phase 4: Verification Service & Compliance (Weeks 7–8+)

### Objectives
- Expose verification endpoints matching OpenCerts/TradeTrust expectations
- Implement credential status mechanism
- Complete integration testing against reference verifiers

### Tasks

| # | Task | Output | Priority |
|---|------|--------|----------|
| 4.1 | Deploy `/verify` endpoint returning OpenCerts validation result | Returns `{ "valid": true/false, "certificate": {...} }` with trust chain details | 🔴 P0 |
| 4.2 | Implement hash-based certificate retrieval (`/certificate/:hash`) | GET returns the full certificate JSON by its content hash | 🟡 P1 |
| 4.3 | Add credential status list / revocation endpoint | Per VC Status List 2021 spec, or OpenCerts-specific revocation API | 🟡 P1 |
| 4.4 | Integration testing against TradeTrust reference verifier | Verification success against `https://verification.opencerts.gov.sg/...` or equivalent | 🔴 P0 |
| 4.5 | Integration testing against OpenCerts example verifier | Verify sample certificate against official test vectors | 🟡 P1 |
| 4.6 | Documentation: Issuer onboarding guide for external parties | How others can verify credentials issued by `did:web:verifiable.sg` | 🟢 P2 |
| 4.7 | Compliance review against TradeTrust documentation | Formal gap closure check per github.com/TradeTrust/documentation | 🟢 P2 |

---

## Recommended Migration Strategy

### Option A: Full OpenCerts Compliance (Recommended for national interoperability)

```
DID Infrastructure → Schema Alignment → Ethereum Anchoring → Verification Service → Compliance Review
    (1 week)          (2 weeks)           (3 weeks)            (2 weeks)           (1-2 weeks)
                                                        Total: ~9-10 weeks
```

**Best when:** Interoperability with Singapore's national credential ecosystem is a requirement.

### Option B: TradeTrust VC Path (Faster, partial OpenCerts gap)

```
DID Infrastructure → JSON-LD Contexts → Verification Service → Compliance Review
    (1 week)          (1 week)              (2 weeks)            (1-2 weeks)
                                                    Total: ~5-6 weeks
```

**Best when:** VC-based TradeTrust compatibility is sufficient without OpenCerts certificate format. Skips Ethereum anchoring entirely.

### Option C: Hybrid (Incremental)

1. **Sprint 1-2:** Complete Phases 1–2 (DID infrastructure + schema alignment) — produces TradeTrust VC-compatible credentials
2. **Sprint 3:** Evaluate whether Ethereum anchoring is required based on stakeholder feedback
3. **Sprint 4+:** Add OpenCerts blockchain anchoring only if confirmed necessary

**Best when:** Timeline pressure exists and stakeholder requirements are not yet finalized.

---

## Architecture Changes Required

### Current → Target

```
CURRENT:                              TARGET:
┌─────────────┐                      ┌─────────────┐
│  Supabase   │                      │  Supabase   │
│  (VC store) │                      │  (VC store) │
└──────┬──────┘                      └──────┬──────┘
       │ issuance                           │ issuance
       ▼                                    ▼
┌─────────────┐              Ethereum      ┌─────────────┐
│ Generic VC  │────signing─────────▶│ Smart Contract  │
│   format    │                      │ (IssuerReg)   │
└──────┬──────┘                      └─────────────┘
       │ verification                     ▲
       ▼                                  │
┌─────────────┐              Ethereum      ┌─────────────┐
│ Custom      │←──verify──────────│ CertificateHash  │
│ verifier    │                    │ (opt. registry) │
└─────────────┘                      └─────────────┘

       ║                                ║
       ▼                                ▼
┌─────────────────────────────────────────────────┐
│          OpenCerts-compliant Certificate         │
│  { @context, issuer (on-chain), proof (ethSignedData),  │
│    certMetadata, validFrom/To, etc. }            │
└─────────────────────────────────────────────────┘
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| DNS cannot be configured for `verifiable.sg` `.well-known/` endpoints | Cannot resolve DID — blocks everything | Migrate to `did:key:zQ3s...` or acquire domain with DNS control |
| Ethereum gas costs spike during migration period | Increased operational cost | Use Polygon (MATIC) network; deploy on testnet first |
| OpenCerts schema evolves before migration completes | Re-work required | Pin version number in migration plan; monitor OpenCerts releases |
| TradeTrust requirements not finalized | Scope creep during Phase 4 | Lock scope with stakeholder sign-off before starting Phase 1 |
| Ethereum key compromise | Credential revocation emergency | Implement key rotation procedure in design phase; use HSM for production |

---

## Success Criteria

### Minimum Viable Compliance (TradeTrust VC)
- [ ] `did:web:verifiable.sg` resolves via `/.well-known/did.json`
- [ ] JWK set is publicly accessible at `/.well-known/jwks.json`
- [ ] Credentials include TradeTrust JSON-LD contexts
- [ ] Verification against reference verifier succeeds

### Full Compliance (OpenCerts + TradeTrust)
- [ ] Issuer identity anchored on Ethereum/Polygon smart contract
- [ ] All certificates in `oc_certificate_v3.json` schema format
- [ ] Proofs use `ethereumSignedData` type
- [ ] Verification service returns valid trust chain for issued certificates
- [ ] Certificate revocation mechanism operational
- [ ] Integration test passes against TradeTrust reference verifier

---

## Next Steps

1. **Decide migration path:** Option A (full), Option B (VC-only), or Option C (incremental)
2. **Confirm DNS control** over `verifiable.sg` for DID resolution
3. **Lock stakeholder requirements** — confirm whether Ethereum anchoring is mandatory
4. **Provision environments** — testnet access, domain DNS management
5. **Begin Phase 1 immediately** if going with Options A or C
