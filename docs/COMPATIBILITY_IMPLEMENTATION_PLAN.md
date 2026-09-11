# Compatibility Implementation Plan

## Executive Summary

This document outlines the specific changes required to make certificates issued by Verifiable.sg compatible with external verifiers like TradeTrust and OpenCerts. The current implementation issues W3C Verifiable Credentials but lacks compatibility with these platforms due to format, proof structure, and DID resolution requirements.

## Current State Analysis

Based on analysis of `lib/trustvc.ts` and existing compatibility reports:

1. **Current Certificate Format**: Issues W3C Verifiable Credentials with DID-based signing using ecdsa-sd-2023 cryptosuite
2. **Issuer DID**: `did:web:verifiable.sg` 
3. **Proof Type**: `EthereumPersonalSignature2024`
4. **Key Gap**: Proof format doesn't match TradeTrust/OpenCerts requirements

## Required Changes

### 1. Proof Format Alignment

The current proof format `EthereumPersonalSignature2024` needs to be adjusted for compatibility:

**Current Implementation (in `lib/trustvc.ts`)**:
```typescript
proof: {
  type: "EthereumPersonalSignature2024",
  created: new Date().toISOString(),
  verificationMethod: walletAddress,
  proofPurpose: "assertionMethod",
  signedBy: walletAddress,
  signature,
}
```

**Required Changes**:
- For TradeTrust compatibility: Support `DataIntegrityProof` with `ecdsa-sd-2023` cryptosuite
- For OpenCerts compatibility: Ensure `ethereumSignedData` proof type when using blockchain anchoring

### 2. DID Resolution Endpoint Configuration

**Current Status**: 
- DID document published at `/.well-known/did.json`
- Missing `/jwks.json` endpoint for signature verification

**Required Changes**:
- Add `/.well-known/jwks.json` endpoint exposing public key
- Ensure proper DID document structure for external resolution

### 3. Credential Schema Alignment

**Current Status**:
- Uses standard W3C VC schema with embedded certificate subject context
- Missing OpenCerts-specific JSON-LD contexts

**Required Changes**:
- Add OpenCerts and TradeTrust JSON-LD contexts to credential `@context`
- Ensure proper certificate type definitions for external platforms

## Implementation Approach

### Phase 1: Proof Format Enhancement (Immediate)

Modify the signing process in `lib/trustvc.ts` to support both DID-based and Ethereum-based proof formats depending on verification requirements.

### Phase 2: DID Endpoint Integration

Add necessary endpoints for:
- `/.well-known/jwks.json` 
- Enhanced DID document with proper key exposure

### Phase 3: Schema Compatibility Layer

Implement a compatibility layer that can generate different credential formats based on the intended verifier.

## Technical Implementation Details

### 1. Proof Format Support in `signCredentialWithEcdsaSd2023`

The function should support generating proofs compatible with external verifiers by:
- Adding proper context for `DataIntegrityProof`
- Supporting `ecdsa-sd-2023` cryptosuite
- Ensuring compatibility with TradeTrust's verification requirements

### 2. DID Document Enhancement

Modify the DID document loader in `createTrustVCDocumentLoader()` to:
- Include proper key exposure for signature verification
- Ensure the document can be resolved by external verifiers

### 3. Certificate Generation Interface

Update the certificate generation process to support different output formats:
```typescript
// Current approach
export async function issueDIDCertificate(data: CertificateData)

// Enhanced approach for compatibility
export async function issueCompatibleCertificate(
  data: CertificateData,
  options?: {
    targetVerifier?: 'verifiable' | 'tradetrust' | 'opencerts'
    includeBlockchainAnchor?: boolean
  }
)
```

## Testing Strategy

1. **Unit Tests**: Verify different proof formats can be generated and verified
2. **Integration Tests**: Test certificate issuance through all supported paths
3. **External Verification**: Validate certificates with actual TradeTrust and OpenCerts verifiers
4. **Backward Compatibility**: Ensure existing Verifiable.sg verification continues to work

## Risk Assessment

- **Low Risk**: Proof format changes are additive and don't break existing functionality
- **Medium Risk**: DID endpoint changes require careful configuration
- **High Risk**: Blockchain anchoring integration requires significant infrastructure changes

## Success Criteria

1. Certificates issued can be verified by TradeTrust verifier at `https://tradetrust.io/verify`
2. Certificates issued can be verified by OpenCerts verifier at `https://opencerts.io/verify`
3. All existing Verifiable.sg functionality preserved
4. No performance degradation in certificate issuance
5. Minimal code changes required for external compatibility

## Timeline Estimate

- **Week 1**: Proof format enhancements and testing
- **Week 2**: DID endpoint integration and schema alignment  
- **Week 3**: Full compatibility testing and validation
- **Week 4**: Documentation updates and final review

## Next Steps

1. Implement proof format enhancement in `lib/trustvc.ts`
2. Add DID resolution endpoints to the application
3. Create compatibility test suite for external verification
4. Validate against actual TradeTrust and OpenCerts verifiers