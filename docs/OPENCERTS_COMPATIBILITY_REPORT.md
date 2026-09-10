# OpenCerts Compatibility Report

**Generated:** 2026-09-10  
**DID:** `did:web:verifiable.sg`  
**Status:** Assessment against OpenCerts specification and issuer infrastructure

---

## 1. OpenCerts Framework Summary

OpenCerts is an open-source issuance framework maintained under the [TrustVC/OpenCerts](https://github.com/OpenCerts) ecosystem for Singapore's national credential infrastructure. It defines:

- **Certificate Schema**: `oc_certificate_<version>.json` (JSON-LD wrapped)
- **Template Schema**: `oc_template_<version>.json` (defines issuance fields)
- **Issuer Contract**: Ethereum-based smart contract anchoring issuer DID
- **Verification Service**: Public endpoint for certificate validation

## 2. Compatibility Assessment

### 2.1 OpenCerts Certificate Format

| Requirement | OpenCerts Spec | Current State | Status |
|------------|---------------|---------------|--------|
| `oc_cert` prefix in filename | Mandatory (e.g., `oc_certificate_v2.json`) | ❌ No such convention | **Gap** |
| JSON-LD wrapped content | Required with `@context` including OpenCerts contexts | ❌ Standard JSON VC format only | **Gap** |
| `issuer` field | Ethereum contract address or DID URL | ⚠️ DIDs configured, but not as Ethereum contract ref | **Partial** |
| `certificationBody` / `issuingInstitution` | Required in template-driven schema | ❌ Not mapped | **Gap** |
| `courseMetadata` | Standard field in OpenCerts v2/v3 certificates | ❌ Custom fields only | **Gap** |
| `validFrom` / `validTo` | ISO 8601 date fields | ✅ Present in standard VC structure | **Compatible** |
| `proof` (signature) | ECDSA-SecP256k1 signature with `ethereumSignedData` | ⚠️ Signature works, but proof format not OpenCerts-specific | **Partial** |

### 2.2 OpenCerts Template System

| Requirement | OpenCerts Spec | Current State | Status |
|------------|---------------|---------------|--------|
| `oc_template_v3.json` | Mandatory template defining issuance schema | ❌ No template system | **Gap** |
| Template-driven field mapping | Issuer must map user input → template fields | ❌ Custom issuer model | **Gap** |
| Schema validation at issue time | JSON schema enforcement on templates | ⚠️ Supabase validates, but not OpenCerts schema | **Partial** |

### 2.3 Ethereum Contract Anchoring

| Requirement | OpenCerts Spec | Current State | Status |
|------------|---------------|---------------|--------|
| Issuer smart contract | Required for DID anchoring (Ethereum mainnet/polygon) | ❌ No blockchain integration | **Gap** |
| Contract verification in `proof` | `ethereumSignedData` proof type with `contractAddress`, `transactionHash` | ❌ Proof not blockchain-anchored | **Gap** |
| Contract registry lookup | `IssuerRegistry.sol` for resolving issuer DID | ❌ No smart contract infrastructure | **Gap** |

### 2.4 Verification Service Compatibility

| Requirement | OpenCerts Spec | Current State | Status |
|------------|---------------|---------------|--------|
| `/verify` endpoint | Public verification endpoint returning validation result | ⚠️ Verify works internally, but not exposed as OpenCerts verification service | **Partial** |
| Certificate retrieval by hash | `GET /certificate/:hash` returning certificate JSON | ❌ No hash-based retrieval | **Gap** |
| Trust chain validation | Validates issuer contract → DID → signature chain | ❌ No trust chain verification | **Gap** |

### 2.5 Issuer Wallet & Key Management

| Requirement | OpenCerts Spec | Current State | Status |
|------------|---------------|---------------|--------|
| Ethereum wallet (EOA) for signing | Private key management for issuance | ⚠️ DIDs configured, but EOA wallet not confirmed | **Needs Check** |
| Keystore file format | `keystore` JSON encrypted with passphrase | ❌ Unknown current key storage mechanism | **Gap** |
| Key rotation policy | Documented procedure per OpenCerts guidelines | ❌ Not documented | **Gap** |

## 3. Strengths

1. **DID-based issuer identity is established** — `did:web:verifiable.sg` can be aligned with OpenCerts DID anchoring if Ethereum infrastructure is added.
2. **Signature mechanism works** — certificate issuance and verification paths are operational; the crypto layer is sound.
3. **Certificate lifecycle management** — issue, verify, view flow maps conceptually to OpenCerts certificate lifecycle.
4. **Supabase data model** — credential records are persistently stored and queryable, which can be adapted for OpenCerts storage patterns.

## 4. Critical Gaps Summary

| Priority | Gap | Impact | Effort |
|----------|-----|--------|--------|
| 🔴 P0 | Ethereum smart contract anchoring | Cannot produce blockchain-anchored OpenCerts certificates | High |
| 🔴 P0 | `ethereumSignedData` proof format | Signatures not verifiable by OpenCerts verifier | High |
| 🟡 P1 | Template schema alignment (`oc_template_v3.json`) | No template-driven issuance | Medium |
| 🟡 P1 | JSON-LD context with OpenCerts vocabularies | Credentials are opaque to OpenCerts parsers | Medium |
| 🟡 P1 | Public verification service (hash-based retrieval) | Cannot integrate with national verification infrastructure | Medium |
| 🟢 P2 | Certificate filename convention (`oc_cert*`) | Minor compliance for file naming | Low |
| 🟢 P2 | Ethereum wallet keystore management | Key rotation and recovery procedures needed | Medium |

## 5. Verdict

**Current state: Not OpenCerts-compatible.**

The certificate issuer is a functional VC issuance system, but it does **not produce OpenCerts-formatted certificates**. The primary blockers are:

1. **No Ethereum blockchain integration** — OpenCerts requires smart contract anchoring for issuer identity and proof generation.
2. **Certificate format mismatch** — the output JSON structure does not follow OpenCerts schema templates.
3. **Proof format non-compliant** — signatures use generic VC proof format, not `ethereumSignedData`.

**Assessment:** Full OpenCerts compatibility requires adding Ethereum infrastructure (smart contracts, wallet management) and restructuring certificate output to match OpenCerts template schemas. This is a structural change, not a cosmetic one. The issuer framework can be extended to support this, but it represents significant architectural work rather than incremental configuration changes.
