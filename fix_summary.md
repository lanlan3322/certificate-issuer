# Fix Summary: Safe Mode Validation Error in Certificate Issuer

## Issues Addressed

1. **"Safe mode validation error" during credential signing**
2. **""id" is a defined field and should not be set by the user" error**
3. **"Dereferencing a URL did not result in a valid JSON-LD object" for OpenCerts context**

## Root Cause

The primary issue was an incorrect OpenCerts context URL in the `buildVCPayload` function:
- **Incorrect**: `"https://www.opencerts.io/schema/context/opencerts_v2.json"`
- **Correct**: `"https://www.opencerts.io/schema/context/v2.json"`

This caused the JSON-LD processor to fail when trying to dereference the context, triggering the validator's safe mode.

## Changes Made

### File: `/Users/elc-laurence/Desktop/Laurence/eSystem/certificate-issuer/lib/trustvc.ts`

#### In the `buildVCPayload` function:

1. **Fixed OpenCerts Context URL**
   ```diff
   - "https://www.opencerts.io/schema/context/opencerts_v2.json"
   + "https://www.opencerts.io/schema/context/v2.json"
   ```

2. **Restored Proper Credential Type**
   ```diff
   - type: ["VerifiableCredential"],
   + type: ["VerifiableCredential", "OpenAttestationCredential"],
   ```

3. **Restored Issuer as Object**
   ```diff
   - issuer: TRUSTVC_CONFIG.didUrl,
   + issuer: {
   +   id: TRUSTVC_CONFIG.didUrl,
   +   type: "OpenAttestationIssuer",
   +   name: data.issuerName,
   + },
   ```

4. **Preserved Fixes from Previous Work**
   - Removed manually set `id` field at credential root (prevents "defined field" error)
   - Maintained proper credentialSubject structure
   - Kept credentialStatus for revocation checking
   - Preserved issuingMethods for Document Store integration

## Current Credential Structure

The fixed `buildVCPayload` function now produces credentials with this structure:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/security/data-integrity/v2",
    "https://www.opencerts.io/schema/context/v2.json"
  ],
  "type": ["VerifiableCredential", "OpenAttestationCredential"],
  "issuanceDate": "<date>",
  "validFrom": "<date>",
  "validUntil": "<date>",
  "credentialSubject": {
    "type": ["Person"],
    "name": "<recipientName>",
    "email": "<recipientEmail>",
    "certificateType": "<certificateType>",
    "description": "<description>"
  },
  "issuer": {
    "id": "<didUrl>",
    "type": "OpenAttestationIssuer",
    "name": "<issuerName>"
  },
  "credentialStatus": {
    "id": "https://tradetrust.io/status/<credentialId>#list",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "0",
    "statusListCredential": "https://tradetrust.io/status/credentials/statuslist-1"
  },
  "issuingMethods": [<methods>]
}
```

## Verification

This fix addresses all three reported issues:
1. ✅ Correct context URL prevents JSON-LD dereferencing failures
2. ✅ Proper credential structure eliminates "defined field" errors
3. ✅ OpenAttestation v2 compliance ensures proper specification adherence

The credential should now successfully pass through the TrustVC SDK's validation pipeline without triggering safe mode restrictions.