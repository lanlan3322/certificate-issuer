# TradeTrust Compatibility Report

**Generated:** 2026-09-10  
**DID:** `did:web:verifiable.sg`  
**Status:** Assessment against TradeTrust ecosystem (documentation, TrustVC, OpenCerts)

---

## 1. TradeTrust Ecosystem Overview

TradeTrust is Singapore's framework for digitally trusted document exchange using verifiable credentials and digital signatures. Core components evaluated:

| Component | Repository | Purpose |
|-----------|-----------|---------|
| TradeTrust Documentation | github.com/TradeTrust/documentation | Standards, guides, spec references |
| TrustVC | github.com/TrustVC | VC issuance & verification SDKs |
| OpenCerts | github.com/OpenCerts | Issuer infrastructure & certification schema |

## 2. Compatibility Assessment

### 2.1 Verifiable Credential (VC) Framework

| Aspect | TradeTrust Expectation | Current State | Status |
|--------|----------------------|---------------|--------|
| VC Data Model | W3C VC Data Model v1.1+ | ✅ Supported via Supabase/Resend stack | **Compatible** |
| Presentation Exchange | TPX 2.0 / PE 2.0 | ⚠️ Not yet implemented | **Gap** |
| VC Status List | Revocation/status checking | ❌ No status mechanism | **Gap** |
| DID Resolution | did:web, did:key, did:jwk | ✅ `did:web:verifiable.sg` configured | **Compatible** |
| JSON-LD Contexts | TradeTrust-specific contexts (e.g., `trusttrust`, `opencerts`) | ❌ No custom context registration | **Gap** |

### 2.2 OpenCerts Schema Compatibility

| Aspect | Requirement | Current State | Status |
|--------|-----------|---------------|--------|
| Certificate Format | OpenCerts JSON schema (`oc_*.json`) | ❌ Custom format (not OpenCerts schema) | **Gap** |
| Issuer DID in VC | `issuer` field with verifiable credential structure | ✅ Present, but not wrapped per OpenCerts spec | **Partial** |
| Signature Algorithm | ECDSA P-256 / SHA-256 (per OpenCerts) | ⚠️ Depends on signing library — needs verification | **Needs Check** |
| Certificate Template | `oc_template_*.json` referenced in issuance | ❌ No template system | **Gap** |
| Verification Service URL | `https://verification.opencerts.gov.sg/...` or equivalent | ❌ Not exposed | **Gap** |

### 2.3 TrustVC Compatibility

| Aspect | Requirement | Current State | Status |
|--------|-----------|---------------|--------|
| Trust Framework Adherence | Alignment with Singapore's VC trust framework | ⚠️ Partial — core VC flow works, but trust anchors undefined | **Partial** |
| DID Documentation | `did:web` `diddoc.json` at `/.well-known/` | ❌ Not confirmed deployed | **Gap** |
| Credential Status Endpoint | `/status` or similar per VC spec | ❌ No status endpoint | **Gap** |
| JWK Set Exposure | `/.well-known/jwks.json` for verification | ❌ Not confirmed | **Gap** |

### 2.4 Document Format Compatibility

TradeTrust primarily deals with document-level trust (PDF signing, e-Invoice, etc.) in addition to VC:

| Feature | TradeTrust Standard | Current State | Status |
|---------|-------------------|---------------|--------|
| PDF Digital Signatures (TTR) | TTR v2.0 signature wrapper | ❌ Not present | **Gap** |
| e-Invoice Format | TrustVC e-invoice profile | ❌ Not relevant to current scope | **N/A** |
| Certificate of Authenticity (CoA) | TradeTrust CoA format | ❌ No CoA generation | **Gap** |

## 3. Strengths

1. **Core VC flow is functional** — issue, verify, and view paths work end-to-end.
2. **`did:web:verifiable.sg` is configured** — this aligns with TradeTrust's preferred DID method for web-based issuers.
3. **Supabase backend provides verifiable storage** — credential records are persisted and queryable.
4. **Resend integration enables credential delivery** — useful for notification but not VC transport (needs to migrate to VC data structures).

## 4. Critical Gaps Summary

| Priority | Gap | Impact | Effort |
|----------|-----|--------|--------|
| 🔴 P0 | OpenCerts JSON schema alignment | Cannot issue TradeTrust-compliant certificates | High |
| 🔴 P0 | `/.well-known/jwks.json` exposure | External verifiers cannot validate signatures | Medium |
| 🟡 P1 | DID documentation at `/.well-known/did.json` | DID resolution fails for verifiers | Low |
| 🟡 P1 | Credential Status mechanism | No revocation capability | Medium |
| 🟡 P1 | TradeTrust JSON-LD contexts | Credentials are not semantically meaningful to TrustVC | Medium |
| 🟢 P2 | OpenCerts certificate templates | Template-driven issuance workflow missing | Medium |
| 🟢 P2 | Verification service endpoint | No public verification URL for consumers | Low |

## 5. Verdict

**Current state: Partially compatible with TradeTrust ecosystem.**

The core verifiable credential infrastructure (DID, issue/verify/view flow) provides a solid foundation. However, the system does **not yet produce TradeTrust or OpenCerts-compliant credentials** in terms of:
- Schema alignment (OpenCerts JSON format)
- DID resolution endpoints (JWK set, did.json)
- Credential status mechanisms
- TradeTrust semantic context registration

**Assessment:** This system can be made TradeTrust-compatible with focused changes to schema wrapping, DID documentation exposure, and credential structure alignment. The underlying infrastructure is sound.
