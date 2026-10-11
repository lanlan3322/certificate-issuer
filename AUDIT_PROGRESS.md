# credentialStatus Compatibility Audit

**Completed:** 11/10/2026  
**Scope:** `trustvc.ts` + `constants.ts` — OA v2 / OpenCerts verifier compatibility

## Summary

The codebase primarily uses `OpenAttestationDocumentStore` as the credentialStatus type with `did:ethr` contract references, which is **mostly compatible** with TradeTrust/OpenCerts standards. However, there is one notable gap that may cause external verifiers to fail status checks.

### Overall Verdict
| Category | Result |
|----------|--------|
| credentialStatus type & structure | ✅ PASS |
| DID-based identity proof pattern | ✅ PASS |
| targetHash injection (credentialStatus[0]) | ✅ PASS |
| targetHash read path (dual-source) | ✅ PASS |
| Hash algorithm (keccak256) | ✅ PASS |
| Internal verify flow | ✅ PASS |
| stripUnsupportedCredentialStatus array handling | ⚠️ NEEDS FIX |

### Key Findings (One Remaining Fix)
1. **stripUnsupportedCredentialStatus doesn't handle array-form credentialStatus** — tradetrust.io statusListCredential objects in arrays pass through unstripped. Fix: iterate array elements before returning.

---

## 3. credentialStatus Compatibility Audit

### 3.1 Overview of credentialStatus Handling

The codebase uses OpenAttestationDocumentStore as the primary credentialStatus type for both signing and verification pipelines. This section audits its compatibility with TradeTrust/OpenCerts standards.

### 3.2 credentialStatus Construction (buildVCPayload — line ~393)

```typescript
credentialStatus: [
  {
    id: `did:ethr:0x${DOCUMENT_STORE_CONFIG.address}#${data.id}`,
    type: "OpenAttestationDocumentStore",
    documentId: data.id,
    revocation: TRUSTVC_CONFIG.revocation,
  },
],
```

**TradeTrust/OpenCerts Compatibility:** `✅ PASS`

- **Type value (`OpenAttestationDocumentStore`):** Correct. This is the standard OA v2 type name that verifiers recognize.
- **id format (`did:ethr:<contract>#<docId>`):** Aligns with the DID-based identity proof pattern recommended by OpenCerts. The verifier resolves `did:ethr:<contract>` → fetches on-chain ABI → calls `status(docId, targetHash)`.
- **documentId field:** Present and correctly populated from `data.id`. This matches the OA v2 schema requirement.

### 3.3 credentialStatus Verification Flow (verifyCredential — line ~1085)

#### 3.3.1 The stripUnsupportedCredentialStatus Filter (line ~940)

The function strips credentialStatus references pointing to `tradetrust.io/status` before verification to prevent crashes in w3cIssuerIdentity. However:

| Concern | Severity | Notes |
|---------|----------|-------|
| **Array check returns early** | ⚠️ MEDIUM | If credentialStatus is an array, the entire function returns the original document without stripping. The tradetrust.io check only applies to object forms. If a credential has `credentialStatus: [{statusListCredential: "...tradetrust.io/..."}]`, it will NOT be stripped. |
| **Hardcoded tradetrust.io domain** | ⚠️ LOW | Only strips `tradetrust.io/status` specifically. Other TradeTrust verifiable registry endpoints are not handled. |

**Recommendation:** Update the array check to also inspect array elements:

```typescript
if (!credentialStatus || Array.isArray(credentialStatus)) {
  if (Array.isArray(credentialStatus) && credentialStatus.length > 0) {
    const stripped = credentialStatus.filter((s: unknown) => {
      if (typeof s === "object" && s !== null) {
        const slc = (s as Record<string, unknown>)["statusListCredential"];
        return !(typeof slc === "string" && slc.includes("tradetrust.io/status"));
      }
      return true;
    });
    if (stripped.length < credentialStatus.length) {
      const { credentialStatus: _, ...rest } = document;
      return stripped.length > 0 ? { ...rest, credentialStatus: stripped } : { ...rest };
    }
  }
  return document;
}
```

### 3.4 targetHash Injection — Injected Correctly ✅

The signing flow calls `injectTargetHash()` after both `signCredentialWithEcdsaSd2023` and `issueDIDCertificate`. This function:

1. Strips existing proofs from the signed credential
2. Computes keccak256(canonicalJson(strippedCredential))
3. Writes to `credentialStatus[0].targetHash` (not `credential.signature.targetHash`)

The verification path (`getWrappedTargetHash`, line ~1585) supports **dual-source reading**:

```typescript
// Reads from credential.signature.targetHash first (legacy / internal use)
const targetHash = (signature as Record<string, unknown>)["targetHash"];

// Falls back to credentialStatus[0].targetHash for OA v2 compatibility
if (!targetHash && Array.isArray(credentialStatus)) {
  const csTargetHash = credentialStatus[0]?.["targetHash"];
}
```

| Area | Status | Notes |
|------|--------|-------|
| Hash algorithm (keccak256) | ✅ PASS | Correct for OA v2 |
| targetHash injection location | ✅ PASS | `credentialStatus[0].targetHash` — standard compliant |
| targetHash read path | ✅ PASS | Dual-source (signature + credentialStatus fallback) |
| Bytes32 hex validation | ✅ PASS | Proper 0x-prefixed 64-char regex |

**No changes needed for targetHash.** The earlier finding was corrected after confirming the `injectTargetHash` call chain.

### 3.5 DID Document and Proof Format

**DID Document:** Uses W3C DID 1.0 + Multikey encoding — standard and correct.

**Proof cryptosuite (ecdsa-sd-2023):** This is a modern W3C VC Data Integrity Proof standard. Compatibility:
- ✅ TrustVC / modern W3C VC verifiers
- ⚠️ OpenCerts Checker v3+ (may require configuration)
- ❌ Legacy TradeTrust tt-verify < v2

### 3.6 Summary of Findings

| area | status | severity | notes |
|------|--------|----------|-------|
| credentialStatus type value | ✅ PASS | — | `OpenAttestationDocumentStore` is correct |
| credentialStatus id format | ✅ PASS | — | `did:ethr:<contract>#<docId>` aligns with oa v2 |
| credentialStatus array structure | ✅ PASS | — | matches w3c vc + oa expectations |
| revocation field compatibility | ⚠️ TBD | LOW | depends on `TRUSTVC_CONFIG.revocation` value |
| stripUnsupportedCredentialStatus array handling | ⚠️ MEDIUM | array-form tradetrust.io status not stripped | see 3.3 for fix |
| targetHash location (credentialStatus vs signature) | ✅ PASS | — | injected correctly via `injectTargetHash()` |
| targetHash read path | ✅ PASS | — | dual-source fallback in `getWrappedTargetHash` |
| DID document format | ✅ PASS | — | w3c did 1.0 + Multikey standard |
| proof cryptosuite (ecdsa-sd-2023) | ⚠️ LOW | legacy verifiers may not recognize | document supported versions |

## Next Steps
1. Review `TRUSTVC_CONFIG.revocation` value for OA compatibility
2. Fix array handling in stripUnsupportedCredentialStatus (only remaining fix)
3. Cross-reference against latest TradeTrust/OpenCerts specification documents